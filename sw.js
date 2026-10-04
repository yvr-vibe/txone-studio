// Scope cache names and URLs to this app so multiple Pages projects can coexist.
const BASE = new URL('./', self.location.href);
const PREFIX = `tonex-studio:${BASE.pathname}:`;
const CACHE = PREFIX + 'v40';
const SHELL = [
  './',
  'index.html',
  'getting-started.html',
  'src/app.js',
  'src/bypass-session.js',
  'src/effect-metadata.js',
  'src/ui/dom.js',
  'src/ui/preset-workspace.js',
  'src/ui/presets-panel.js',
  'src/ui/editor-panel.js',
  'src/ui/settings-panel.js',
  'src/ui/signal-chain.js',
  'src/preset-colors.js',
  'src/synced-division.js',
  'src/version.js',
  'src/cabinet-mode.js',
  'src/tap-tempo.js',
  'src/rhythmic-divisions.js',
  'src/effect-icons.js',
  'src/theme.js',
  'src/effect-interactions.js',
  'src/usb.js',
  'src/serial.js',
  'src/protocol.js',
  'src/parameters.js',
  'src/style.css',
  'manifest.webmanifest',
  'public/icon.svg',
  'public/fonts/dm-sans-latin-ext.woff2',
  'public/fonts/dm-sans-latin.woff2',
  'public/fonts/manrope-cyrillic-ext.woff2',
  'public/fonts/manrope-cyrillic.woff2',
  'public/fonts/manrope-greek.woff2',
  'public/fonts/manrope-vietnamese.woff2',
  'public/fonts/manrope-latin-ext.woff2',
  'public/fonts/manrope-latin.woff2',
].map((path) => new URL(path, BASE).href);
self.addEventListener('install', (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))),
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    url.origin !== BASE.origin ||
    !url.pathname.startsWith(BASE.pathname)
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok && SHELL.includes(url.href)) {
          const copy = response.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request, { cacheName: CACHE }).then(
          (cached) =>
            cached ||
            (e.request.mode === 'navigate'
              ? caches.match(new URL('index.html', BASE).href, {
                  cacheName: CACHE,
                })
              : Response.error()),
        ),
      ),
  );
});
