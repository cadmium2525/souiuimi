/* Built by vite.config.ts; this file itself is not served as an application module. */
const VERSION = '__BUILD_VERSION__';
const FILES = __PRECACHE_FILES__;
const SCOPE = self.registration.scope;
const SCOPE_KEY = encodeURIComponent(new URL(SCOPE).pathname);
const PREFIX = `souiu-imi-precache-${SCOPE_KEY}-`;
const CACHE = `${PREFIX}${VERSION}`;
const URLS = new Set(FILES.map((file) => new URL(file, SCOPE).href));
const SHELL = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  // A failed download leaves the already installed version available offline.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll([...URLS].map((url) => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

async function pageAssets(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      const entry = event.data?.entry;
      if (typeof entry !== 'string' || !entry.startsWith(SCOPE)) { resolve(null); return; }
      // The entry-only fallback supports tabs opened with the first PWA build.
      const assets = Array.isArray(event.data?.assets) ? event.data.assets : [entry];
      resolve([...new Set([entry, ...assets].filter((asset) => {
        if (typeof asset !== 'string') return false;
        try { return new URL(asset).origin === self.location.origin && asset.startsWith(SCOPE); }
        catch { return false; }
      }))]);
    };
    try { client.postMessage({ type: 'PWA_VERSION_QUERY' }, [channel.port2]); }
    catch { clearTimeout(timer); channel.port1.close(); resolve(null); }
  });
}

async function cleanUnusedVersions() {
  const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter((client) => client.url.startsWith(SCOPE));
  const replies = await Promise.all(clients.map(pageAssets));
  // Older or suspended pages may not answer. Never remove their cached assets.
  if (replies.some((assets) => assets === null)) return;
  const assets = [...new Set(replies.flat())];
  const names = (await caches.keys()).filter((name) => name.startsWith(PREFIX));
  const previous = names.filter((name) => name !== CACHE).at(-1);
  const keep = new Set([CACHE, previous]);
  for (const asset of assets) {
    // Preserve stylesheet hashes too: a CSS-only release can share its script
    // entry with an older page while that page still needs its own stylesheet.
    for (const name of [...names].reverse()) {
      if (await (await caches.open(name)).match(asset)) { keep.add(name); break; }
    }
  }
  await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
}

self.addEventListener('activate', (event) => {
  // Keep assets still used by an open tab, plus the previous complete version.
  event.waitUntil((async () => { await self.clients.claim(); await cleanUnusedVersions(); })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CLIENT_READY') event.waitUntil(cleanUnusedVersions());
});

async function mediaRange(request, response) {
  const range = request.headers.get('Range');
  if (!range || response.status !== 200 || !/\.(mp3|ogg|wav|m4a)$/i.test(new URL(request.url).pathname)) return response;
  // Browsers may request only part of a recording when decoding or looping.
  // The precache contains the complete file, including while offline.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || first >= size || last < first || (!match[1] && Number(match[2]) === 0)) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${first}-${last}/${size}`);
  headers.set('Content-Length', String(last - first + 1));
  return new Response(bytes.slice(first, last + 1), { status: 206, statusText: 'Partial Content', headers });
}

async function cachedAsset(request) {
  const current = await caches.open(CACHE);
  const hit = await current.match(request, { ignoreSearch: true });
  if (hit) return mediaRange(request, hit);
  // A previous tab may still request one of its own hashed files after update.
  for (const name of (await caches.keys()).filter((name) => name.startsWith(PREFIX))) {
    if (name === CACHE) continue;
    const older = await (await caches.open(name)).match(request, { ignoreSearch: true });
    if (older) return mediaRange(request, older);
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    // The game shell and its dedicated credits page are separate documents.
    const documentURL = new URL(url.href); documentURL.search = ''; documentURL.hash = '';
    const documentAsset = URLS.has(documentURL.href) && documentURL.pathname.endsWith('.html') ? documentURL.href : SHELL;
    event.respondWith((async () => (await (await caches.open(CACHE)).match(documentAsset)) || fetch(request))());
    return;
  }
  const path = new URL(url.href); path.search = ''; path.hash = '';
  if (URLS.has(path.href) || url.pathname.includes('/assets/')) event.respondWith(cachedAsset(request));
});
