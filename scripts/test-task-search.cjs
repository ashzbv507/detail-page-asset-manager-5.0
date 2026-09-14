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
const { matchesTaskSearch } = require('../app/lib/task-search.ts');
const task = {
  product: '폴란드 구스 (베이직)', item: '차렵이불',
  html: '<img src="https://example.test/HTML_ONLY.jpg">',
  storeLink: 'https://shop.test/products/store-only',
  thumbnailNas: '/쇼핑몰팀/신규 썸네일', detailNas: '/NAS/상세페이지', shootingNas: '/촬영본/가을',
  images: [{ name: 'original-only.png', url: 'https://example.test/%ED%95%9C%EA%B8%80.png' }],
};

test('search covers product, item, every NAS, HTML, store links and image metadata', () => {
  for (const query of ['폴란드', '차렵', '신규 썸네일', 'NAS/상세', '촬영본/가을', 'html_only', 'store-only', 'original-only', '한글.png']) {
    assert.equal(matchesTaskSearch(task, query), true, query);
  }
  assert.equal(matchesTaskSearch(task, 'group-label', 'group-label'), true);
  assert.equal(matchesTaskSearch(task, 'not-present'), false);
});
test('whitespace, case, missing fields and malformed percent escapes are safe', () => {
  assert.equal(matchesTaskSearch(task, '  HTML_ONLY  '), true);
  assert.equal(matchesTaskSearch(task, '신규   썸네일'), true);
  assert.equal(matchesTaskSearch(task, '   '), true);
  assert.equal(matchesTaskSearch({ ...task, storeLink: '100%broken', images: undefined }, 'absent'), false);
  assert.equal(matchesTaskSearch({ ...task, storeLink: undefined, images: [] }, 'store-only'), false);
});
