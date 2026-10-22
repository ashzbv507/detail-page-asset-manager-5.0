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
const pathRows = [
  ['main', loadPanel('app/page.tsx', 'PathRow')],
  ['shared', loadPanel('app/share/[token]/ShareViewer.tsx', 'SharedPathRow')],
];

for (const [label, PathRow] of pathRows) {
  test(`${label}: every empty NAS path retains a disabled copy button`, () => {
    for (const fieldLabel of ['썸네일', '상세페이지', '촬영본']) {
      for (const value of ['', '   ', '\t\n']) {
        const row = PathRow({ label: fieldLabel, value, onCopied() { assert.fail('Empty paths must not be copied'); } });
        const button = React.Children.toArray(row.props.children).find(child => child.type === 'button');
        assert(button, 'Copy button must remain present');
        assert.equal(button.props.disabled, true);
        assert.equal(button.props.onClick, undefined);
        assert.equal(button.props['aria-label'], `${fieldLabel} 경로 복사`);
        const html = renderToStaticMarkup(row);
        assert.equal([...html.matchAll(/<button\b/g)].length, 1);
        assert(html.includes('disabled=""'));
        assert(html.includes(`<label>${fieldLabel}</label>`));
      }
    }
  });

  test(`${label}: populated NAS paths keep their enabled copy action`, () => {
    const value = '/쇼핑몰팀/2025 신규작업 썸네일/머핀/베개커버';
    const row = PathRow({ label: '썸네일', value, onCopied() {} });
    const button = React.Children.toArray(row.props.children).find(child => child.type === 'button');
    assert.equal(button.props.disabled, false);
    assert.equal(typeof button.props.onClick, 'function');
    const html = renderToStaticMarkup(row);
    assert(html.includes(value));
    assert(!html.includes('disabled=""'));
  });
}

test('empty NAS copy buttons have muted styling and cannot receive active hover styling', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert(css.includes('.saved-detail-panel .path-row button:hover:not(:disabled)'));
  const disabledStyle = css.match(/\.saved-detail-panel \.path-row button:disabled\s*\{([^}]+)\}/)?.[1];
  assert(disabledStyle);
  assert(/opacity:\s*0\.4/.test(disabledStyle));
  assert(/cursor:\s*not-allowed/.test(disabledStyle));
});
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
  test(`${label}: information fields keep their slots with link before vendor`, () => {
    const task = { ...example, brandKey: 'amante', storeLink: 'https://amantehome.com/product/test/1/', vendors: ['컬리 ONLY'] };
    const grid = infoGrid(Panel, task);
    const labels = [...grid.matchAll(/<span>(제품명|품목|옵션|링크|거래처|참고사항)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(labels, ['제품명', '품목', '링크', '거래처', '참고사항']);
    assert(grid.includes('<span>링크</span><a href="https://amantehome.com/product/test/1/" target="_blank" rel="noopener noreferrer">열기</a>'));
    assert(grid.includes('컬리 ONLY'));
    assert(grid.includes('<b class="wide">*Purple 단독</b>'));
  });

  test(`${label}: missing values stay blank without removing information labels`, () => {
    for (const missing of ['', undefined, null]) {
      const task = { ...example, brandKey: 'amante', storeLink: missing, vendors: missing === '' ? [] : missing, note: missing };
      const before = JSON.stringify(task);
      const grid = infoGrid(Panel, task);
      assert(grid.includes('<span>링크</span><b></b>'));
      assert(/<span>거래처<\/span><b(?: class="vendor-badges")?><\/b>/.test(grid));
      assert(grid.includes('<span>참고사항</span><b class="wide"></b>'));
      assert(!/>-</.test(grid), 'Do not add dash placeholders');
      assert.equal(JSON.stringify(task), before, 'Presentation must not change stored values');
    }
  });

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
