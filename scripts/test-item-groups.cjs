const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8');
const parsed = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['AMANTE_IMBEDDING_ITEM_GROUPS', 'AMANTE_ITEM_GROUPS', 'SERENDIMENT_ITEM_GROUPS', 'SOMMIER_ITEM_GROUPS', 'ITEM_GROUPS_BY_BRAND']);
const declarations = parsed.statements.filter(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(parsed))));
const { outputText } = ts.transpileModule(declarations.map(statement => statement.getText(parsed)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const groups = JSON.parse(vm.runInNewContext(`${outputText}\nJSON.stringify(ITEM_GROUPS_BY_BRAND);`));

test('self-heating bed pad is available only under Amante pads/mattress covers', () => {
  const pads = groups.amante.find(group => group.label === '패드/매트커버').items;
  assert.equal(pads.filter(item => item === '자가발열 침대패드').length, 1);
  assert.equal(pads.indexOf('자가발열 침대패드'), pads.indexOf('극세사 침대패드') + 1);
  for (const brand of ['imbedding', 'serendiment', 'sommier']) {
    assert(!groups[brand].some(group => group.items.includes('자가발열 침대패드')));
  }
  assert.deepEqual(groups.amante.map(group => ({ ...group, items: group.items.filter(item => item !== '자가발열 침대패드') })), groups.imbedding);
});
