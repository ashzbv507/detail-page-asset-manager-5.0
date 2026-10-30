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

const { HTML_PREVIEW_STORAGE_KEY, createHtmlPreviewPayload, parseHtmlPreviewPayload, readHtmlPreviewSnapshot, openHtmlPreviewTab, previewImageUrl } = require('../app/lib/html-preview.ts');

test('keeps original image URLs in stored preview data', () => {
  const images = [{ id: 'one', name: 'one.jpg', url: 'https://cdn.example.com/one.jpg' }];
  const payload = createHtmlPreviewPayload('general', images, 123);
  assert.equal(payload.images[0].url, images[0].url);
  assert.equal(previewImageUrl(payload.images[0].url, payload.version), 'https://cdn.example.com/one.jpg?preview=123');
});

test('parses valid payloads and rejects malformed values', () => {
  const payload = { mode: 'kurly', images: [{ name: 'one.jpg', url: 'blob:test' }], version: 456 };
  assert.deepEqual(parseHtmlPreviewPayload(JSON.stringify(payload)), payload);
  assert.equal(parseHtmlPreviewPayload('{"mode":"unknown"}'), null);
  assert.equal(parseHtmlPreviewPayload('not-json'), null);
  assert.equal(parseHtmlPreviewPayload('null'), null);
  assert.equal(parseHtmlPreviewPayload('{"mode":"general","images":[],"version":1e999}'), null);
});

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

function mockBrowser(run, options = {}) {
  const previousWindow = global.window;
  const tabs = [];
  const calls = [];
  global.window = { open: (url, target) => {
    calls.push([url, target]);
    if (options.openThrows) throw new Error('popup error');
    if (options.blocked) return null;
    const storage = memoryStorage();
    if (options.inheritedView) storage.setItem('detail-page-asset-manager:preview-view', options.inheritedView);
    const tab = {
      opener: global.window,
      sessionStorage: options.storageThrows ? { setItem() { throw new Error('storage unavailable'); } } : storage,
      location: { replace(path) { assert(storage.getItem(HTML_PREVIEW_STORAGE_KEY)); tab.path = path; } },
      focus() { if (options.focusThrows) throw new Error('cannot focus'); tab.focused = true; },
      close() { tab.closed = true; },
    };
    tabs.push(tab);
    return tab;
  } };
  try { run({ tabs, calls }); } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
}

test('each click opens a new tab with an isolated snapshot, including repeated products', () => {
  mockBrowser(({ tabs, calls }) => {
    const first = createHtmlPreviewPayload('general', [{ name: 'first.jpg', url: 'https://cdn.example.com/first.jpg' }], 100);
    const second = createHtmlPreviewPayload('kurly', [{ name: 'second.jpg', url: 'https://cdn.example.com/second.jpg' }], 200);
    assert.equal(openHtmlPreviewTab(first), 'opened');
    assert.equal(openHtmlPreviewTab(second), 'opened');
    assert.equal(openHtmlPreviewTab(first), 'opened');
    assert.equal(tabs.length, 3);
    assert.deepEqual(calls, Array.from({ length: 3 }, () => ['about:blank', '_blank']));
    first.images[0].url = 'https://cdn.example.com/edited-later.jpg';
    assert.equal(readHtmlPreviewSnapshot(tabs[0].sessionStorage, 300).images[0].url, 'https://cdn.example.com/first.jpg');
    assert.equal(readHtmlPreviewSnapshot(tabs[1].sessionStorage, 300).mode, 'kurly');
    assert.equal(readHtmlPreviewSnapshot(tabs[1].sessionStorage, 300).images[0].name, 'second.jpg');
    assert.equal(readHtmlPreviewSnapshot(tabs[2].sessionStorage, 300).images[0].name, 'first.jpg');
    for (const tab of tabs) {
      assert.equal(tab.path, '/html-preview');
      assert.equal(tab.opener, null);
    }
  });
});

test('reloading preserves the tab product but requests a newer image version', () => {
  const storage = memoryStorage();
  const stored = createHtmlPreviewPayload('general', [{ name: 'one.jpg', url: 'https://cdn.example.com/one.jpg?quality=90#part' }], 100);
  storage.setItem(HTML_PREVIEW_STORAGE_KEY, JSON.stringify(stored));
  const firstRead = readHtmlPreviewSnapshot(storage, 200);
  const reload = readHtmlPreviewSnapshot(storage, 300);
  assert.deepEqual(firstRead.images, reload.images);
  assert.equal(firstRead.version, 200);
  assert.equal(reload.version, 300);
  assert.notEqual(previewImageUrl(firstRead.images[0].url, firstRead.version), previewImageUrl(reload.images[0].url, reload.version));
  assert.deepEqual(JSON.parse(storage.getItem(HTML_PREVIEW_STORAGE_KEY)), stored);
  assert.equal(readHtmlPreviewSnapshot(storage, 50).version, 100);
});

test('local uploads and data images retain their original URLs', () => {
  for (const url of ['blob:https://example.com/upload-id', 'data:image/png;base64,abc']) assert.equal(previewImageUrl(url, 999), url);
});

test('blocked windows return an explicit result without affecting other tabs', () => {
  mockBrowser(({ tabs }) => {
    assert.equal(openHtmlPreviewTab(createHtmlPreviewPayload('general', [], 1)), 'popup-blocked');
    assert.equal(tabs.length, 0);
  }, { blocked: true });
  mockBrowser(() => {
    assert.equal(openHtmlPreviewTab(createHtmlPreviewPayload('general', [], 1)), 'popup-blocked');
  }, { openThrows: true });
});

test('storage failures close the new blank tab and do not silently show another product', () => {
  mockBrowser(({ tabs }) => {
    assert.equal(openHtmlPreviewTab(createHtmlPreviewPayload('general', [], 1)), 'storage-unavailable');
    assert.equal(tabs[0].closed, true);
    assert.equal(tabs[0].path, undefined);
  }, { storageThrows: true });
  assert.equal(readHtmlPreviewSnapshot({ getItem() { throw new Error('storage denied'); } }), null);
  assert.equal(readHtmlPreviewSnapshot(memoryStorage()), null);
});

test('focus errors in embedded browsers do not discard a successfully opened preview', () => {
  mockBrowser(({ tabs }) => {
    assert.equal(openHtmlPreviewTab(createHtmlPreviewPayload('general', [], 1)), 'opened');
    assert.equal(tabs[0].path, '/html-preview');
    assert.notEqual(tabs[0].closed, true);
  }, { focusThrows: true });
});

test('new preview tabs start fresh instead of inheriting another preview view state', () => {
  mockBrowser(({ tabs }) => {
    assert.equal(openHtmlPreviewTab(createHtmlPreviewPayload('general', [], 1)), 'opened');
    assert.equal(tabs[0].sessionStorage.getItem('detail-page-asset-manager:preview-view'), null);
  }, { inheritedView: '{"zoom":150,"scrollTop":999}' });
});

test('all preview entry points use the isolated tab opener and do not publish shared data', () => {
  for (const path of ['app/page.tsx', 'app/share/[token]/ShareViewer.tsx']) {
    const source = fs.readFileSync(require('node:path').join(__dirname, '..', path), 'utf8');
    assert(source.includes('openHtmlPreviewTab(createHtmlPreviewPayload('));
    assert(!source.includes('HTML_PREVIEW_WINDOW_NAME'));
    assert(!source.includes('localStorage.setItem(HTML_PREVIEW_STORAGE_KEY'));
    assert(!source.includes('publishHtmlPreview'));
  }
  const page = fs.readFileSync(require('node:path').join(__dirname, '../app/html-preview/page.tsx'), 'utf8');
  assert(page.includes('readHtmlPreviewSnapshot(window.sessionStorage)'));
  assert(!page.includes('addEventListener("storage"'));
  assert(!page.includes('localStorage'));
});
