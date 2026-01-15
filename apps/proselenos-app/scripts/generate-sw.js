const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get short git hash
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

const outDir = path.join(__dirname, '../out');

// Recursively get all files in a directory
function getAllFiles(dir, baseDir = dir) {
  const files = [];
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

// Get all static assets from out/_next/static/
function getStaticAssets() {
  const staticDir = path.join(outDir, '_next/static');
  if (!fs.existsSync(staticDir)) {
    console.warn('Warning: _next/static directory not found');
    return [];
  }
  return getAllFiles(staticDir, outDir);
}

// Get all HTML and RSC payload files from out/
function getPageFiles() {
  const pages = [];
  const entries = fs.readdirSync(outDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      if (entry.name.endsWith('.html') || entry.name.endsWith('.txt')) {
        // Convert filename to URL path
        const urlPath = entry.name === 'index.html' ? '/' : '/' + entry.name;
        pages.push(urlPath);
      }
    }
  }
  return pages;
}

// Build the precache list
const staticAssets = getStaticAssets();
const pageFiles = getPageFiles();

// Core routes (clean URLs)
const coreRoutes = [
  '/library',
  '/authors',
  '/reader',
];

// Combine all URLs to precache
const allPrecacheUrls = [
  ...coreRoutes,
  ...pageFiles,
  ...staticAssets,
];

// Remove duplicates
const precacheUrls = [...new Set(allPrecacheUrls)];

console.log(`Found ${staticAssets.length} static assets`);
console.log(`Found ${pageFiles.length} page files`);
console.log(`Total precache URLs: ${precacheUrls.length}`);

const swContent = `// Auto-generated at build time - do not edit manually
// Version: ${gitHash}
// Total precached files: ${precacheUrls.length}
const CACHE_VERSION = '${gitHash}';
const CACHE_NAME = \`everythingebooks-\${CACHE_VERSION}\`;

const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Precaching', PRECACHE_URLS.length, 'files...');
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
        console.log('Precaching complete');
        return self.skipWaiting();
      })
  );
});

// Activate: clean old caches, take control
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
