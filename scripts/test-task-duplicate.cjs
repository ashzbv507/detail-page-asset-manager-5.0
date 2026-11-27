const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');

function compile(source, filename) {
  return ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename);
const route = require('../app/api/tasks/route.ts');
const { duplicateTaskSeed, duplicateTaskContentKey, DUPLICATE_TASK_MESSAGE } = require('../app/lib/task-duplicate.ts');
const { taskDuplicatePath, TASK_CONFLICT_COLUMNS } = require('../app/lib/task-identity.ts');
const { BRAND_KEYS } = require('../app/lib/task-types.ts');
const keys = TASK_CONFLICT_COLUMNS.split(',');
const sameIdentity = (a,b) => keys.every(k => JSON.stringify(a[k] ?? (k === 'vendors' ? [] : '')) === JSON.stringify(b[k] ?? (k === 'vendors' ? [] : '')));
const post = body => route.POST(new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify(body) }));

function database(t, options = {}) {
  const old = [process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY];
  process.env.SUPABASE_URL = 'https://duplicate-db.invalid'; process.env.SUPABASE_SECRET_KEY = 'test-only';
  t.after(() => { for (const [i,k] of ['SUPABASE_URL','SUPABASE_SECRET_KEY'].entries()) { if(old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; } });
  const db = { rows: [], writes: [], requests: [] };
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    assert.equal(new URL(url).origin, 'https://duplicate-db.invalid');
    const params = new URL(url).searchParams, method = init.method ?? 'GET';
    db.requests.push({ method, params, prefer: init.headers?.Prefer });
    if (method === 'GET' && params.get('select') === 'id') {
      return Response.json(db.rows.filter(row => {
        const p = new URL(taskDuplicatePath(row), 'https://duplicate-db.invalid').searchParams;
        return keys.filter(k=>k!=='note').every(k=>p.get(k)===params.get(k)) && (params.has('or') ? !row.note : p.get('note')===params.get('note'));
      }).slice(0,1).map(({id})=>({id})));
    }
    if (method === 'POST') {
      const entries = JSON.parse(init.body);
      if (options.fail) return Response.json({ code:'XX000' }, { status:500 });
      if (options.missingIndex && params.has('on_conflict')) return Response.json({ code:'42P10' }, { status:400 });
      if (params.has('on_conflict')) {
        assert.equal(params.get('on_conflict'), TASK_CONFLICT_COLUMNS);
        assert.equal(init.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
      }
      if (options.race) {
        db.rows.push({ ...entries[0], id: randomUUID(), detail_html:'concurrent owner' });
        if(options.race === '23505') return Response.json({code:'23505'}, {status:409});
      }
      const inserted = [];
      for (const entry of entries) {
        if(db.rows.some(row=>sameIdentity(row,entry))) continue;
        db.rows.push(entry); inserted.push(entry);
      }
      if(inserted.length) db.writes.push({ method, rows: inserted });
      return Response.json(inserted);
    }
    assert.fail(`Unexpected DB operation: ${method}`);
  });
  return db;
}

function source(brand) {
  return { id: randomUUID(), brand_key:brand, product_name:'원본 제품', item_name:'차렵이불', option_name:'보라 단독',
    vendors:['컬리 ONLY','29cm ONLY'], note:'원본', store_link:'https://store.test/product',
    image_urls:['https://original.test/custom/B.jpg?token=keep#kurly-only','https://original.test/custom/A.jpg#kurly-excluded'],
    detail_html:'  <div class="manual"><img src="https://original.test/custom/A.jpg"></div>\n', kurly_enabled:false,
    thumbnail_nas:'https://drive.test/thumb', detail_nas:'/상세/원본', shooting_nas:'/촬영/원본' };
}
function payload(row, extras = {}) {
  return { brandKey:row.brand_key, productName:row.product_name, itemName:row.item_name, optionName:row.option_name,
    vendors:[...row.vendors], note:row.note, storeLink:row.store_link, detailHtml:row.detail_html, kurlyEnabled:row.kurly_enabled,
    thumbnailNas:row.thumbnail_nas, detailNas:row.detail_nas, shootingNas:row.shooting_nas,
    imageUrls:[...row.image_urls], ...extras };
}

test('form seed omits source ID and copies mutable data without renaming or losing metadata', () => {
  const original = { id:'source', product:'제품', vendors:['컬리 ONLY'], html:'manual', kurlyEnabled:false, images:[{id:'source-image-1',name:'A.jpg',url:'https://test/A.jpg',htmlTarget:'kurly'}] };
  const before = structuredClone(original), seed = duplicateTaskSeed(original);
  assert(!Object.hasOwn(seed,'id')); assert.equal(seed.product,'제품');
  assert.equal(seed.images[0].url, original.images[0].url); assert.equal(seed.images[0].htmlTarget,'kurly');
  assert.equal(seed.html,'manual'); assert.equal(seed.kurlyEnabled,false);
  seed.vendors.push('29cm ONLY'); seed.images[0].name = 'changed';
  assert.deepEqual(original,before);
  assert(!JSON.stringify(seed).includes('source-image-1'));
});

for (const brand of BRAND_KEYS) test(`${brand}: duplicates cannot overwrite; changing item or note creates a new ID with reused content`, async t => {
  const db = database(t), original = source(brand); db.rows.push(original);
  const before = structuredClone(original), body = payload(original);
  for (const changes of [{}, { detailHtml:'HTML만 변경' }]) {
    const response = await post({ mode:'duplicate', task:{...body,...changes} });
    assert.equal(response.status,409); assert.deepEqual(await response.json(),{error:DUPLICATE_TASK_MESSAGE,code:'DUPLICATE_TASK'});
    assert.equal(db.rows.length,1); assert.equal(db.writes.length,0);
  }
  const itemCopy = await post({ mode:'duplicate', task:{...body,itemName:'베개커버'} });
  assert.equal(itemCopy.status,200); const a = (await itemCopy.json()).tasks[0]; assert.notEqual(a.id,original.id);
  assert.equal(a.kurlyEnabled,false); assert.equal(a.detailHtml,original.detail_html);
  for(const key of ['thumbnailNas','detailNas','shootingNas','optionName','storeLink','vendors']) assert.deepEqual(a[key],body[key]);
  assert.deepEqual(db.rows[1].image_urls,original.image_urls);
  const imageCopy = await post({ mode:'duplicate', task:{...body,note:'다른 버전',detailHtml:'manual version 2',imageUrls:undefined,images:[
    {id:'local-1',name:'B.jpg',url:'https://original.test/custom/B.jpg?token=keep',htmlTarget:'kurly'},
    {id:'local-2',name:'A.jpg',url:'https://original.test/custom/A.jpg',htmlTarget:'general'},
  ]} });
  assert.equal(imageCopy.status,200); const b = (await imageCopy.json()).tasks[0];
  assert.notEqual(b.id,a.id); assert.equal(b.detailHtml,'manual version 2');
  assert.deepEqual(db.rows[2].image_urls,original.image_urls);
  assert.deepEqual(db.rows[0],before);
  assert(db.requests.filter(r=>r.method==='POST').every(r=>r.params.get('on_conflict')===TASK_CONFLICT_COLUMNS));
});

test('duplicate mode rejects source IDs, overwrite, bulk merge and PATCH before any DB call', async t => {
  const db = database(t), original = source('amante'), body = payload(original); db.rows.push(original);
  for(const extra of [{overwrite:true},{task:{...body,id:original.id}},{tasks:[body]}]) {
    assert.equal((await post({mode:'duplicate',task:body,...extra})).status,400);
  }
  const response = await route.PATCH(new Request('http://localhost/api/tasks?id='+original.id,{method:'PATCH',body:JSON.stringify({mode:'duplicate',task:body})}));
  assert.equal(response.status,400); assert.equal(db.requests.length,0); assert.equal(db.rows.length,1);
});

for (const race of ['ignore','23505']) test(`late duplicate (${race}) leaves the winning row intact`, async t => {
  const db = database(t,{race}); const response = await post({mode:'duplicate',task:payload(source('amante'))});
  assert.equal(response.status,409); assert.equal((await response.json()).error,DUPLICATE_TASK_MESSAGE);
  assert.equal(db.rows.length,1); assert.equal(db.rows[0].detail_html,'concurrent owner'); assert.equal(db.writes.length,0);
});

for (const options of [{fail:true},{missingIndex:true}]) test(`failed duplicate save is non-mutating: ${JSON.stringify(options)}`, async t => {
  const db = database(t,options), original = source('amante'); db.rows.push(original); const before = structuredClone(db.rows);
  const response = await post({mode:'duplicate',task:payload(original,{note:'새 항목'})});
  assert.equal(response.status, options.missingIndex ? 503 : 502); assert.deepEqual(db.rows,before); assert.equal(db.writes.length,0);
});

test('duplicate UI labels, shared read-only boundary and inline error layout are explicit', () => {
  const source = fs.readFileSync(path.join(__dirname,'../app/page.tsx'),'utf8');
  const shared = fs.readFileSync(path.join(__dirname,'../app/share/[token]/ShareViewer.tsx'),'utf8');
  assert(source.includes('duplicate ? "작업 복제"')); assert(source.includes('duplicate ? "새 작업으로 저장"'));
  assert(source.includes('if (duplicate) setSaveError(DUPLICATE_TASK_MESSAGE)'));
  assert(source.includes('!duplicate && confirmOverwrite'));
  assert(source.includes('duplicate ? false : overwrite'));
  assert(source.includes('...(duplicateTask ? {} : { id: editingTask?.id })'));
  assert(source.includes('복제한 작업이 저장되었습니다.'));
  assert(!shared.includes('duplicateTask') && !shared.includes('>복제<'));
  const css = fs.readFileSync(path.join(__dirname,'../app/globals.css'),'utf8');
  assert(/\.duplicate-save-error\s*\{[^}]*white-space:\s*normal/s.test(css));
});

function pageComponents(reactOverride) {
  const filename = path.join(__dirname,'../app/page.tsx'), loaded = new Module(filename,module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  if(reactOverride) { const requireActual = loaded.require.bind(loaded); loaded.require = name => name === 'react' ? reactOverride : requireActual(name); }
  loaded._compile(compile(fs.readFileSync(filename,'utf8')+'\nexport { TaskModal, DetailPanel };',filename),filename);
  return loaded.exports;
}
const modalTask = { id:'original-task', brandKey:'amante', product:'원래 이름', item:'차렵이불', option:'선택값', vendors:['컬리 ONLY'], note:'원본 참고사항', storeLink:'https://test.store/product',
  thumbnailNas:'/원본 썸네일', detailNas:'/원본 상세', shootingNas:'/원본 촬영', kurlyEnabled:false,
  html:'<div class="manual">직접 수정한 HTML<img src="https://test.images/A.jpg"></div>',
  images:[{id:'original-task-image',name:'A.jpg',url:'https://test.images/A.jpg?keep=1',htmlTarget:'general'}] };
function walk(node, predicate) {
  if(!React.isValidElement(node)) return undefined;
  if(predicate(node)) return node;
  for(const child of React.Children.toArray(node.props.children)) { const found=walk(child,predicate); if(found) return found; }
}
const textOf = node => React.Children.toArray(node.props.children).filter(c=>typeof c==='string').join('').trim();
function modalHarness(onSave, { mode = 'duplicate', brandKey = 'amante' } = {}) {
  const slots=[]; let cursor=0, closed=0, step=1;
  const hooks={...React,
    useState(initial) { const i=cursor++; if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}]; },
    useRef(initial) { const i=cursor++; if(!(i in slots)) slots[i]={current:initial}; return slots[i]; },
    useMemo(fn) { cursor++; return fn(); }, useEffect() { cursor++; },
  };
  const {TaskModal}=pageComponents(hooks), initialTask=mode==='new'?null:duplicateTaskSeed(modalTask);
  return { render() { cursor=0; return TaskModal({step,brandKey,initialTask,duplicate:mode==='duplicate',onClose(){closed++;},onNext(){step=2;},onBack(){step=1;},onSave}); }, get closed(){return closed;}, get step(){return step;} };
}

test('duplicate modal preserves every prefilled value, brand rules and stored HTML in both steps', () => {
  const {TaskModal,DetailPanel}=pageComponents();
  for(const brandKey of BRAND_KEYS) for(const step of [1,2]) {
    const task={...modalTask,brandKey}, before=structuredClone(task);
    const markup=renderToStaticMarkup(React.createElement(TaskModal,{step,brandKey,initialTask:duplicateTaskSeed(task),duplicate:true,onClose(){},onNext(){},onSave:async()=> 'saved'}));
    assert(markup.includes('작업 복제')); assert(markup.includes('새 작업으로 저장')); assert(!markup.includes('복사본'));
    if(step===1) { for(const value of [task.product,task.item,task.option,task.note,task.storeLink,task.thumbnailNas,task.detailNas,task.shootingNas]) assert(markup.includes(value),value); assert(markup.includes(`${brandKey==='serendiment'||brandKey==='sommier'?'Drive':'NAS'} 경로 입력`)); }
    assert.deepEqual(task,before);
  }
  const panel=renderToStaticMarkup(React.createElement(DetailPanel,{task:modalTask,onClose(){},onEdit(){},onDuplicate(){}}));
  assert(panel.indexOf('>편집</button>')<panel.indexOf('>복제</button>'));
});

test('duplicate modal blocks double clicks, preserves inputs on duplicate, then allows a distinguished retry', async () => {
  const before=structuredClone(modalTask), calls=[]; let resolve;
  const pending=new Promise(r=>{resolve=r;});
  const h=modalHarness((draft,overwrite)=>{calls.push({draft:structuredClone(draft),overwrite}); return calls.length===1?pending:Promise.resolve('saved');});
  walk(h.render(),n=>n.props.label==='자사몰 링크').props.onChange(modalTask.storeLink+'?version=2');
  let tree=h.render(); const save=walk(tree,n=>n.type==='button'&&textOf(n)==='새 작업으로 저장');
  save.props.onClick(); save.props.onClick(); assert.equal(calls.length,1); assert.equal(calls[0].overwrite,false);
  resolve('duplicate'); await pending; await Promise.resolve();
  tree=h.render(); const alert=walk(tree,n=>n.props.className==='duplicate-save-error'); assert.equal(alert.props.children,DUPLICATE_TASK_MESSAGE);
  assert.equal(h.closed,0); assert(!walk(tree,n=>n.type?.name==='OverwriteTaskDialog'));
  const note=walk(tree,n=>n.props.label==='참고사항'); assert.equal(note.props.value,modalTask.note);
  note.props.onChange('별도 버전'); tree=h.render(); walk(tree,n=>n.type==='button'&&textOf(n)==='새 작업으로 저장').props.onClick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length,2); assert.equal(calls[1].draft.note,'별도 버전'); assert.equal(calls[1].draft.detailHtml,modalTask.html);
  assert.equal(calls[1].overwrite,false); assert.equal(h.closed,1); assert.deepEqual(modalTask,before);
});

test('cancel does not save; failed saves keep the duplicate modal and original values', async () => {
  let saves=0; const cancel=modalHarness(async()=>{saves++; return 'saved';});
  walk(cancel.render(),n=>n.type==='button'&&textOf(n).trim()==='취소').props.onClick(); assert.equal(cancel.closed,1); assert.equal(saves,0);
  const failed=modalHarness(async()=> 'failed'); walk(failed.render(),n=>n.props.label==='자사몰 링크').props.onChange(modalTask.storeLink+'?version=2');
  let tree=failed.render(); walk(tree,n=>n.type==='button'&&textOf(n)==='새 작업으로 저장').props.onClick();
  await Promise.resolve(); await Promise.resolve(); tree=failed.render(); assert.equal(failed.closed,0);
  assert(walk(tree,n=>n.props.className==='duplicate-save-error'));
  assert.equal(walk(tree,n=>n.props.label==='제품명').props.value,modalTask.product);
  assert.equal(walk(tree,n=>n.props.label==='참고사항').props.value,modalTask.note);
});

function synchronousAnimationFrame(t) {
  const previous=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=fn=>{fn();return 1;};
  t.after(()=>{if(previous===undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame=previous;});
}

for (const brandKey of BRAND_KEYS) for (const mode of ['new','edit','duplicate']) test(`${brandKey}/${mode}: back preserves basic fields, images, targets and HTML across repeated navigation`, async (t) => {
  synchronousAnimationFrame(t);
  const calls=[], h=modalHarness(async draft=>{calls.push(draft);return 'saved';},{mode,brandKey});
  let tree=h.render();
  assert(!walk(tree,n=>n.props['aria-label']==='기본 정보로 돌아가기'));
  for(const label of ['제품명','품목','옵션','자사몰 링크','참고사항']) walk(tree,n=>n.props.label===label||n.type?.name==='ItemSelectField'&&label==='품목').props.onChange(`수정 ${label}`);
  for(const n of ['thumbnailNas','detailNas','shootingNas']) {
    const label=n==='thumbnailNas'?'썸네일':n==='detailNas'?'상세페이지':'촬영본';
    walk(tree,node=>node.type?.name==='TextArea'&&node.props.label.startsWith(label)).props.onChange(`/재사용/${label}`);
  }
  walk(tree,n=>n.type==='button'&&textOf(n)==='네이버 ONLY').props.onClick();
  walk(h.render(),n=>n.type==='button'&&['HTML 생성','HTML 편집'].includes(textOf(n))).props.onClick();
  tree=h.render(); assert.equal(h.step,2);
  walk(tree,n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[new File(['one'],'one.jpg',{type:'image/jpeg'}),new File(['two'],'two.jpg',{type:'image/jpeg'})]},currentTarget:{value:'test'}});
  tree=h.render(); let list=walk(tree,n=>n.type?.name==='SortableImageList');
  list.props.onTargetChange(list.props.images[0].id,'kurly');
  tree=h.render(); list=walk(tree,n=>n.type?.name==='SortableImageList'); list.props.onMove(list.props.images.at(-1).id,list.props.images[0].id);
  walk(h.render(),n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:false}});
  tree=h.render(); const images=structuredClone(walk(tree,n=>n.type?.name==='SortableImageList').props.images), html=walk(tree,n=>n.type?.name==='HtmlCodeDrawer').props.generalHtml;
  walk(tree,n=>n.props['aria-label']==='기본 정보로 돌아가기').props.onClick(); assert.equal(h.step,1); assert.equal(h.closed,0); assert.equal(calls.length,0);
  tree=h.render();
  for(const label of ['제품명','옵션','자사몰 링크','참고사항']) assert.equal(walk(tree,n=>n.props.label===label).props.value,`수정 ${label}`);
  assert.equal(walk(tree,n=>n.type?.name==='ItemSelectField').props.value,'수정 품목');
  assert.equal(walk(tree,n=>n.type==='button'&&textOf(n)==='네이버 ONLY').props['aria-pressed'],true);
  walk(tree,n=>n.props.label==='참고사항').props.onChange('돌아와서 다시 수정');
  walk(tree,n=>n.type==='button'&&['HTML 생성','HTML 편집'].includes(textOf(n))).props.onClick();
  tree=h.render(); assert.deepEqual(walk(tree,n=>n.type?.name==='SortableImageList').props.images,images);
  assert.equal(walk(tree,n=>n.type?.name==='HtmlCodeDrawer').props.generalHtml,html);
  assert.equal(walk(tree,n=>n.type==='input'&&n.props.type==='checkbox').props.checked,false);
  walk(tree,n=>n.type==='button'&&['저장','새 작업으로 저장'].includes(textOf(n))).props.onClick();
  await Promise.resolve(); await Promise.resolve(); assert.equal(calls.length,1); assert.equal(calls[0].note,'돌아와서 다시 수정');
  assert.deepEqual(calls[0].images,images); assert.equal(calls[0].detailHtml,html); assert.equal(calls[0].kurlyEnabled,false);
});

test('back is an accessible common Lucide arrow before Cancel, and remains disabled while saving', async (t) => {
  synchronousAnimationFrame(t);
  let resolve; const pending=new Promise(r=>resolve=r), h=modalHarness(()=>pending);
  walk(h.render(),n=>n.props.label==='자사몰 링크').props.onChange(modalTask.storeLink+'?version=2');
  walk(h.render(),n=>n.type==='button'&&textOf(n)==='HTML 편집').props.onClick();
  let tree=h.render(); const actions=walk(tree,n=>n.props.className==='modal-actions');
  const buttons=React.Children.toArray(actions.props.children).filter(React.isValidElement);
  assert.equal(buttons[0].props['aria-label'],'기본 정보로 돌아가기'); assert.equal(textOf(buttons[1]),'취소');
  const markup=renderToStaticMarkup(buttons[0]);
  for(const attr of ['lucide-arrow-left','width="16"','height="16"','stroke-width="1.75"','stroke="currentColor"','aria-hidden="true"']) assert(markup.includes(attr));
  walk(tree,n=>n.type==='button'&&textOf(n)==='새 작업으로 저장').props.onClick();
  tree=h.render(); const back=walk(tree,n=>n.props['aria-label']==='기본 정보로 돌아가기'); assert.equal(back.props.disabled,true);
  back.props.onClick(); assert.equal(h.step,2); resolve('failed'); await pending; await Promise.resolve();
  walk(h.render(),n=>n.props['aria-label']==='기본 정보로 돌아가기').props.onClick(); assert.equal(h.step,1);
  const css=fs.readFileSync(path.join(__dirname,'../app/globals.css'),'utf8');
  assert(/\.modal-action-back\s*>\s*svg\s*\{\s*display:\s*block/.test(css));
});

test('duplicate content equality covers persisted fields and ignores transient IDs and vendor ordering', () => {
  const content={...modalTask,detailHtml:modalTask.html,images:[...modalTask.images,{id:'B',name:'B.jpg',url:'https://test.images/B.jpg',htmlTarget:'common'}],vendors:['컬리 ONLY','29cm ONLY']};
  const key=duplicateTaskContentKey(content);
  assert.equal(duplicateTaskContentKey({...content,vendors:['29cm ONLY','컬리 ONLY','29cm ONLY'],images:content.images.map(i=>({...i,id:'another-id',size:42,mimeType:'image/jpeg'}))}),key);
  for(const field of ['product','item','option','storeLink','note','thumbnailNas','detailNas','shootingNas','detailHtml']) assert.notEqual(duplicateTaskContentKey({...content,[field]:content[field]+'changed'}),key,field);
  assert.notEqual(duplicateTaskContentKey({...content,kurlyEnabled:true}),key);
  assert.notEqual(duplicateTaskContentKey({...content,images:[...content.images].reverse()}),key);
  assert.notEqual(duplicateTaskContentKey({...content,images:content.images.slice(1)}),key);
  assert.notEqual(duplicateTaskContentKey({...content,images:content.images.map(i=>({...i,htmlTarget:'kurly'}))}),key);
  assert.equal(duplicateTaskContentKey({...content,note:' '+content.note+' '}),key);
});

for(const brandKey of BRAND_KEYS) test(`${brandKey}: unchanged clone is disabled in both steps, changes enable it, and restoring values disables it again`, async () => {
  const calls=[], h=modalHarness(async draft=>{calls.push(draft);return 'saved';},{brandKey});
  const save=()=>walk(h.render(),n=>n.type==='button'&&textOf(n)==='새 작업으로 저장');
  assert.equal(save().props.disabled,true); assert.equal(save().props['data-unchanged'],true);
  save().props.onClick(); await Promise.resolve(); assert.equal(calls.length,0);
  for(const [label,value]of [['제품명',modalTask.product],['옵션',modalTask.option],['자사몰 링크',modalTask.storeLink],['참고사항',modalTask.note]]) {
    walk(h.render(),n=>n.props.label===label).props.onChange(value+' 변경'); assert.equal(save().props.disabled,false,label);
    walk(h.render(),n=>n.props.label===label).props.onChange(value); assert.equal(save().props.disabled,true,label);
  }
  const item=()=>walk(h.render(),n=>n.type?.name==='ItemSelectField'); item().props.onChange('다른 품목'); assert.equal(save().props.disabled,false); item().props.onChange(modalTask.item); assert.equal(save().props.disabled,true);
  for(const [prefix,value]of [['썸네일',modalTask.thumbnailNas],['상세페이지',modalTask.detailNas],['촬영본',modalTask.shootingNas]]) {
    const field=()=>walk(h.render(),n=>n.type?.name==='TextArea'&&n.props.label.startsWith(prefix));
    field().props.onChange(value+' 변경'); assert.equal(save().props.disabled,false); field().props.onChange(value); assert.equal(save().props.disabled,true);
  }
  const vendor=()=>walk(h.render(),n=>n.type==='button'&&textOf(n)==='네이버 ONLY'); vendor().props.onClick(); assert.equal(save().props.disabled,false); vendor().props.onClick(); assert.equal(save().props.disabled,true);
  walk(h.render(),n=>n.type==='button'&&textOf(n)==='HTML 편집').props.onClick(); assert.equal(save().props.disabled,true);
  const toggle=()=>walk(h.render(),n=>n.type==='input'&&n.props.type==='checkbox'); toggle().props.onChange({target:{checked:true}}); assert.equal(save().props.disabled,false); toggle().props.onChange({target:{checked:false}}); assert.equal(save().props.disabled,true);
  const list=walk(h.render(),n=>n.type?.name==='SortableImageList'); list.props.onTargetChange(list.props.images[0].id,'kurly'); assert.equal(save().props.disabled,false);
});

test('ordinary create and edit saving remain available without clone-only change requirement', () => {
  for(const mode of ['new','edit']) {
    const h=modalHarness(async()=> 'saved',{mode});
    if(mode==='new') walk(h.render(),n=>n.type==='button'&&textOf(n)==='HTML 생성').props.onClick();
    const save=walk(h.render(),n=>n.type==='button'&&textOf(n)==='저장'); assert.equal(save.props.disabled,false); assert.equal(save.props['data-unchanged'],undefined);
  }
});
