import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
for (const prefix of ['/', '/txone-studio/']) {
  test(`web assets and install URLs resolve inside ${prefix}`, () => {
    const base = new URL(prefix, 'https://example.github.io');
    const html = read('index.html');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = new URL(match[1], base);
      if (url.origin !== base.origin) continue;
      assert.ok(url.pathname.startsWith(prefix));
      const file = url.pathname.slice(prefix.length);
      if (file)
        assert.ok(existsSync(new URL('../' + file, import.meta.url)), file);
    }
    const manifest = JSON.parse(read('manifest.webmanifest'));
    for (const field of ['id', 'start_url', 'scope'])
      assert.equal(
        new URL(manifest[field], new URL('manifest.webmanifest', base)).href,
        base.href,
      );
    assert.equal(
      new URL('../sw.js', new URL('src/app.js', base)).href,
      new URL('sw.js', base).href,
    );
  });
  test(`service worker cache and offline fallback stay inside ${prefix}`, async () => {
    const handlers = {},
      added = [],
      deleted = [],
      matches = [];
    const appPrefix = `tonex-studio:${prefix}:`,
      cacheName = appPrefix + 'v40';
    const caches = {
      open: async () => ({ addAll: async (urls) => added.push(...urls) }),
      keys: async () => [
        appPrefix + 'v28',
        cacheName,
        'tonex-studio:/other/:v4',
      ],
      delete: async (key) => deleted.push(key),
      match: async (url, options) => {
        matches.push({ url, options });
        return String(url).endsWith('index.html') ? 'offline HTML' : undefined;
      },
    };
    vm.runInNewContext(read('sw.js'), {
      URL,
      Response,
      self: {
        location: { href: `https://example.github.io${prefix}sw.js` },
        addEventListener: (type, handler) => (handlers[type] = handler),
      },
      caches,
      fetch: async () => {
        throw Error('offline');
      },
    });
    let pending;
    handlers.install({ waitUntil: (p) => (pending = p) });
    await pending;
    const sourceModules = readdirSync(new URL('../src/', import.meta.url), {
      recursive: true,
    }).filter((file) => file.endsWith('.js'));
    for (const file of sourceModules)
      assert.ok(
        added.includes(
          new URL('src/' + file, `https://example.github.io${prefix}`).href,
        ),
        `Offline shell misses ${file}`,
      );
    assert.ok(
      added.every((url) =>
        url.startsWith(`https://example.github.io${prefix}`),
      ),
    );
    handlers.activate({ waitUntil: (p) => (pending = p) });
    await pending;
    assert.deepEqual(deleted, [appPrefix + 'v28']);
    let response;
    handlers.fetch({
      request: {
        url: `https://example.github.io${prefix}`,
        method: 'GET',
        mode: 'navigate',
      },
      respondWith: (p) => (response = p),
    });
    assert.equal(await response, 'offline HTML');
    assert.ok(matches.every((m) => m.options.cacheName === cacheName));
    let handled = false;
    handlers.fetch({
      request: { url: 'https://different.example/', method: 'GET' },
      respondWith: () => (handled = true),
    });
    assert.equal(handled, false);
  });
}
