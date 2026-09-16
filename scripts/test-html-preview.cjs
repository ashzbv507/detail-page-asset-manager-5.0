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

const { createHtmlPreviewPayload, parseHtmlPreviewPayload, previewImageUrl } = require('../app/lib/html-preview.ts');

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
});
