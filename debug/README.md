# Detection Debug Suite

A comprehensive automated testing framework for debugging and improving WebAR image detection performance.

## Overview

This debug suite systematically tests various parameter combinations to identify optimal settings for improved detection distance and quality. It reuses your existing preprocessing and feature detection modules to ensure consistency with production code.

## Quick Start

### 1. Prepare Your Test Images

Place your test images in the app root directory:
- `frame.jpg` - Camera frame where the target should be detected
- `target.jpg` - The target image you're trying to detect

### 2. Run the Debug Suite

Start a local server from the app root:
```bash
python -m http.server 8000
# or
npx serve
```

Open in your browser:
```
http://localhost:8000/debug/debug-detection.html
```

### 3. Run Experiments

1. **Select Categories**: Choose which experiment categories to run
   - Resolution Tests (4 experiments)
   - BRISK Parameters (13 experiments)
   - Matching Thresholds (14 experiments)
   - Multi-Scale Detection (10 experiments)
   - Preprocessing Variations (5 experiments)

2. **Click "Run Experiments"**: The suite will automatically:
   - Load your test images
   - Run all selected experiments
   - Generate visualizations for each test
   - Produce a comprehensive HTML report

3. **Review Results**:
   - View the report in a new window
   - Download the HTML report for offline analysis
   - Export raw results as JSON

## What Gets Tested

### 1. Frame Resolution Tests
Tests different processing resolutions (640px, 960px, 1280px, 1920px) to determine if higher resolution improves detection at distance.

**Key Question**: Does processing at higher resolution help detect distant targets?

### 2. BRISK Parameter Sweep
Tests various BRISK detector configurations:
- **Threshold**: 10, 20, 30, 40, 50 (lower = more features)
- **Octaves**: 3, 4, 6, 8 (more = better scale invariance)
- **Max Features**: 500, 800, 1200, 2000

**Key Question**: What BRISK settings maximize good matches?

### 3. Matching Threshold Tests
Tests matching and filtering parameters:
- **Ratio Test**: 0.65 to 0.85 (Lowe's ratio test threshold)
- **Min Good Matches**: 6 to 20 (detection threshold)
- **RANSAC Threshold**: 2.0 to 6.0 (outlier rejection)

**Key Question**: Can we relax thresholds to detect at greater distance?

### 4. Multi-Scale Detection
Tests detection at different image scales:
- Frame scaling: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x
- Target scaling variations
- Combined scaling

**Key Question**: Would a scale pyramid approach improve detection?

### 5. Preprocessing Variations
Tests different preprocessing combinations:
- With/without Gaussian blur
- With/without CLAHE enhancement
- Different blur kernels (3x3 vs 5x5)
- Different CLAHE clip limits (1.0, 2.0, 3.0)

**Key Question**: Is the current preprocessing optimal?

## Understanding the Report

### Executive Summary
- Total experiments run
- Success rate
- Average and maximum good matches
- Processing times

### Top 5 Configurations
The best-performing parameter combinations, ranked by good match count, with:
- Full visualizations
- Detailed metrics
- Configuration details

### Category Analysis
Performance breakdown by experiment category:
- Success rates
- Average matches
- Best configurations per category

### Recommendations
Actionable suggestions based on results:
- **HIGH impact**: Changes likely to significantly improve detection
- **MEDIUM impact**: Worthwhile optimizations
- **INFO**: Findings without clear improvements

### Implementation Guide
Ready-to-use code snippets for updating your main app with optimal parameters.

### Complete Results Table
Sortable table of all experiments with key metrics. Click any row to jump to detailed results.

### Detailed Results
Expandable cards for each experiment showing:
- Composite visualization (keypoints, matches, detection)
- Full metrics
- Configuration details
- Error messages (if any)

## Visualizations Explained

Each experiment generates a composite visualization with 4 panels:

### 1. Target Keypoints
- Shows detected keypoints on the target image
- Color-coded by response strength (red=weak, green=strong)

### 2. Frame Keypoints
- Shows detected keypoints on the camera frame
- Same color coding as target

### 3. Feature Matches
- Side-by-side view of target and frame
- Green lines = good matches (passed ratio test)
- Red lines = filtered matches (failed ratio test)

### 4. Detection Result
- Shows detection outcome on frame
- Green bounding box + "DETECTED" if successful
- Red "NOT DETECTED" if failed
- Includes metrics overlay

## Files Structure

```
debug/
├── README.md                    # This file
├── debug-detection.html         # Main entry point (open this)
├── ExperimentConfigs.js         # ~50 experiment configurations
├── DebugExperimentRunner.js     # Main orchestrator
├── DebugVisualizer.js           # Visualization utilities
└── DebugReportGenerator.js      # HTML report generation
```

## Module Reuse

The debug suite reuses your existing production modules:

✅ **VocabularyBuilder preprocessing**:
- Grayscale conversion
- Gaussian blur (3x3, sigma=0.5)
- CLAHE (clip=2.0, grid=8x8)

✅ **BRISK feature detection**:
- Same detector configuration
- Same feature extraction pipeline

✅ **Feature matching logic**:
- KNN matching with k=2
- Ratio test filtering
- RANSAC homography computation

This ensures that findings directly translate to your main app.

## Interpreting Results

### Good Match Count
The primary metric for ranking experiments. Higher = better detection.

**Baseline**: Your current settings typically achieve ~10-30 good matches when target is close.

**Target**: Look for configurations that significantly increase this number.

### Success Rate
Percentage of experiments where detection succeeded (found enough matches + valid homography).

**What success means**: The target was geometrically detected with sufficient confidence.

### Processing Time
Time taken per experiment. Consider this when evaluating optimizations.

**Trade-off**: Higher resolution and more features improve quality but slow processing.

## Common Findings

Based on typical detection issues:

### If No Experiments Succeed
- Target may be too distant/small in frame
- Target may be occluded or heavily distorted
- Lighting conditions may be very poor
- Consider testing with closer/clearer images first

### If Resolution Tests Help
- Processing at higher resolution captures more detail
- **Recommendation**: Increase MAX_DIMENSION in ImageTracker.js
- **Trade-off**: Slower processing

### If BRISK Threshold Changes Help
- Lower threshold (10-20) = more features but more noise
- Higher threshold (40-50) = fewer but more robust features
- **Recommendation**: Adjust based on your target's characteristics

### If Ratio Threshold Helps
- Higher ratio (0.80-0.85) = more permissive matching
- **Recommendation**: Relax ratio test for distant detection
- **Caution**: May increase false positives

### If Multi-Scale Helps
- Different scales detect better at different distances
- **Recommendation**: Implement scale pyramid detection
- **Complexity**: Requires code changes to test multiple scales

## Next Steps

After running experiments:

1. **Review the report** - Focus on top 5 configurations
2. **Check recommendations** - Look for HIGH impact changes
3. **Test incrementally** - Implement one change at a time
4. **Validate in production** - Test with real camera feed
5. **Re-run experiments** - After implementing changes

## Troubleshooting

### OpenCV.js fails to load
- Check internet connection (loaded from CDN)
- Try refreshing the page
- Check browser console for errors

### Images fail to load
- Ensure `frame.jpg` and `target.jpg` are in the app root
- Check file names match exactly (case-sensitive)
- Verify images are valid JPEG/PNG files

### Experiments crash or freeze
- Try running fewer categories at once
- Check browser console for errors
- Ensure sufficient memory available
- Try with smaller test images

### Report doesn't generate
- Check browser console for errors
- Ensure experiments completed successfully
- Try downloading JSON instead

## Performance Notes

- **Full suite**: ~50 experiments, 2-5 minutes
- **Quick test**: Select only resolution + matching (~18 experiments, 1 minute)
- **Memory usage**: Peak ~500MB during visualization generation
- **Best results**: Run on desktop with good CPU

## Support

For issues or questions:
1. Check browser console for error messages
2. Review the log in the progress section
3. Try with simpler test images first
4. Refer to main app documentation

---

**Happy debugging!** 🔍

This suite should help you identify the optimal parameters for improving detection distance and quality in your WebAR application.
