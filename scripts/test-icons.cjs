const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { test } = require('node:test');
const { Copy, ExternalLink, ArrowLeftRight, GripVertical } = require('lucide-react');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { iconProps } = require('../app/lib/icon-props.ts');
const screens = [
  'app/page.tsx', 'app/share/[token]/ShareViewer.tsx', 'app/html-preview/page.tsx',
  'app/components/HtmlCodeDrawer.tsx', 'app/components/ShareLinkPopover.tsx',
  'app/components/SortableImageList.tsx', 'app/components/ImageTargetSelect.tsx',
];

test('one shared set of decorative Lucide defaults', () => {
  assert.deepEqual(iconProps, { size: 16, strokeWidth: 1.75, absoluteStrokeWidth: false, color: 'currentColor', 'aria-hidden': true, focusable: false });
  for (const Icon of [Copy, ExternalLink, ArrowLeftRight, GripVertical]) {
    const html = renderToStaticMarkup(React.createElement(Icon, iconProps));
    for (const attribute of ['width="16"', 'height="16"', 'stroke-width="1.75"', 'stroke="currentColor"', 'aria-hidden="true"', 'focusable="false"']) assert(html.includes(attribute), attribute);
    assert(!html.includes('vector-effect='));
  }
});

for (const file of screens) test(`${file}: all functional icons use centrally managed settings`, () => {
  const text = read(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const icons = new Set();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'lucide-react') {
      for (const element of statement.importClause.namedBindings.elements) icons.add(element.name.text);
    }
  }
  let count = 0;
  function visit(node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && icons.has(node.tagName.getText(source))) {
      count++;
      const attributes = node.attributes.properties;
      const propsName = 'iconProps';
      assert(attributes.some(a => ts.isJsxSpreadAttribute(a) && a.expression.getText(source) === propsName));
      for (const attribute of attributes) {
        assert(ts.isJsxSpreadAttribute(attribute) ? attribute.expression.getText(source) === propsName : attribute.name.getText(source) === 'className', node.getText(source));
      }
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'svg') assert.fail('Use Lucide, not a separate inline SVG');
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(count > 0);
  assert(!text.includes('⋮⋮'));
});

test('CSS does not override Lucide geometry, stroke or inherited colors', () => {
  const css = read('app/globals.css');
  for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/svg|\.lucide|\.copy-icon|\.field-search|\.image-target-chevron/.test(selector)) continue;
    assert(!/(?:^|[;\n])\s*(?:width|height|min-width|min-height|stroke|stroke-width|fill|color)\s*:/.test(declarations), selector);
    assert(!/\b(?:scale|zoom)\s*\(/.test(declarations), selector);
  }
  assert(!css.includes('/figma-chevron-down.svg'));
  assert(/\.file \.drag-handle\s*\{[^}]*touch-action:\s*none/s.test(css));
});

test('drag handles keep the original activator, pointer and keyboard sensors', () => {
  const source = read('app/components/SortableImageList.tsx');
  assert.equal([...source.matchAll(/<GripVertical \{\.\.\.iconProps\} \/>/g)].length, 2);
  for (const text of ['ref={setActivatorNodeRef}', '{...attributes}', 'listeners?.onKeyDown?.(event)', 'listeners?.onPointerDown?.(event)', 'useSensor(PointerSensor', 'useSensor(KeyboardSensor', 'sortableKeyboardCoordinates', 'onDragEnd=', 'onDragCancel=']) assert(source.includes(text), text);
});

test('new-window preview text is balanced with the shared 16px icon without enlarging button height', () => {
  const css = read('app/globals.css');
  const rule = css.match(/\.preview-box-title button\s*\{([^}]+)\}/)?.[1];
  assert(rule);
  for (const declaration of ['font-size: 13px;', 'line-height: 16px;', 'height: 28px;', 'gap: 5px;']) assert(rule.includes(declaration), declaration);
});
