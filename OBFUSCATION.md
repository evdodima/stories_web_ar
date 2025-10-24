# JavaScript Obfuscation Guide

## Overview

This WebAR application uses JavaScript obfuscation to protect the proprietary AR engine code from reverse engineering. The obfuscation is applied during the build process using `javascript-obfuscator`.

## What Gets Obfuscated

### All JavaScript Files
- `imageTracker.js` - Main entry point and module loader
- `modules/core/ImageTracker.js` - Core tracking engine
- `modules/detection/FeatureDetector.js` - BRISK feature detection
- `modules/tracking/OpticalFlowTracker.js` - Lucas-Kanade tracking
- `modules/camera/CameraManager.js` - Camera handling
- `modules/rendering/ARRenderer.js` - AR overlay rendering
- `modules/rendering/VideoManager.js` - Video playback
- `modules/ui/UIManager.js` - User interface
- `modules/database/DatabaseLoader.js` - Reference image database
- `modules/database/VocabularyTreeQuery.js` - Image matching
- `modules/reference/ReferenceImageManager.js` - Reference management
- `modules/utils/PerformanceProfiler.js` - Performance monitoring
- `modules/visualization/Visualizer.js` - Debug visualization

### What Stays Readable
- HTML files (index.html)
- CSS files (styles.css)
- JSON data (target_database.json)
- Image/video assets

## Obfuscation Techniques

### 1. String Array Encoding
Strings are extracted to an encoded array and accessed via decoder functions:

```javascript
// Before
const message = "Tracking initialized";

// After (simplified)
const _0x1a2b = ['VHJhY2tpbmcgaW5pdGlhbGl6ZWQ='];
const _0x3c4d = _0x1a2b[0];
const message = atob(_0x3c4d);
```

### 2. Control Flow Flattening
Makes code flow non-linear and harder to follow:

```javascript
// Before
function calculate(x) {
  const a = x * 2;
  const b = a + 5;
  return b;
}

// After (simplified)
function calculate(x) {
  let _state = 0;
  while (true) {
    switch (_state) {
      case 0: const a = x * 2; _state = 1; break;
      case 1: const b = a + 5; _state = 2; break;
      case 2: return b;
    }
  }
}
```

### 3. Identifier Renaming
Variable and function names become hexadecimal:

```javascript
// Before
function detectFeatures(image) {
  const keypoints = [];
  return keypoints;
}

// After
function _0x4a5b(_0x1c2d) {
  const _0x3e4f = [];
  return _0x3e4f;
}
```

### 4. Dead Code Injection
Adds unreachable code paths:

```javascript
// After obfuscation
if (Math.random() > 1.5) {
  // This never runs but confuses analysis
  console.log('fake code');
}
```

### 5. Self-Defending
Code detects and breaks if formatted or debugged:

```javascript
// Code checks its own format
const _self = Function.toString.call(this);
if (_self.indexOf('_0x') === -1) {
  throw new Error();
}
```

## Configuration Options

Located in `build.js`:

```javascript
const OBFUSCATION_OPTIONS = {
  // Compression
  compact: true,                          // Remove whitespace

  // Control Flow
  controlFlowFlattening: true,            // Flatten code flow
  controlFlowFlatteningThreshold: 0.5,    // 50% of code affected

  // Dead Code
  deadCodeInjection: true,                // Add fake code
  deadCodeInjectionThreshold: 0.2,        // 20% fake code

  // String Protection
  stringArray: true,                      // Extract strings
  stringArrayEncoding: ['base64'],        // Encode strings
  stringArrayThreshold: 0.75,             // 75% strings encoded

  // Self Protection
  selfDefending: true,                    // Anti-debugging

  // Identifier Renaming
  identifierNamesGenerator: 'hexadecimal',

  // Performance
  simplify: true,                         // Simplify code
  transformObjectKeys: true               // Obfuscate object keys
};
```

## Performance Tuning

### High Protection (Slower)
For critical IP protection:

```javascript
controlFlowFlatteningThreshold: 0.75,    // 75% flattened
deadCodeInjectionThreshold: 0.4,         // 40% dead code
stringArrayThreshold: 0.9,               // 90% encoded
```

**Impact**: +20-30% runtime overhead, +60% file size

### Balanced (Default)
Current configuration:

```javascript
controlFlowFlatteningThreshold: 0.5,     // 50% flattened
deadCodeInjectionThreshold: 0.2,         // 20% dead code
stringArrayThreshold: 0.75,              // 75% encoded
```

**Impact**: +10% runtime overhead, +40% file size

### Performance Mode (Faster)
For performance-critical deployments:

```javascript
controlFlowFlatteningThreshold: 0.25,    // 25% flattened
deadCodeInjectionThreshold: 0.1,         // 10% dead code
stringArrayThreshold: 0.5,               // 50% encoded
```

**Impact**: +5% runtime overhead, +25% file size

## Customizing Per File

Edit `build.js` to apply different settings to different files:

```javascript
// Define multiple option sets
const HIGH_PROTECTION = {
  ...OBFUSCATION_OPTIONS,
  controlFlowFlatteningThreshold: 0.75
};

const PERFORMANCE_MODE = {
  ...OBFUSCATION_OPTIONS,
  controlFlowFlattening: false,
  deadCodeInjection: false
};

// Apply based on file
async function obfuscateFile(sourcePath, targetPath) {
  const code = await fs.readFile(sourcePath, 'utf8');
  let options = OBFUSCATION_OPTIONS;

  // High protection for core tracking
  if (sourcePath.includes('ImageTracker.js') ||
      sourcePath.includes('FeatureDetector.js')) {
    options = HIGH_PROTECTION;
  }

  // Performance mode for UI
  if (sourcePath.includes('UIManager.js')) {
    options = PERFORMANCE_MODE;
  }

  const obfuscated = JavaScriptObfuscator.obfuscate(code, options);
  await fs.writeFile(targetPath, obfuscated.getObfuscatedCode());
}
```

## Testing Obfuscated Code

### 1. Build Locally
```bash
npm run build
```

### 2. Test Functionality
```bash
cd dist
python -m http.server 8080
```

### 3. Verify Features
- Camera initialization
- Image detection
- Optical flow tracking
- Video overlay
- UI controls

### 4. Check Performance
Open browser DevTools:
- Check FPS (should maintain 30+ FPS)
- Monitor memory usage
- Check for console errors

### 5. Test on Mobile
Use ngrok or deploy to staging:
```bash
npx ngrok http 8080
```

## Debugging Obfuscated Code

### Source Maps
NOT recommended for production, but useful for debugging:

```javascript
// In build.js - DEVELOPMENT ONLY
const OBFUSCATION_OPTIONS = {
  ...existing options,
  sourceMap: true,
  sourceMapMode: 'separate'
};
```

**WARNING**: Never deploy with source maps - they defeat obfuscation!

### Console Logs
Obfuscation preserves console.log:

```javascript
// Original code - add debug logs
console.log('Tracking started:', trackingData);

// These still work after obfuscation
```

### Performance Profiling
Use Chrome DevTools Performance tab:
1. Record session
2. Identify slow functions
3. Reduce obfuscation for those files

## Common Issues

### 1. Code Breaks After Obfuscation

**Cause**: Self-defending code triggered by debugging
**Solution**: Disable during development:
```javascript
selfDefending: false,
debugProtection: false
```

### 2. Slow Performance

**Cause**: Too aggressive control flow flattening
**Solution**: Reduce threshold:
```javascript
controlFlowFlatteningThreshold: 0.3
```

### 3. Large File Sizes

**Cause**: High dead code injection
**Solution**: Reduce injection:
```javascript
deadCodeInjectionThreshold: 0.1
```

### 4. OpenCV Errors

**Cause**: OpenCV.js doesn't like certain obfuscation
**Solution**: Don't obfuscate OpenCV (loaded from CDN)

### 5. Async/Promise Issues

**Cause**: Control flow flattening breaks async patterns
**Solution**: Exclude async functions:
```javascript
// Mark functions to exclude (advanced)
/* javascript-obfuscator:disable */
async function sensitiveFunction() {
  // Not obfuscated
}
/* javascript-obfuscator:enable */
```

## Security Considerations

### What Obfuscation IS
- Makes reverse engineering harder and slower
- Protects against casual inspection
- Increases cost of code theft
- Deters automated analysis tools

### What Obfuscation IS NOT
- Not encryption (code is still executable)
- Not a replacement for server-side security
- Not protection against determined attackers
- Not copyright protection (use legal means)

### Best Practices
1. **Combine with other measures**: Server validation, rate limiting
2. **Keep secrets server-side**: API keys, sensitive data
3. **Use HTTPS**: Always encrypt in transit
4. **Monitor usage**: Detect unauthorized deployments
5. **Legal protection**: Copyright, patents, licenses

## Maintaining Obfuscation

### Regular Updates
Keep obfuscator current:
```bash
npm update javascript-obfuscator
```

### Version Control
- **Commit**: Source code, build scripts
- **Don't commit**: `dist/` directory, obfuscated code
- **Git**: Add `dist/` to `.gitignore`

### CI/CD Integration
Run obfuscation in deployment pipeline:
```yaml
# Example GitHub Actions
- name: Build
  run: npm run build

- name: Deploy
  run: ./deploy.sh production
```

## Measuring Effectiveness

### File Size Comparison
```bash
# Before obfuscation
du -sh modules/*.js

# After obfuscation
du -sh dist/modules/*.js
```

### Performance Comparison
Benchmark tracking FPS:
- Original: 60 FPS
- Obfuscated: 55 FPS
- Overhead: ~8%

### Readability Check
Try to understand obfuscated code:
- Variable names: Meaningless
- Code flow: Non-linear
- Strings: Encoded
- Logic: Obscured

## Further Reading

- [javascript-obfuscator docs](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [Obfuscation techniques](https://en.wikipedia.org/wiki/Obfuscation_(software))
- [JavaScript security best practices](https://owasp.org/www-project-web-security-testing-guide/)
