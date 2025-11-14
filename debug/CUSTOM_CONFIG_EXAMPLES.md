# Custom Configuration Examples

The new architecture makes it incredibly easy to customize your tests. Just edit the arrays in `CustomExperimentConfigs.js`.

## Quick Customization

Edit the `testMatrix` object at the top of `CustomExperimentConfigs.js`:

```javascript
static testMatrix = {
  // Just change these arrays!
  resolutions: [640, 960, 1280, 1920],
  scales: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],

  // And these fixed parameters
  fixed: {
    brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
    maxFeatures: 800,
    matching: {
      ratioThreshold: 0.75,
      minGoodMatches: 12,
      ransacThreshold: 4.0
    },
    preprocessing: {
      blur: false,
      clahe: true
    }
  }
};
```

All test cases are automatically generated from these arrays!

## Example Customizations

### 1. Test Fewer Scales (Faster)

```javascript
scales: [0.1, 0.3, 0.5, 0.7, 0.9, 1.0], // Only 6 scales instead of 10
```

Result: 22 experiments instead of 34

### 2. Test Only High Resolutions

```javascript
resolutions: [1280, 1920], // Only test high-res
```

Result: Focuses on high-resolution detection

### 3. Test More Fine-Grained Scales

```javascript
scales: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
```

Result: More detailed scale analysis (useful if you find a promising range)

### 4. Enable Blur

```javascript
fixed: {
  preprocessing: {
    blur: true,   // Test WITH blur
    clahe: true
  }
}
```

### 5. Different BRISK Settings

```javascript
fixed: {
  brisk: {
    threshold: 20,  // More sensitive
    octaves: 8,     // More scale levels
    patternScale: 1.0
  }
}
```

### 6. More Relaxed Matching

```javascript
fixed: {
  matching: {
    ratioThreshold: 0.80,  // More permissive
    minGoodMatches: 8,     // Lower requirement
    ransacThreshold: 5.0   // More lenient
  }
}
```

## Advanced: Parameter Sweeps

Want to test BRISK threshold values? Use the built-in sweep generator:

```javascript
// In console or your test code:
const thresholdSweep = CustomExperimentConfigs.generateParameterSweep(
  'brisk.threshold',
  [10, 15, 20, 25, 30, 35, 40, 45, 50]
);

// Run these tests
runner.runAllExperiments(thresholdSweep);
```

This generates 9 experiments testing different BRISK thresholds while keeping everything else constant.

## Advanced: Custom Test Matrix

For one-off experiments with completely different parameters:

```javascript
const customTests = CustomExperimentConfigs.generateCustomTests({
  resolutions: [800, 1024],  // Non-standard resolutions
  scales: [0.25, 0.5, 0.75], // Specific scales
  fixed: {
    brisk: { threshold: 25, octaves: 7, patternScale: 1.0 },
    matching: { ratioThreshold: 0.80, minGoodMatches: 10, ransacThreshold: 5.0 }
  }
});
```

## Pre-defined Test Sets

The config provides several pre-defined sets:

### Minimal Tests (4 experiments - fastest)
```javascript
CustomExperimentConfigs.getMinimalTests()
```
- 640px baseline
- 640px @ 0.1x, 0.5x, 1.0x

Use this for quick iteration when developing.

### Quick Tests (8 experiments)
```javascript
CustomExperimentConfigs.getQuickTests()
```
- Two resolutions (640, 1280)
- Key scale points (0.1x, 0.5x, 1.0x) at 640/960px

Use this for regular testing.

### Resolution Only (4 experiments)
```javascript
CustomExperimentConfigs.getResolutionTests()
```
- All resolutions at 1.0x scale

Use this to test resolution impact only.

### Scale Tests for Specific Resolution
```javascript
CustomExperimentConfigs.getScaleTestsForResolution(640)
```
- All 10 scales at 640px

Use this to deep-dive into one resolution.

### All Tests (34 experiments)
```javascript
CustomExperimentConfigs.getAllConfigs()
```
- Comprehensive test suite

Use this for final analysis.

## Statistics

Get info about your test configuration:

```javascript
CustomExperimentConfigs.printSummary();
// Prints:
// === Custom Test Configuration ===
// Resolutions: 640, 960, 1280, 1920
// Scales: 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0
// ...
// Total: 34 experiments
```

Or programmatically:

```javascript
const stats = CustomExperimentConfigs.getStats();
console.log(`Total configs: ${stats.totalConfigs}`);
```

## Architecture Benefits

✅ **No Code Duplication**: All 34 test configs generated from ~30 lines of arrays
✅ **Easy to Modify**: Change one array, regenerate all tests
✅ **Flexible**: Built-in generators for sweeps and custom matrices
✅ **Maintainable**: Clear separation between parameters and generation logic
✅ **Extensible**: Easy to add new parameter types or generation patterns

## Before vs After

### Before (Old Code)
```javascript
scaleTests_640: [
  {
    id: 'custom_640_scale010',
    category: 'custom_scale',
    description: '640px, Frame scale 0.1x, NO blur',
    maxDimension: 640,
    frameScale: 0.1,
    targetScale: 1.0,
    brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
    maxFeatures: 800,
    matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
    preprocessing: { blur: false, clahe: true }
  },
  {
    id: 'custom_640_scale020',
    // ... 8 more copies with minor changes
  },
  // ... repeat for 960px and 1280px
]
```
**~500 lines of repetitive code**

### After (New Code)
```javascript
static testMatrix = {
  resolutions: [640, 960, 1280, 1920],
  scales: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  fixed: { /* parameters */ }
};
```
**~30 lines, generates everything automatically**

To add a new scale? Just add to the array:
```javascript
scales: [0.1, 0.2, 0.3, 0.35, 0.4, 0.5, ...]
//                      ^^^^^ added!
```

Done! All test configs regenerate automatically.
