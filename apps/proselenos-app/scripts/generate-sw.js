const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get short git hash
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

const outDir = path.join(__dirname, '../out');

// Recursively get ALL files in a directory
function getAllFiles(dir, baseDir = dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      // Convert to URL path (relative to out/)
      const urlPath = '/' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
      files.push(urlPath);
    }
  }
  return files;
}

// Get ALL files from out/ directory
const allFiles = getAllFiles(outDir);

// Filter out sw.js (never cache the service worker itself)
// Only cache actual files - no clean URLs (miniserve serves real files)
const precacheUrls = [];

for (const file of allFiles) {
  // Skip the service worker
  if (file === '/sw.js') continue;

  // Skip _headers file (Cloudflare-specific)
  if (file === '/_headers') continue;

  // Add only actual files
  precacheUrls.push(file);
}

console.log(`Total files to precache: ${precacheUrls.length}`);

const swContent = `// Auto-generated at build time - do not edit manually
// Version: ${gitHash}
// Total precached files: ${precacheUrls.length}
const CACHE_VERSION = '${gitHash}';
const CACHE_NAME = \`everythingebooks-\${CACHE_VERSION}\`;

const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

// Install: pre-cache ALL static assets for full offline support
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Precaching', PRECACHE_URLS.length, 'files for offline use...');
        return Promise.all(
          PRECACHE_URLS.map((url) => {
            return fetch(url)
              .then((response) => {
                if (response.ok) {
                  return cache.put(url, response);
                }
                console.warn('Failed to fetch:', url, response.status);
              })
              .catch((err) => {
                console.warn('Failed to pre-cache:', url, err.message);
              });
          })
        );
      })
      .then(() => {
        console.log('Precaching complete - app ready for offline use');
        return self.skipWaiting();
      })
  );
});

// Activate: clean old caches, take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('everythingebooks-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for everything (safe for static export)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Never cache the service worker script itself
  if (url.pathname === '/sw.js') {
    return;
  }

  // Cache-first for everything
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      // Try .html version for clean URLs (e.g., /library -> /library.html)
      const pathname = url.pathname;
      if (!pathname.includes('.') && pathname !== '/') {
        const htmlUrl = pathname + '.html';
        return caches.match(htmlUrl).then((htmlCached) => {
          if (htmlCached) return htmlCached;
          // Fall through to network
          return fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          });
        });
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
`;

// Write directly to out/sw.js (after build)
const swPath = path.join(outDir, 'sw.js');
fs.writeFileSync(swPath, swContent);
console.log('Generated out/sw.js with version:', gitHash);
