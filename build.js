/**
 * Ultra-Optimized Build Script for WebAR App
 * Creates a single highly optimized and obfuscated file with maximum performance
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs-extra');
const path = require('path');

// Configuration
const SOURCE_DIR = './';
const BUILD_DIR = './dist';
const MODULES_DIR = './modules';

// Module loading order (critical for dependencies)
const MODULE_ORDER = [
  'config.js', // Configuration must be loaded first
  'modules/utils/PerformanceProfiler.js',
  'modules/utils/DebugExporter.js',
  'modules/cache/CacheManager.js',
  'modules/utils/AlbumManager.js',
  'modules/utils/ProgressManager.js',
  'modules/database/DatabaseLoader.js',
  'modules/database/VocabularyBuilder.js',
  'modules/database/VocabularyTreeQuery.js',
  'modules/database/ZipDatabaseLoader.js',
  'modules/ui/UIManager.js',
  'modules/ui/OfflineManager.js',
  'modules/camera/CameraManager.js',
  'modules/reference/ReferenceImageManager.js',
  'modules/detection/FeatureDetector.js',
  'modules/tracking/OpticalFlowTracker.js',
  'modules/visualization/Visualizer.js',
  'modules/rendering/VideoManager.js',
  'modules/rendering/VideoARRenderer.js',
  'modules/core/ViewportManager.js',
  'modules/rendering/ARRenderer.js',
  'modules/core/ImageTracker.js'
];

// Ultra-performance obfuscation options
const ULTRA_OBFUSCATION_OPTIONS = {
  // Core settings
  compact: true,
  simplify: true,
  
  // Minimal obfuscation for maximum performance
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.2, // Very low for performance
  
  deadCodeInjection: false, // Disabled for performance
  
  // String protection (minimal)
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.4, // Very low for performance
  stringArrayCallsTransform: false, // Disabled for performance
  stringArrayIndexShift: true,
  stringArrayRotate: false, // Disabled for performance
  stringArrayShuffle: false, // Disabled for performance
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: false, // Disabled for performance
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'function',
  
  // Performance optimizations
  numbersToExpressions: false,
  splitStrings: false,
  transformObjectKeys: false, // Disabled for performance
  
  // Security (minimal)
  selfDefending: true,
  debugProtection: false,
  disableConsoleOutput: false,
  
  // Identifier naming
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  
  // Unicode
  unicodeEscapeSequence: false,
  
  // Logging
  log: false
};

/**
 * Minimal safe code optimization
 * Comment removal is unsafe with regex - let obfuscator handle it
 */
function optimizeCode(content) {
  return content
    // Only remove empty lines
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Read and concatenate all modules with optimizations
 */
async function bundleModules() {
  console.log('Bundling modules with ultra-optimization...');
  
  let bundleContent = '';
  const moduleContents = [];
  
  // Read all modules in order
  for (const modulePath of MODULE_ORDER) {
    const fullPath = path.join(SOURCE_DIR, modulePath);
    
    if (await fs.pathExists(fullPath)) {
      console.log(`Reading and optimizing: ${modulePath}`);
      let content = await fs.readFile(fullPath, 'utf8');
      
      // Apply code optimizations
      content = optimizeCode(content);
      
      moduleContents.push({
        path: modulePath,
        content: content
      });
    } else {
      console.warn(`Module not found: ${modulePath}`);
    }
  }
  
  // Create ultra-optimized bundle
  bundleContent += '/* WebAR Ultra-Optimized Bundle */\n';
  bundleContent += '/* Generated: ' + new Date().toISOString() + ' */\n';
  
  for (const module of moduleContents) {
    bundleContent += module.content;
  }
  
  return bundleContent;
}

/**
 * Create ultra-optimized entry point
 */
function createUltraOptimizedEntryPoint() {
  return `(function(){'use strict';function init(){if(window.ImageTracker){new window.ImageTracker()}}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init()})();`;
}

/**
 * Copy static files with optimizations
 */
async function copyStaticFiles() {
  console.log('Copying and optimizing static files...');

  // Copy HTML files
  const htmlFiles = await fs.readdir(SOURCE_DIR);
  for (const file of htmlFiles) {
    if (file.endsWith('.html')) {
      let htmlContent = await fs.readFile(path.join(SOURCE_DIR, file), 'utf8');
      
      // Optimize HTML
      htmlContent = htmlContent
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
      
      await fs.writeFile(path.join(BUILD_DIR, file), htmlContent);
      console.log(`Copied and optimized: ${file}`);
    }
  }

  // Copy CSS files with optimization
  if (await fs.pathExists('./styles.css')) {
    let cssContent = await fs.readFile('./styles.css', 'utf8');
    
    // Basic CSS optimization
    cssContent = cssContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/;\s*}/g, '}') // Remove trailing semicolons
      .replace(/:\s+/g, ':') // Remove space after colons
      .replace(/;\s+/g, ';') // Remove space after semicolons
      .trim();
    
    await fs.writeFile(path.join(BUILD_DIR, 'styles.css'), cssContent);
    console.log('Copied and optimized: styles.css');
  }

  // Copy JSON files
  if (await fs.pathExists('./target_database.json')) {
    await fs.copy('./target_database.json',
      path.join(BUILD_DIR, 'target_database.json'));
    console.log('Copied: target_database.json');
  }

  // Copy assets directories
  const assetDirs = ['images', 'assets', 'videos', 'targets', 'fonts'];
  for (const dir of assetDirs) {
    if (await fs.pathExists(`./${dir}`)) {
      await fs.copy(`./${dir}`, path.join(BUILD_DIR, dir));
      console.log(`Copied directory: ${dir}`);
    }
  }
}

/**
 * Update HTML to use ultra-optimized bundle
 */
async function updateHTML() {
  const htmlPath = path.join(BUILD_DIR, 'index.html');
  
  if (await fs.pathExists(htmlPath)) {
    let htmlContent = await fs.readFile(htmlPath, 'utf8');
    
    // Replace script loading with ultra-optimized bundle
    htmlContent = htmlContent.replace(
      '<script src="imageTracker.js" defer></script>',
      '<script src="webar-bundle.js" defer></script>'
    );
    
    await fs.writeFile(htmlPath, htmlContent);
    console.log('Updated HTML to use ultra-optimized bundle');
  }
}

/**
 * Create optimized service worker for bundled build
 */
async function createServiceWorker() {
  console.log('Creating optimized service worker...');

  const swContent = `/**
 * Service Worker for WebAR Image Tracking PWA
 * Handles caching of CDN libraries, app assets, and album resources
 */

const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
  static: \`webar-static-\${CACHE_VERSION}\`,
  cdn: \`webar-cdn-\${CACHE_VERSION}\`,
  runtime: \`webar-runtime-\${CACHE_VERSION}\`
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
  '/webar-bundle.js',
  '/manifest.json'
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
  if (STATIC_RESOURCES.includes(url.pathname)) {
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
`;

  await fs.writeFile(path.join(BUILD_DIR, 'sw.js'), swContent);
  console.log('Created optimized service worker: sw.js');
}

/**
 * Main ultra-optimized build process
 */
async function build() {
  try {
    console.log('Starting ultra-optimized build process...\n');

    // Clean build directory
    console.log('Cleaning build directory...');
    await fs.remove(BUILD_DIR);
    await fs.ensureDir(BUILD_DIR);

    // Bundle all modules with optimizations
    console.log('\nBundling and optimizing modules...');
    const bundleContent = await bundleModules();
    
    // Add ultra-optimized entry point
    const entryPoint = createUltraOptimizedEntryPoint();
    const fullBundle = bundleContent + entryPoint;
    
    // Obfuscate with ultra-performance settings
    console.log('\nApplying ultra-performance obfuscation...');
    let obfuscatedBundle;
    try {
      obfuscatedBundle = JavaScriptObfuscator.obfuscate(fullBundle, ULTRA_OBFUSCATION_OPTIONS).getObfuscatedCode();
    } catch (error) {
      console.error('Ultra obfuscation failed:', error.message);
      console.log('Using non-obfuscated ultra bundle...');
      obfuscatedBundle = fullBundle;
    }
    
    // Write the ultra-optimized bundle
    const bundlePath = path.join(BUILD_DIR, 'webar-bundle.js');
    await fs.writeFile(bundlePath, obfuscatedBundle);
    
    const sizeKB = Math.round(obfuscatedBundle.length / 1024);
    console.log(`Created: webar-bundle.js (${sizeKB}KB)`);

    // Copy and optimize static files
    console.log('\nCopying and optimizing static files...');
    await copyStaticFiles();

    // Update HTML
    await updateHTML();

    console.log('\n✓ Ultra-optimized build completed successfully!');
    console.log(`Output directory: ${BUILD_DIR}`);
    console.log('Single bundled file: webar-bundle.js');
    console.log('Performance optimizations: MAXIMUM');
    console.log('Obfuscation level: ULTRA-PERFORMANCE');

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();
