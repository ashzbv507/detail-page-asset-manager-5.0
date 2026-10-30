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
const { PREVIEW_VIEW_STORAGE_KEY, readPreviewView, writePreviewView } = require('../app/lib/preview-view-state.ts');
const { readHtmlPreviewSnapshot, HTML_PREVIEW_STORAGE_KEY } = require('../app/lib/html-preview.ts');
const snapshot = { mode: 'general', images: [{ name: 'one.jpg', url: 'https://example.com/one.jpg' }], version: 100 };
const view = { zoom: 75, fitToWindow: false, scrollLeft: 123, scrollTop: 9876 };
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('browser reload refreshes image versions while retaining zoom and both scroll axes', () => {
  const tab = storage();
  tab.setItem(HTML_PREVIEW_STORAGE_KEY, JSON.stringify(snapshot));
  writePreviewView(tab, snapshot, view);
  const reloaded = readHtmlPreviewSnapshot(tab, 200);
  assert.equal(reloaded.version, 200);
  assert.deepEqual(readPreviewView(tab, reloaded), view);
});

test('view settings are isolated by tab and product/mode/image snapshot', () => {
  const first = storage(), second = storage();
  writePreviewView(first, snapshot, view);
  assert.equal(readPreviewView(second, snapshot), null);
  assert.equal(readPreviewView(first, { ...snapshot, mode: 'kurly' }), null);
  assert.equal(readPreviewView(first, { ...snapshot, images: [{ name: 'two.jpg', url: 'https://example.com/two.jpg' }] }), null);
  assert.deepEqual(readPreviewView(first, snapshot), view);
});

test('fit mode is retained and invalid or blocked storage never breaks a preview', () => {
  const tab = storage();
  writePreviewView(tab, snapshot, { ...view, fitToWindow: true, zoom: 900, scrollTop: -10 });
  assert.deepEqual(readPreviewView(tab, snapshot), { ...view, fitToWindow: true, zoom: 150, scrollTop: 0 });
  const valid = tab.getItem(PREVIEW_VIEW_STORAGE_KEY);
  for (const invalid of ['null', '{}', 'not-json', valid.replace('"scrollLeft":123', '"scrollLeft":"123"'), valid.replace('"scrollTop":-10', '"scrollTop":1e999')]) {
    tab.setItem(PREVIEW_VIEW_STORAGE_KEY, invalid);
    assert.equal(readPreviewView(tab, snapshot), null);
  }
  const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(readPreviewView(blocked, snapshot), null);
  assert.doesNotThrow(() => writePreviewView(blocked, snapshot, view));
});
