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
const { clampPreviewZoom, fitPreviewZoom, capturePreviewAnchor, previewAnchorDelta } = require('../app/lib/preview-zoom.ts');

test('zoom stays between 30% and 150%; fitting does not enlarge beyond the 860px baseline', () => {
  assert.equal(clampPreviewZoom(0), 30);
  assert.equal(clampPreviewZoom(200), 150);
  assert.equal(clampPreviewZoom(NaN), 100);
  assert.equal(fitPreviewZoom(1000), 100);
  assert.equal(fitPreviewZoom(320), 33);
  assert.equal(fitPreviewZoom(768), 85);
  for (const width of [320, 375, 414, 768]) assert.ok(860 * fitPreviewZoom(width) / 100 + 32 <= width);
});

test('reading position survives proportional width changes, even halfway down a long page', () => {
  const viewport = { left: 0, top: 60, width: 1000, height: 700 };
  const original = { left: 70, top: -2940, width: 860 };
  const anchor = capturePreviewAnchor(original, viewport);
  assert.equal(anchor.x, 0.5);
  const enlarged = { left: 16, top: -2940, width: 1290 };
  const delta = previewAnchorDelta(anchor, enlarged, viewport);
  assert.equal(delta.left, 161);
  assert.equal(delta.top, 1560);
  assert.equal(previewAnchorDelta(anchor, original, viewport).top, 0);
  assert.equal(capturePreviewAnchor({ left: 0, top: 0, width: 0 }, viewport), null);
});
