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

const { dragAutoScrollVelocity } = require('../app/lib/drag-auto-scroll.ts');

test('scrolls only inside the top and bottom edge zones', () => {
  assert.equal(dragAutoScrollVelocity(200, 100, 500), 0);
  assert.ok(dragAutoScrollVelocity(120, 100, 500) < 0);
  assert.ok(dragAutoScrollVelocity(480, 100, 500) > 0);
});

test('caps velocity and ignores invalid geometry', () => {
  assert.equal(dragAutoScrollVelocity(50, 100, 500), -840);
  assert.equal(dragAutoScrollVelocity(550, 100, 500), 840);
  assert.equal(dragAutoScrollVelocity(100, 500, 100), 0);
});
