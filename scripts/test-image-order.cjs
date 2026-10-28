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

const { reorderByDrop, reorderByTarget, imageSortTarget } = require('../app/lib/image-order.ts');
const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const ids = (values) => values.map(({ id }) => id);

test('commits upward and downward reordering only at the requested drop edge', () => {
  assert.deepEqual(ids(reorderByDrop(items, 'a', 'c', 'after')), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(reorderByDrop(items, 'd', 'b', 'before')), ['a', 'd', 'b', 'c']);
});

test('returns the same array for no-op and invalid drops', () => {
  assert.equal(reorderByDrop(items, 'b', 'a', 'after'), items);
  assert.equal(reorderByDrop(items, 'a', 'a', 'before'), items);
  assert.equal(reorderByDrop(items, 'missing', 'a', 'before'), items);
});

const names = ids(items);
const rects = names.map((id, index) => ({ id, top: 12 + index * 68, height: 60 }));
function pointerDrop(active, y, geometry = rects) {
  return ids(reorderByTarget(items, active, imageSortTarget(names, active, y, geometry)));
}

test('C dropped in the A/B gap inserts before B, without mutating the source', () => {
  for (const y of [72, 73, 76, 79, 80]) {
    assert.deepEqual(pointerDrop('c', y), ['a', 'c', 'b', 'd']);
  }
  assert.deepEqual(ids(items), ['a', 'b', 'c', 'd']);
});

test('accepts upper/lower padding and downward gaps, not just card hits', () => {
  assert.deepEqual(pointerDrop('d', 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(pointerDrop('a', 284), ['b', 'c', 'd', 'a']);
  assert.deepEqual(pointerDrop('a', 144), ['b', 'a', 'c', 'd']);
  assert.deepEqual(pointerDrop('c', 212), ['a', 'b', 'c', 'd']);
});

test('scroll offsets do not change insertion results at the same visual gap', () => {
  const scrolled = rects.map(rect => ({ ...rect, top: rect.top - 136 }));
  assert.deepEqual(pointerDrop('a', 144 - 136, scrolled), ['b', 'a', 'c', 'd']);
});

test('cancelled, unknown, unmeasured and unchanged targets are safe no-ops', () => {
  assert.equal(reorderByTarget(items, 'b', null), items);
  assert.equal(reorderByTarget(items, 'b', 'b'), items);
  assert.equal(reorderByTarget(items, 'missing', 'a'), items);
  assert.equal(reorderByTarget(items, 'a', 'missing'), items);
  assert.equal(imageSortTarget(names, 'missing', 100, rects), null);
  assert.equal(imageSortTarget(names, 'c', NaN, rects), null);
  assert.equal(imageSortTarget(names, 'c', 100, []), null);
  assert.equal(imageSortTarget([], 'c', 100, []), null);
  assert.equal(imageSortTarget(['c'], 'c', 100, []), 'c');
});

test('all possible final positions preserve every image and metadata exactly once', () => {
  for (const from of names) {
    for (const to of names) {
      const next = reorderByTarget(items, from, to);
      assert.equal(next.findIndex(image => image.id === from), names.indexOf(to));
      assert.deepEqual([...ids(next)].sort(), names);
      next.forEach(image => assert.equal(image, items.find(original => original.id === image.id)));
    }
  }
});

test('confirmed sort updates both HTML outputs in order, keeping excluded images excluded', () => {
  const { generateGeneralHtml, generateKurlyHtml } = require('../app/lib/html.ts');
  const images = names.map((id, index) => ({ id, name: `${id}.jpg`, url: `https://example.com/${id}.jpg`, htmlTarget: ['common', 'general', 'kurly', 'common'][index] }));
  const before = generateGeneralHtml(images, 'amante');
  const target = imageSortTarget(names, 'd', 76, rects);
  assert.equal(generateGeneralHtml(images, 'amante'), before, 'Hover must not mutate the stored order');
  const confirmed = reorderByTarget(images, 'd', target);
  const general = generateGeneralHtml(confirmed, 'amante');
  const kurly = generateKurlyHtml(confirmed, 'amante');
  assert(general.indexOf('/a.jpg') < general.indexOf('/d.jpg'));
  assert(general.indexOf('/d.jpg') < general.indexOf('/b.jpg'));
  assert(!general.includes('/c.jpg'));
  assert(kurly.indexOf('/a.jpg') < kurly.indexOf('/d.jpg'));
  assert(kurly.indexOf('/d.jpg') < kurly.indexOf('/c.jpg'));
  assert(!kurly.includes('/b.jpg'));
});
