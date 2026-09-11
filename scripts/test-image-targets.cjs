const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');

// Exercise the actual TypeScript modules and route handlers without a database.
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(outputText, filename);
};

const { BRAND_KEYS } = require('../app/lib/task-types.ts');
const { getImageHtmlTarget, decodeStoredImageUrl, encodeStoredImageUrl } = require('../app/lib/image-target.ts');
const { buildImageUrl, generateGeneralHtml, generateKurlyHtml, withPreviewImageVersion } = require('../app/lib/html.ts');
const tasksRoute = require('../app/api/tasks/route.ts');
const { getShareRecord } = require('../app/api/shares/route.ts');
const filenames = (html) => [...html.matchAll(/src=['"]([^'"]+)['"]/g)].map((match) => new URL(match[1]).pathname.split('/').pop());
const image = (name, htmlTarget) => ({ id: name, name, url: `https://example.invalid/${name}`, htmlTarget });

test('all brands filter both outputs, preserving order and production URLs', () => {
  const images = [image('common.jpg', 'common'), image('general.jpg', 'general'), image('kurly.jpg', 'kurly'), image('last.jpg', 'common')];
  for (const brand of BRAND_KEYS) {
    const general = generateGeneralHtml(images, brand);
    const kurly = generateKurlyHtml(images, brand);
    assert.deepEqual(filenames(general), ['common.jpg', 'general.jpg', 'last.jpg']);
    assert.deepEqual(filenames(kurly), ['common.jpg', 'kurly.jpg', 'last.jpg']);
    assert.ok(general.includes(buildImageUrl('general.jpg', brand)));
    assert.ok(kurly.includes(buildImageUrl('kurly.jpg', brand)));
    assert.doesNotMatch(general + kurly, /#kurly|[?&]preview=/);
    assert.equal(generateGeneralHtml([images[2]], brand), '');
    assert.equal(generateKurlyHtml([images[1]], brand), '');
    assert.deepEqual(filenames(generateKurlyHtml([...images].reverse(), brand)), ['last.jpg', 'kurly.jpg', 'common.jpg']);
  }
});

test('existing exclusions, URL markers, and every target transition remain compatible', () => {
  assert.equal(getImageHtmlTarget({}), 'common');
  assert.equal(getImageHtmlTarget({ excludeFromKurly: true }), 'general');
  assert.equal(getImageHtmlTarget({ htmlTarget: 'common', excludeFromKurly: true }), 'common');
  assert.equal(getImageHtmlTarget({ htmlTarget: 'invalid', excludeFromKurly: true }), 'general');
  const url = 'https://example.invalid/photo.jpg';
  for (const previous of ['common', 'general', 'kurly']) {
    for (const next of ['common', 'general', 'kurly']) {
      const stored = encodeStoredImageUrl(encodeStoredImageUrl(url, { htmlTarget: previous }), { htmlTarget: next });
      const decoded = decodeStoredImageUrl(stored);
      assert.equal(decoded.url, url);
      assert.equal(decoded.htmlTarget, next);
      assert.equal(decoded.excludeFromKurly, next === 'general');
    }
  }
  const legacy = { id: 'legacy', name: 'legacy.jpg', url, excludeFromKurly: true };
  assert.deepEqual(filenames(generateGeneralHtml([legacy])), ['legacy.jpg']);
  assert.equal(generateKurlyHtml([legacy]), '');
  assert.equal(generateGeneralHtml([{ ...legacy, excludeFromKurly: false, url: `${url}#kurly-only` }]), '');
  assert.equal(decodeStoredImageUrl(`${url}#kurly-excluded`).htmlTarget, 'general');
  const preview = withPreviewImageVersion(url, 123);
  assert.equal(new URL(preview).searchParams.get('preview'), '123');
  assert.equal(url, 'https://example.invalid/photo.jpg');
});

test('create, edit, reload, and live/legacy shares retain targets without leaking storage markers', async (t) => {
  const previousEnv = { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = 'https://test-database.invalid';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  t.after(() => {
    for (const [key, value] of [['SUPABASE_URL', previousEnv.url], ['SUPABASE_SECRET_KEY', previousEnv.secret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  let savedRows = [];
  let snapshot;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    assert.equal(new URL(url).origin, 'https://test-database.invalid');
    if (String(url).includes('/asset_shares?')) return Response.json([{ snapshot_data: snapshot }]);
    if (init.method === 'POST') savedRows = JSON.parse(init.body);
    if (init.method === 'PATCH') savedRows = [JSON.parse(init.body)];
    return Response.json(savedRows);
  });
  for (const brandKey of BRAND_KEYS) {
    const id = '12345678-1234-1234-1234-123456789abc';
    const images = [image('common.jpg', 'common'), image('general.jpg', 'general'), image('kurly.jpg', 'kurly')];
    const payload = { id, brandKey, productName: 'Test', itemName: 'Test', images, detailHtml: generateGeneralHtml(images, brandKey) };
    const created = await tasksRoute.POST(new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify({ task: payload }) }));
    assert.equal(created.status, 200);
    assert.ok(savedRows[0].image_urls[1].endsWith('#kurly-excluded'));
    assert.ok(savedRows[0].image_urls[2].endsWith('#kurly-only'));
    const loaded = (await (await tasksRoute.GET(new Request('http://localhost/api/tasks'))).json()).tasks[0];
    assert.deepEqual(loaded.images.map(getImageHtmlTarget), ['common', 'general', 'kurly']);
    assert.deepEqual(filenames(loaded.detailHtml), ['common.jpg', 'general.jpg']);
    assert.deepEqual(filenames(generateKurlyHtml(loaded.images, brandKey)), ['common.jpg', 'kurly.jpg']);
    assert.ok(loaded.images.every((entry) => !entry.url.includes('#kurly')));
    snapshot = { taskIds: [id] };
    const shared = (await getShareRecord('test-token')).tasks[0];
    assert.deepEqual(shared.images.map(getImageHtmlTarget), ['common', 'general', 'kurly']);
    assert.deepEqual(filenames(generateKurlyHtml(shared.images, brandKey)), ['common.jpg', 'kurly.jpg']);
    const changed = loaded.images.map((entry) => ({ ...entry, htmlTarget: 'common' }));
    const edited = await tasksRoute.PATCH(new Request(`http://localhost/api/tasks?id=${id}`, { method: 'PATCH', body: JSON.stringify({ task: { ...payload, images: changed, detailHtml: generateGeneralHtml(changed, brandKey) } }) }));
    assert.equal(edited.status, 200);
    const roundTrip = (await edited.json()).tasks[0];
    assert.deepEqual(roundTrip.images.map(getImageHtmlTarget), ['common', 'common', 'common']);
    assert.ok(savedRows[0].image_urls.every((url) => !url.includes('#kurly')));
    assert.deepEqual(filenames(roundTrip.detailHtml), ['common.jpg', 'general.jpg', 'kurly.jpg']);
    snapshot = { tasks: [{ ...shared, images: [{ ...image('old.jpg'), excludeFromKurly: true }] }] };
    assert.equal(generateKurlyHtml((await getShareRecord('legacy-token')).tasks[0].images, brandKey), '');
  }
});
