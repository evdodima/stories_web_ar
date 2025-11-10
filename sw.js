/**
 * Service Worker for WebAR Image Tracking PWA
 * Handles caching of CDN libraries, app assets, and album resources
 */

const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
  static: `webar-static-${CACHE_VERSION}`,
  cdn: `webar-cdn-${CACHE_VERSION}`,
  runtime: `webar-runtime-${CACHE_VERSION}`
};

// CDN resources to cache on install
const CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/opencv.js-webassembly@4.2.0/opencv.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

// Static app resources to cache on install
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/styles.css',
  '/imageTracker.js',
  '/modules/utils/PerformanceProfiler.js',
  '/modules/utils/AlbumManager.js',
  '/modules/utils/ProgressManager.js',
  '/modules/database/VocabularyTreeQuery.js',
  '/modules/database/VocabularyBuilder.js',
  '/modules/database/ZipDatabaseLoader.js',
  '/modules/ui/UIManager.js',
  '/modules/camera/CameraManager.js',
  '/modules/reference/ReferenceImageManager.js',
  '/modules/detection/FeatureDetector.js',
  '/modules/tracking/OpticalFlowTracker.js',
  '/modules/rendering/VideoManager.js',
  '/modules/core/ViewportManager.js',
  '/modules/rendering/ARRenderer.js',
  '/modules/core/ImageTracker.js'
];

/**
 * Install event - cache static resources and CDN libraries
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');

  event.waitUntil(
    Promise.all([
      // Cache static app resources
      caches.open(CACHE_NAMES.static).then((cache) => {
        console.log('[SW] Caching static resources');
        return cache.addAll(STATIC_RESOURCES);
      }),
      // Cache CDN libraries
      caches.open(CACHE_NAMES.cdn).then((cache) => {
        console.log('[SW] Caching CDN resources');
        return cache.addAll(CDN_RESOURCES);
      })
    ]).then(() => {
      console.log('[SW] Installation complete');
      // Activate immediately
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old cache versions
          if (Object.values(CACHE_NAMES).indexOf(cacheName) === -1) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activation complete');
      // Take control immediately
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache API calls (album download requests)
  if (url.hostname === 'pro.stories-ar.com' &&
      url.pathname.includes('/api/')) {
    return; // Let browser handle normally
  }

  // Don't cache S3 pre-signed URLs (handled by IndexedDB in AlbumManager)
  if (url.hostname.includes('amazonaws.com')) {
    return; // Let browser handle normally
  }

  event.respondWith(handleFetch(event.request));
});

/**
 * Handle fetch requests with appropriate caching strategy
 */
async function handleFetch(request) {
  const url = new URL(request.url);

  // Strategy 1: Cache First for CDN resources
  if (CDN_RESOURCES.includes(request.url)) {
    return cacheFirst(request, CACHE_NAMES.cdn);
  }

  // Strategy 2: Network First for static app resources
  if (STATIC_RESOURCES.includes(url.pathname) ||
      url.pathname.startsWith('/modules/')) {
    return networkFirst(request, CACHE_NAMES.static);
  }

  // Strategy 3: Network First with runtime cache for everything else
  return networkFirst(request, CACHE_NAMES.runtime);
}

/**
 * Cache First Strategy
 * Try cache first, fallback to network if not found
 */
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) {
      console.log('[SW] Cache hit:', request.url);
      return cached;
    }

    console.log('[SW] Cache miss, fetching:', request.url);
    const response = await fetch(request);

    // Cache the response for future use
    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error('[SW] Cache First error:', error);
    throw error;
  }
}

/**
 * Network First Strategy
 * Try network first, fallback to cache if offline
 */
async function networkFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);

    try {
      const response = await fetch(request);

      // Update cache with fresh response
      if (response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    } catch (networkError) {
      // Network failed, try cache
      console.log('[SW] Network failed, trying cache:', request.url);
      const cached = await cache.match(request);

      if (cached) {
        console.log('[SW] Serving from cache:', request.url);
        return cached;
      }

      // No cache available either
      throw networkError;
    }
  } catch (error) {
    console.error('[SW] Network First error:', error);

    // Return offline page if available
    if (request.mode === 'navigate') {
      const offlineCache = await caches.open(CACHE_NAMES.static);
      const offlinePage = await offlineCache.match('/index.html');
      if (offlinePage) {
        return offlinePage;
      }
    }

    throw error;
  }
}

/**
 * Message handler for cache management commands
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }

  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      estimateCacheSize().then((size) => {
        event.ports[0].postMessage({ size });
      })
    );
  }
});

/**
 * Estimate total cache size
 */
async function estimateCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();

    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }

  return totalSize;
}
