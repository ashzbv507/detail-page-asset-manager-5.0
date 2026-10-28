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

const { dragAutoScrollVelocity, dragPointerWithinBounds } = require('../app/lib/drag-auto-scroll.ts');

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

test('sortable list uses a gentler 500px/s cap even just outside its edge', () => {
  assert.equal(dragAutoScrollVelocity(76, 100, 500, 56, 500), -500);
  assert.equal(dragAutoScrollVelocity(524, 100, 500, 56, 500), 500);
  assert.equal(dragAutoScrollVelocity(300, 100, 500, 56, 500), 0);
});

test('scroll edge hit area covers the full list width with equal diagonal tolerance', () => {
  const bounds = { left: 100, right: 500, top: 100, bottom: 500 };
  for (const x of [60, 100, 300, 500, 540]) {
    assert(dragPointerWithinBounds({ x, y: 110 }, bounds));
    assert(dragPointerWithinBounds({ x, y: 490 }, bounds));
  }
  for (const point of [{ x: 59, y: 490 }, { x: 541, y: 110 }, { x: 300, y: 75 }, { x: 300, y: 525 }, { x: NaN, y: 100 }]) {
    assert(!dragPointerWithinBounds(point, bounds));
  }
});
