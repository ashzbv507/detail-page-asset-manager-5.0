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

const { reorderByDrop } = require('../app/lib/image-order.ts');
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
