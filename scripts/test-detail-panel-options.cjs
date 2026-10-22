const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { test } = require('node:test');

function compile(source, filename) {
  return ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
}
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename);
}

function loadPanel(relativePath, name) {
  const filename = path.join(__dirname, '..', relativePath);
  // Export the actual private component only in the test compilation. This
  // verifies its rendered information grid, not a duplicate of its condition.
  const source = `${fs.readFileSync(filename, 'utf8')}\nexport { ${name} };`;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compile(source, filename), filename);
  return loaded.exports[name];
}

const panels = [
  ['main', loadPanel('app/page.tsx', 'DetailPanel')],
  ['shared', loadPanel('app/share/[token]/ShareViewer.tsx', 'SharedDetailPanel')],
];
const example = {
  id: 'test-task', product: '타임리스', item: '밴딩 베개커버', option: 'Purple 단독',
  note: '*Purple 단독', html: '', images: [], vendors: [], storeLink: '',
  thumbnailNas: '', detailNas: '', shootingNas: '',
};
function infoGrid(Panel, task) {
  const html = renderToStaticMarkup(React.createElement(Panel, {
    task, onClose() {}, onEdit() {}, onCopied() {}, onNotice() {}, closing: false,
  }));
  const grid = html.match(/<div class="info-grid">([\s\S]*?)<\/div>/)?.[1];
  assert(grid, 'Detail information grid must render');
  return grid;
}

for (const [label, Panel] of panels) {
  test(`${label}: only Serendiment shows saved option values`, () => {
    for (const brandKey of ['amante', 'imbedding', 'sommier', undefined]) {
      const task = { ...example, brandKey };
      const before = JSON.stringify(task);
      const grid = infoGrid(Panel, task);
      assert(!grid.includes('<span>옵션</span>'), `${brandKey}: option label must be hidden`);
      assert(!grid.includes('<b>Purple 단독</b>'), `${brandKey}: option value must be hidden`);
      assert(grid.includes('<b class="wide">*Purple 단독</b>'), 'Notes must remain visible');
      assert.equal(JSON.stringify(task), before, 'Hiding the option must not erase stored data');
    }
    const grid = infoGrid(Panel, { ...example, brandKey: 'serendiment' });
    assert(grid.includes('<span>옵션</span><b>Purple 단독</b>'));
    assert(grid.includes('<span>제품명</span><b>타임리스</b>'));
    assert(grid.includes('<span>품목</span><b>밴딩 베개커버</b>'));
  });

  test(`${label}: empty Serendiment options do not leave an empty label`, () => {
    for (const option of ['', undefined]) {
      assert(!infoGrid(Panel, { ...example, brandKey: 'serendiment', option }).includes('<span>옵션</span>'));
    }
  });
}
