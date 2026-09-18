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
const { mergeSavedTask } = require('../app/lib/task-state.ts');
const sort = (items) => [...items].sort((a, b) => a.item.localeCompare(b.item));

test('same product/item with different notes remains a separate row by persisted ID', () => {
  const first = { id: '1', item: 'a', note: '거래처 A' };
  const second = { id: '2', item: 'a', note: '거래처 B' };
  const groups = [{ product: 'A', count: 1, items: [first] }];
  assert.deepEqual(mergeSavedTask(groups, second, 'A', sort), [{ product: 'A', count: 2, items: [first, second] }]);
});

test('updates a saved row in place without reloading the list', () => {
  const groups = [{ product: 'A', count: 2, items: [{ id: '1', item: 'b' }, { id: '2', item: 'a' }] }];
  assert.deepEqual(mergeSavedTask(groups, { id: '1', item: 'c' }, 'A', sort), [
    { product: 'A', count: 2, items: [{ id: '2', item: 'a' }, { id: '1', item: 'c' }] },
  ]);
});

test('moves a renamed product and removes its empty previous group', () => {
  const groups = [{ product: 'Old', count: 1, items: [{ id: '1', item: 'a' }] }, { product: 'Other', count: 1, items: [{ id: '2', item: 'b' }] }];
  assert.deepEqual(mergeSavedTask(groups, { id: '1', item: 'a' }, 'New', sort).map(({ product, count }) => ({ product, count })), [
    { product: 'New', count: 1 }, { product: 'Other', count: 1 },
  ]);
});
