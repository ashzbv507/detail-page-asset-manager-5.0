const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
function compile(source, filename) {
  return ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename);
const { generateGeneralHtml, generateKurlyHtml } = require('../app/lib/html.ts');
const { previewImagesFromHtml, HTML_PREVIEW_STORAGE_KEY, htmlPreviewFailureMessage } = require('../app/lib/html-preview.ts');
const filename = path.join(root, 'app/components/HtmlPreviewCell.tsx');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const actualRequire = loaded.require.bind(loaded);
// Expose real click handlers without a DOM renderer; only this component's ref is stubbed.
loaded.require = (name) => name === 'react' ? { ...React, useRef: (value) => ({ current: value }) } : actualRequire(name);
loaded._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename);
const { HtmlPreviewCell } = loaded.exports;

function browser(run, failure) {
  const old = global.window, tabs = [];
  global.window = { open(url, target) {
    assert.equal(url, 'about:blank'); assert.equal(target, '_blank');
    if (failure === 'popup') return null;
    const values = new Map();
    const tab = { sessionStorage: { setItem(k,v) { if (failure === 'storage') throw Error('denied'); values.set(k,v); }, removeItem(k) { values.delete(k); } }, location: { replace(url) { tab.path = url; } }, focus() {}, close() { tab.closed = true; }, values };
    tabs.push(tab); return tab;
  } };
  try { run(tabs); } finally { if (old === undefined) delete global.window; else global.window = old; }
}
function cell(html, extras = {}) {
  const notices = [], copies = [];
  const element = HtmlPreviewCell({ html, onNotice: m => notices.push(m), onCopy: m => copies.push(m), ...extras });
  const [text, preview, copy] = React.Children.toArray(element.props.children);
  return { element, text, preview, copy, notices, copies };
}
function click(button) {
  let stopped = false;
  button.props.onClick({ stopPropagation() { stopped = true; } });
  assert(stopped, 'Must not select a row or toggle a share selection');
}

for (const brand of ['amante', 'imbedding', 'serendiment', 'sommier']) test(`${brand}: table opens only basic HTML in independent, fresh tabs`, () => {
  const images = [
    { id: 'common', name: '공통.jpg', htmlTarget: 'common' },
    { id: 'general', name: '기본.jpg', htmlTarget: 'general' },
    { id: 'kurly', name: '컬리.jpg', htmlTarget: 'kurly' },
  ];
  const general = generateGeneralHtml(images, brand), kurly = generateKurlyHtml(images, brand);
  assert(general.includes(encodeURIComponent('기본.jpg')) && !general.includes(encodeURIComponent('컬리.jpg')));
  assert(kurly.includes(encodeURIComponent('컬리.jpg')) && !kurly.includes(encodeURIComponent('기본.jpg')));
  assert.equal(generateKurlyHtml(images, brand, false), '');
  browser(tabs => {
    const first = cell(general, { copyDisabled: true });
    click(first.preview); click(first.preview);
    click(cell(kurly).preview); // A separate row's saved basic HTML is its own snapshot.
    const payloads = tabs.map(t => JSON.parse(t.values.get(HTML_PREVIEW_STORAGE_KEY)));
    assert.equal(tabs.length, 3);
    assert(payloads.every(p => p.mode === 'general'));
    assert.deepEqual(payloads[0].images.map(i=>i.url), previewImagesFromHtml(general).map(i=>i.url));
    assert(payloads[1].version > payloads[0].version);
    assert.notDeepEqual(payloads[0].images, payloads[2].images);
    assert(tabs.every(t => t.path === '/html-preview' && t.opener === null));
    click(first.copy); assert.deepEqual(first.copies, []);
    const enabled = cell(general); click(enabled.copy); assert.deepEqual(enabled.copies, [general]);
    assert.equal(first.notices.length, 0);
  });
});

test('empty HTML retains both action slots and disables them accessibly', () => {
  for (const html of ['', '  \n\t']) {
    const c = cell(html);
    assert.equal(c.preview.props.disabled, true); assert.equal(c.copy.props.disabled, true);
    assert.equal(c.preview.props.title, 'HTML 새 창 미리보기');
    assert.equal(c.preview.props['aria-label'], 'HTML 새 창 미리보기');
    const markup = renderToStaticMarkup(c.element);
    assert.equal([...markup.matchAll(/<button/g)].length, 2);
    assert(markup.indexOf('lucide-eye') < markup.indexOf('lucide-copy'));
    browser(tabs => { click(c.preview); click(c.copy); assert.equal(tabs.length, 0); });
  }
});

test('saved HTML order/URLs win over any unrelated upload list; bad/no-image HTML is safe', () => {
  const html = `<img src='https://cdn.test/B.jpg?x=1#part'>\n<img src="https://cdn.test/A.jpg">`;
  assert.deepEqual(previewImagesFromHtml(html).map(i=>i.url), ['https://cdn.test/B.jpg?x=1#part', 'https://cdn.test/A.jpg']);
  browser(tabs => { const c = cell('<p>설명만 있습니다.</p>'); click(c.preview); assert.equal(tabs.length, 0); assert.deepEqual(c.notices, ['미리보기할 이미지가 없습니다.']); });
});

test('popup/storage failures are explained, without opening a panel or corrupting other tabs', () => {
  for (const failure of ['popup', 'storage']) browser(tabs => {
    const c = cell('<img src="https://cdn.test/A.jpg">'); click(c.preview);
    assert.deepEqual(c.notices, [htmlPreviewFailureMessage(failure === 'popup' ? 'popup-blocked' : 'storage-unavailable')]);
    if (failure === 'storage') assert.equal(tabs[0].closed, true);
  }, failure);
});

test('main/shared HTML cells share the same component; only store links keep ExternalLink', () => {
  for (const file of ['app/page.tsx', 'app/share/[token]/ShareViewer.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert(source.includes('<HtmlPreviewCell html='));
    assert.equal([...source.matchAll(/<ExternalLink /g)].length, 1);
    assert(source.includes('<ExternalLink {...iconProps} /></a>'));
    assert(source.includes('aria-label="HTML 새 창 미리보기"'));
    assert(source.includes('<Eye {...iconProps} />'));
    assert(source.includes('(event.target as Element).closest("button,a")'), 'Disabled button descendants must not select a row either');
  }
});
