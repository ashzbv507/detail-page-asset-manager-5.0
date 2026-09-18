const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(outputText, filename);
};
const route = require('../app/api/tasks/route.ts');
const { BRAND_KEYS } = require('../app/lib/task-types.ts');
const { taskDuplicatePath, TASK_CONFLICT_COLUMNS } = require('../app/lib/task-identity.ts');

const keys = TASK_CONFLICT_COLUMNS.split(',');
const eqValue = (filter) => filter.slice(3);
const sameIdentity = (a, b) => keys.every((key) => (a[key] ?? '') === (b[key] ?? ''));
const create = (task, overwrite = false) => route.POST(new Request('http://localhost/api/tasks', {
  method: 'POST', body: JSON.stringify({ task, overwrite }),
}));

function database(t, { legacy = false, race = false } = {}) {
  const previousEnv = { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = 'https://test-database.invalid';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  t.after(() => {
    for (const [key, value] of [['SUPABASE_URL', previousEnv.url], ['SUPABASE_SECRET_KEY', previousEnv.secret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const db = { rows: [], writes: [], requests: [] };
  let raced = false;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    assert.equal(new URL(url).origin, 'https://test-database.invalid');
    const params = new URL(url).searchParams;
    db.requests.push({ params, method: init.method ?? 'GET' });
    if (params.get('select') === 'id' && params.get('limit') === '1') {
      const matches = db.rows.filter((row) => keys.every((key) => {
        if (key === 'note' && params.has('or')) return !row.note;
        return (row[key] ?? '') === eqValue(params.get(key));
      }));
      return Response.json(matches.slice(0, 1).map(({ id }) => ({ id })));
    }
    if (init.method === 'PATCH') {
      const incoming = JSON.parse(init.body);
      if (db.rows.some((row) => row.id !== incoming.id && sameIdentity(row, incoming))) {
        return Response.json({ code: '23505' }, { status: 409 });
      }
      db.rows = db.rows.map((row) => row.id === incoming.id ? incoming : row);
      db.writes.push({ method: 'PATCH', rows: [incoming] });
      return Response.json([incoming]);
    }
    if (init.method === 'POST') {
      const incoming = JSON.parse(init.body);
      if (race && !raced) {
        raced = true;
        db.rows.push({ ...incoming[0], id: 'simultaneous-id' });
      }
      const conflictKeys = legacy ? keys.slice(0, -1) : keys;
      const duplicate = incoming.some((entry) => db.rows.some((row) => conflictKeys.every((key) => row[key] === entry[key])));
      if (duplicate && !params.has('on_conflict')) return Response.json({ code: '23505' }, { status: 409 });
      if (params.has('on_conflict')) assert.equal(params.get('on_conflict'), TASK_CONFLICT_COLUMNS);
      for (const entry of incoming) {
        const existing = db.rows.findIndex((row) => sameIdentity(row, entry));
        if (existing >= 0) db.rows[existing] = { ...entry, id: db.rows[existing].id };
        else db.rows.push(entry);
      }
      db.writes.push({ method: 'POST', rows: incoming });
      return Response.json(incoming.map((entry) => db.rows.find((row) => sameIdentity(row, entry))));
    }
    return Response.json(db.rows);
  });
  return db;
}

test('duplicate eq filters round-trip free-form values without literal wrapper quotes', () => {
  for (const note of ['거래처 A, B (전용)', '"할인" \\경로\n둘째 줄', 'eq.test &note=is.null']) {
    const row = { brand_key: 'amante', product_name: '제품 (A), B', item_name: '차렵이불', option_name: '', note };
    const params = new URL(taskDuplicatePath(row), 'https://test.invalid/').searchParams;
    for (const key of keys) assert.equal(eqValue(params.get(key)), row[key]);
  }
  const empty = new URL(taskDuplicatePath({ brand_key: 'amante', product_name: 'P', item_name: 'I', option_name: '', note: '' }), 'https://test.invalid/');
  assert.equal(empty.searchParams.get('or'), '(note.eq."",note.is.null)');
});

test('different notes create independent rows; identical notes require confirmation for every brand', async (t) => {
  const db = database(t);
  for (const brandKey of BRAND_KEYS) {
    db.rows = [];
    const payload = { brandKey, productName: 'Same', itemName: '차렵이불', images: [], detailHtml: 'original' };
    const a = await create({ ...payload, note: '거래처 A' });
    const b = await create({ ...payload, note: '거래처 B, "전용"' });
    const empty = await create(payload);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(empty.status, 200);
    assert.equal(db.rows.length, 3);
    assert.equal(new Set(db.rows.map(({ id }) => id)).size, 3);
    const bId = (await b.json()).tasks[0].id;
    const writesBefore = db.writes.length;
    const duplicate = await create({ ...payload, note: '  거래처 B, "전용"  ' });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, 'DUPLICATE_TASK');
    assert.equal(db.writes.length, writesBefore);
    assert.equal((await create({ ...payload, note: '   ' })).status, 409);
    const overwritten = await create({ ...payload, note: '거래처 B, "전용"', detailHtml: 'updated' }, true);
    assert.equal(overwritten.status, 200);
    assert.equal((await overwritten.json()).tasks[0].id, bId);
    assert.equal(db.rows.length, 3);
    assert.equal(db.rows.find(({ note }) => note === '거래처 A').detail_html, 'original');
    assert.equal(db.rows.find(({ id }) => id === bId).detail_html, 'updated');
    assert.equal(db.writes.at(-1).method, 'PATCH');
    assert.equal((await create({ ...payload, note: '거래처 C' }, true)).status, 200);
    assert.equal(db.rows.length, 4);
    const loaded = (await (await route.GET(new Request('http://localhost/api/tasks'))).json()).tasks;
    assert.deepEqual(loaded.map(({ note }) => note), ['거래처 A', '거래처 B, "전용"', '', '거래처 C']);
  }
});

test('legacy null note and empty note still count as the same task', async (t) => {
  const db = database(t);
  await create({ productName: 'P', itemName: 'I', images: [] });
  db.rows[0].note = null;
  assert.equal((await create({ productName: 'P', itemName: 'I', note: '', images: [] })).status, 409);
  assert.equal(db.rows.length, 1);
});

test('concurrent identical create cannot overwrite without confirmation', async (t) => {
  const db = database(t, { race: true });
  const response = await create({ productName: 'P', itemName: 'I', note: 'same', images: [] });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'DUPLICATE_TASK');
  assert.equal(db.writes.length, 0);
  assert.equal(db.rows[0].id, 'simultaneous-id');
});

test('unapplied old constraint returns migration guidance instead of merging a different-note task', async (t) => {
  const db = database(t, { legacy: true });
  const payload = { productName: 'P', itemName: 'I', images: [] };
  assert.equal((await create({ ...payload, note: 'A' })).status, 200);
  const response = await create({ ...payload, note: 'B' });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /supabase-task-note-identity.sql/);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].note, 'A');
});

test('bulk conflict key includes note and editing targets the persisted ID', async (t) => {
  const db = database(t);
  const payload = { productName: 'P', itemName: 'I', images: [] };
  const response = await route.POST(new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify({ tasks: [{ ...payload, note: 'A' }, { ...payload, note: 'B' }] }) }));
  assert.equal(response.status, 200);
  assert.equal(db.rows.length, 2);
  const id = db.rows[0].id;
  const edited = await route.PATCH(new Request(`http://localhost/api/tasks?id=${id}`, { method: 'PATCH', body: JSON.stringify({ task: { ...payload, note: 'C' } }) }));
  assert.equal(edited.status, 200);
  assert.deepEqual(db.rows.map(({ note }) => note), ['C', 'B']);
  const blocked = await route.PATCH(new Request(`http://localhost/api/tasks?id=${id}`, { method: 'PATCH', body: JSON.stringify({ task: { ...payload, note: 'B' } }) }));
  assert.equal(blocked.status, 409);
  assert.deepEqual(db.rows.map(({ note }) => note), ['C', 'B']);
});
