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
  'modules/utils/PerformanceProfiler.js',
  'modules/utils/AlbumManager.js',
  'modules/utils/ProgressManager.js',
  'modules/database/DatabaseLoader.js',
  'modules/database/VocabularyBuilder.js',
  'modules/database/VocabularyTreeQuery.js',
  'modules/database/ZipDatabaseLoader.js',
  'modules/ui/UIManager.js',
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
  const assetDirs = ['images', 'assets', 'videos', 'targets'];
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
