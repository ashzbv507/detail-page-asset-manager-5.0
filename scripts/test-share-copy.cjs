const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(relative, globals = {}) {
  const context = vm.createContext({ exports: {}, ...globals });
  vm.runInContext(compile(fs.readFileSync(path.join(root, relative), 'utf8')), context);
  return context.exports;
}

function clipboardEnvironment(primary, fallback) {
  let removed = false, focused = false, selected = false, commands = 0;
  class HTMLElement {}
  const previousFocus = Object.assign(new HTMLElement(), { isConnected: true, focus() { focused = true; } });
  return {
    globals: { HTMLElement, navigator: primary ? { clipboard: { writeText: primary } } : {}, document: {
      activeElement: previousFocus,
      createElement: () => ({ style: {}, setAttribute() {}, focus() {}, select() { selected = true; }, setSelectionRange() {}, remove() { removed = true; } }),
      body: { appendChild() {} },
      execCommand: () => { commands++; return fallback(); },
    } },
    state: () => ({ removed, focused, selected, commands }),
  };
}
test('primary copy reports success only after its promise resolves', async () => {
  let copied;
  const environment = clipboardEnvironment(async value => { copied = value; }, () => assert.fail('No fallback needed'));
  const { copyToClipboard } = load('app/lib/clipboard.ts', environment.globals);
  assert.equal(await copyToClipboard('https://example.com/share/test'), true);
  assert.equal(copied, 'https://example.com/share/test');
  assert.equal(environment.state().commands, 0);
});
test('denied or missing clipboard API falls back and restores focus', async () => {
  for (const primary of [undefined, async () => { throw Error('NotAllowedError'); }]) {
    const environment = clipboardEnvironment(primary, () => true);
    const { copyToClipboard } = load('app/lib/clipboard.ts', environment.globals);
    assert.equal(await copyToClipboard('test-link'), true);
    assert.deepEqual(environment.state(), { removed: true, focused: true, selected: true, commands: 1 });
  }
});
test('both copy methods failing returns false rather than a false success', async () => {
  for (const fallback of [() => false, () => { throw Error('Blocked'); }]) {
    const environment = clipboardEnvironment(async () => { throw Error('Denied'); }, fallback);
    const { copyToClipboard } = load('app/lib/clipboard.ts', environment.globals);
    assert.equal(await copyToClipboard('test-link'), false);
    assert.equal(environment.state().removed, true);
  }
});

function shareFlow(copyResults) {
  const source = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
  const parsed = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'createShareLink') declaration = `const ${node.getText(parsed)};`;
    ts.forEachChild(node, find);
  }
  find(parsed);
  assert(declaration, 'Use the actual application handler, not a duplicate implementation');
  const state = { requests: 0, copies: 0, successes: 0, popover: null, message: '', prepared: { current: null }, context: { current: 0 } };
  const globals = {
    URL, selectedBrand: 'amante', shareSelection: new Set(['one']), allTasks: [{ id: 'one' }], taskKey: task => task.id,
    shareRequestRef: { current: false }, shareContextRef: state.context, preparedShareRef: state.prepared,
    window: { location: { origin: 'https://example.com' } },
    fetch: async () => { state.requests++; return { ok: true, json: async () => ({ shareUrl: '/share/one' }) }; },
    copyToClipboard: async () => { state.copies++; return copyResults.shift() ?? false; },
    setShareBusy() {}, setShareMessage: value => { state.message = value; }, setSharePopoverUrl: value => { state.popover = value; },
    shareCopySucceeded: () => { state.successes++; },
  };
  const context = vm.createContext(globals);
  vm.runInContext(compile(declaration) + '\nthis.run = createShareLink;', context);
  return { state, context, run: () => context.run() };
}
test('failed auto-copy retains its URL and does not claim success or create a new link on retry', async () => {
  const { state, run } = shareFlow([false, false, true]);
  await run();
  assert.equal(state.popover, 'https://example.com/share/one');
  assert.equal(state.successes, 0);
  assert.equal(state.message, '');
  await run();
  await run();
  assert.equal(state.requests, 1);
  assert.equal(state.copies, 3);
  assert.equal(state.successes, 1);
});
test('changing selection makes an independently prepared link, while rapid duplicate clicks are ignored', async () => {
  const { state, context, run } = shareFlow([false, false]);
  await Promise.all([run(), run()]);
  assert.equal(state.requests, 1);
  context.shareSelection = new Set(['two']);
  context.allTasks = [{ id: 'two' }];
  await run();
  assert.equal(state.requests, 2);
});
test('changing brand/context while the request is pending never copies or shows a stale link', async () => {
  const { state, context, run } = shareFlow([false]);
  context.fetch = async () => { state.context.current++; return { ok: true, json: async () => ({ shareUrl: '/share/stale' }) }; };
  await run();
  assert.equal(state.copies, 0);
  assert.equal(state.popover, null);
});

const { sharePopoverPosition } = load('app/lib/share-popover-position.ts');
test('desktop bubble sits above the button with its arrow pointing at the button', () => {
  const anchor = { left: 1090, right: 1190, top: 650, bottom: 690 };
  const position = sharePopoverPosition(anchor, { width: 352, height: 210 }, { width: 1280, height: 720 });
  assert.equal(position.side, 'above');
  assert.equal(position.top + 210 + 12, anchor.top);
  assert.equal(position.left + position.arrowLeft, 1140);
});
test('mobile bubble stays within 12px gutters, including after visual viewport changes', () => {
  for (const width of [320, 375, 390]) {
    const position = sharePopoverPosition({ left: width - 108, right: width - 12, top: 580, bottom: 620 }, { width: 352, height: 210 }, { width, height: 664 });
    assert(position.left >= 12);
    assert(position.left + Math.min(352, width - 24) <= width - 12);
    assert.equal(position.side, 'above');
  }
  const shifted = sharePopoverPosition({ left: 250, right: 350, top: 580, bottom: 620 }, { width: 352, height: 210 }, { width: 390, height: 400, top: 200 });
  assert(shifted.top >= 212);
  assert(shifted.top + 210 <= 588);
});
test('shared-page header can flip the bubble downward rather than clipping it above the screen', () => {
  const position = sharePopoverPosition({ left: 1100, right: 1200, top: 30, bottom: 70 }, { width: 352, height: 210 }, { width: 1280, height: 720 });
  assert.equal(position.side, 'below');
  assert.equal(position.top, 82);
});
