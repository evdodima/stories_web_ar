# Hyperparameter Search - Simple Guide

The new architecture is **truly simple** - just define arrays, get all combinations automatically!

## Basic Usage

### 1. Define Your Search Space

In `CustomExperimentConfigs.js`:

```javascript
static searchSpace = {
  // Variable parameters - ALL combinations tested automatically
  variables: {
    maxDimension: [640, 960, 1280, 1920],
    targetScale: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
  },

  // Fixed parameters - same for all tests
  fixed: {
    frameScale: 1.0,
    brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
    maxFeatures: 800,
    matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
    preprocessing: { blur: false, clahe: true }
  }
};
```

**That's it!** This automatically generates:
- 4 resolutions × 10 scales = **40 test combinations**

No manual config objects. No loops. Just arrays.

### 2. Get All Configs

```javascript
const allConfigs = CustomExperimentConfigs.getAllConfigs();
// Returns 40 configs, one for each combination
```

## How It Works

The system automatically generates **Cartesian product** of all variable parameters:

```
maxDimension: [640, 960]
targetScale: [0.1, 0.5, 1.0]

Automatically generates:
1. maxDimension=640, targetScale=0.1
2. maxDimension=640, targetScale=0.5
3. maxDimension=640, targetScale=1.0
4. maxDimension=960, targetScale=0.1
5. maxDimension=960, targetScale=0.5
6. maxDimension=960, targetScale=1.0
```

**6 combinations from 2 arrays!**

## Easy Customization

### Want fewer target scales?

```javascript
variables: {
  targetScale: [0.1, 0.3, 0.5, 0.7, 1.0]  // Only 5 scales
}
```

Result: 4 × 5 = 20 combinations (instead of 40)

### Want to test BRISK threshold too?

```javascript
variables: {
  maxDimension: [640, 1280],
  targetScale: [0.1, 0.5, 1.0],
  briskThreshold: [20, 30, 40]  // Add new variable!
}
```

Result: 2 × 3 × 3 = **18 combinations** automatically!

(Note: You'll need to handle nested parameters in generation code, or flatten them)

### Want to test with/without blur?

```javascript
variables: {
  maxDimension: [640],
  targetScale: [0.5, 1.0],
  blur: [false, true]  // Test both
}
```

Result: 1 × 2 × 2 = 4 combinations

## Built-in Filters

Don't want to run ALL combinations? Use filters:

### Get specific resolution
```javascript
CustomExperimentConfigs.getResolution(640)
// Only configs with maxDimension=640
```

### Get small targets only
```javascript
CustomExperimentConfigs.getSmallTargets()
// Only configs with targetScale ≤ 0.3
```

### Get baselines
```javascript
CustomExperimentConfigs.getBaselines()
// Only full-size targets (targetScale=1.0, frameScale=1.0)
```

### Get random sample
```javascript
CustomExperimentConfigs.getRandomSample(10)
// 10 random configs for quick testing
```

### Get first N (for debugging)
```javascript
CustomExperimentConfigs.getFirst(5)
// Just first 5 configs
```

### Get stratified sample
```javascript
CustomExperimentConfigs.getStratifiedSample()
// Smart sampling across parameters
// e.g., 4 resolutions × 5 key scales = 20 configs
```

### Custom filter
```javascript
CustomExperimentConfigs.filterConfigs(config =>
  config.maxDimension >= 960 && config.targetScale <= 0.5
)
// All high-res with small targets
```

## Advanced: Dynamic Search Space

Want to try different parameters on the fly?

```javascript
// Create a custom search space
const CustomSearch = CustomExperimentConfigs.createCustomSearchSpace({
  variables: {
    maxDimension: [800, 1024],  // Different resolutions
    targetScale: [0.2, 0.4, 0.6]  // Different scales
  }
});

const configs = CustomSearch.getAllConfigs();
// 2 × 3 = 6 new combinations
```

Or add a new variable parameter:

```javascript
const SearchWithBlur = CustomExperimentConfigs.addVariable('blur', [false, true]);
const configs = SearchWithBlur.getAllConfigs();
// Now tests with and without blur
```

## Statistics

Want to know your search space size?

```javascript
const stats = CustomExperimentConfigs.getStats();
console.log(stats);

// Output:
// {
//   totalCombinations: 40,
//   variableParameters: [
//     { name: 'maxDimension', values: 4, range: '640 to 1920' },
//     { name: 'targetScale', values: 10, range: '0.1 to 1' }
//   ],
//   fixedParameters: ['frameScale', 'brisk', 'maxFeatures', ...]
// }
```

Or print summary:

```javascript
CustomExperimentConfigs.printSummary();

// Output:
// === Hyperparameter Search Configuration ===
// Total combinations: 40
//
// Variable Parameters:
//   maxDimension: 4 values (640 to 1920)
//   targetScale: 10 values (0.1 to 1)
//
// Fixed Parameters:
//   frameScale, brisk, maxFeatures, matching, preprocessing
```

## Comparison: Before vs After

### Old Way (Manual)
```javascript
// Had to manually create EVERY config object
resolutionTests: [
  { id: '...', maxDimension: 640, targetScale: 1.0, ... },
  { id: '...', maxDimension: 960, targetScale: 1.0, ... },
  // ... 38 more objects
],
scaleTests: [
  { id: '...', maxDimension: 640, targetScale: 0.1, ... },
  { id: '...', maxDimension: 640, targetScale: 0.2, ... },
  // ... manually repeat for each combination
]
```

**Problem:** 500+ lines of duplicated code, hard to change

### New Way (Automatic)
```javascript
variables: {
  maxDimension: [640, 960, 1280, 1920],
  targetScale: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
}
```

**Done!** All 40 combinations generated automatically.

**To add a new scale?** Just add to array:
```javascript
targetScale: [0.1, 0.2, 0.25, 0.3, ...]
//                     ^^^^^ added!
```

**To remove a resolution?** Just remove from array:
```javascript
maxDimension: [640, 960, 1280]  // Removed 1920
```

## Real-World Examples

### Quick Test: 5 Configs
```javascript
const configs = CustomExperimentConfigs.getFirst(5);
runner.runAllExperiments(configs);
```

### Focus on Small Targets
```javascript
const configs = CustomExperimentConfigs.getSmallTargets();
// Tests all combinations where targetScale ≤ 0.3
runner.runAllExperiments(configs);
```

### Test One Resolution Thoroughly
```javascript
const configs = CustomExperimentConfigs.getResolution(640);
// All 10 target scales at 640px
runner.runAllExperiments(configs);
```

### Smart Sampling
```javascript
const configs = CustomExperimentConfigs.getStratifiedSample();
// 20 strategically chosen configs covering the space
runner.runAllExperiments(configs);
```

## Benefits

✅ **Zero code duplication** - Define arrays once, get all combinations
✅ **Easy to modify** - Change one array, everything updates
✅ **Flexible filtering** - Built-in methods + custom filters
✅ **True hyperparameter search** - Automatically tests all combinations
✅ **Statistics** - Know your search space size instantly
✅ **Extensible** - Easy to add new variable parameters

## No More Complex Methods!

No more:
- `generateResolutionTests()`
- `generateScaleTestsForResolution(640)`
- `generateAllScaleTests()`
- Manual loops and config object creation

Just:
- Define arrays
- Call `getAllConfigs()`
- Use built-in filters if needed

**That's the entire API!** 🎉
