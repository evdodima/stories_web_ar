/**
 * Experiment configurations for detection debugging
 * Defines parameter combinations to test systematically
 */

export const ExperimentConfigs = {
  /**
   * Category 1: Frame Resolution Tests
   * Test different processing resolutions with baseline BRISK settings
   */
  resolutionTests: [
    {
      id: 'res_640',
      category: 'resolution',
      description: 'Resolution 640px (current baseline)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'res_960',
      category: 'resolution',
      description: 'Resolution 960px (1.5x increase)',
      maxDimension: 960,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'res_1280',
      category: 'resolution',
      description: 'Resolution 1280px (2x increase)',
      maxDimension: 1280,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'res_1920',
      category: 'resolution',
      description: 'Resolution 1920px (3x increase, full res)',
      maxDimension: 1920,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    }
  ],

  /**
   * Category 2: BRISK Parameter Sweep
   * Test different BRISK detector configurations
   */
  briskTests: [
    // Low threshold tests (more features, less robust)
    {
      id: 'brisk_thresh10_oct6',
      category: 'brisk',
      description: 'BRISK threshold=10, octaves=6 (very sensitive)',
      maxDimension: 640,
      brisk: { threshold: 10, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_thresh10_oct8',
      category: 'brisk',
      description: 'BRISK threshold=10, octaves=8 (more scales)',
      maxDimension: 640,
      brisk: { threshold: 10, octaves: 8, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_thresh20_oct6',
      category: 'brisk',
      description: 'BRISK threshold=20, octaves=6',
      maxDimension: 640,
      brisk: { threshold: 20, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_thresh20_oct8',
      category: 'brisk',
      description: 'BRISK threshold=20, octaves=8',
      maxDimension: 640,
      brisk: { threshold: 20, octaves: 8, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // Baseline (current settings)
    {
      id: 'brisk_thresh30_oct6',
      category: 'brisk',
      description: 'BRISK threshold=30, octaves=6 (current baseline)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_thresh30_oct8',
      category: 'brisk',
      description: 'BRISK threshold=30, octaves=8',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 8, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // Higher threshold tests (fewer features, more robust)
    {
      id: 'brisk_thresh40_oct6',
      category: 'brisk',
      description: 'BRISK threshold=40, octaves=6',
      maxDimension: 640,
      brisk: { threshold: 40, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_thresh50_oct6',
      category: 'brisk',
      description: 'BRISK threshold=50, octaves=6 (very robust)',
      maxDimension: 640,
      brisk: { threshold: 50, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // Max features variations
    {
      id: 'brisk_maxfeat500',
      category: 'brisk',
      description: 'Max features=500 (target-like)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 500,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_maxfeat1200',
      category: 'brisk',
      description: 'Max features=1200 (50% increase)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 1200,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_maxfeat2000',
      category: 'brisk',
      description: 'Max features=2000 (2.5x increase)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 2000,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // Octave variations
    {
      id: 'brisk_oct3',
      category: 'brisk',
      description: 'Octaves=3 (fewer scales)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 3, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'brisk_oct4',
      category: 'brisk',
      description: 'Octaves=4',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 4, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    }
  ],

  /**
   * Category 3: Matching Threshold Tests
   * Test different matching and filtering parameters
   */
  matchingTests: [
    // Ratio test variations
    {
      id: 'ratio_065',
      category: 'matching',
      description: 'Ratio threshold=0.65 (stricter)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.65, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'ratio_070',
      category: 'matching',
      description: 'Ratio threshold=0.70',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.70, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'ratio_075',
      category: 'matching',
      description: 'Ratio threshold=0.75 (current baseline)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'ratio_080',
      category: 'matching',
      description: 'Ratio threshold=0.80 (more permissive)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.80, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'ratio_085',
      category: 'matching',
      description: 'Ratio threshold=0.85 (very permissive)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.85, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // Min good matches variations
    {
      id: 'minmatch_06',
      category: 'matching',
      description: 'Min good matches=6 (relaxed)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 6, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'minmatch_08',
      category: 'matching',
      description: 'Min good matches=8',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 8, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'minmatch_10',
      category: 'matching',
      description: 'Min good matches=10',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 10, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'minmatch_15',
      category: 'matching',
      description: 'Min good matches=15 (stricter)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 15, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'minmatch_20',
      category: 'matching',
      description: 'Min good matches=20 (very strict)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 20, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // RANSAC threshold variations
    {
      id: 'ransac_20',
      category: 'matching',
      description: 'RANSAC threshold=2.0 (strict)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 2.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'ransac_30',
      category: 'matching',
      description: 'RANSAC threshold=3.0',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 3.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'ransac_50',
      category: 'matching',
      description: 'RANSAC threshold=5.0 (relaxed)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 5.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'ransac_60',
      category: 'matching',
      description: 'RANSAC threshold=6.0 (very relaxed)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 6.0 },
      preprocessing: { blur: true, clahe: true }
    }
  ],

  /**
   * Category 4: Multi-Scale Detection Tests
   * Test detection at different image scales
   */
  multiScaleTests: [
    {
      id: 'scale_050',
      category: 'multiscale',
      description: 'Frame scale=0.5x',
      maxDimension: null, // Don't apply max dimension limit
      frameScale: 0.5,
      targetScale: 1.0,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'scale_075',
      category: 'multiscale',
      description: 'Frame scale=0.75x',
      maxDimension: null,
      frameScale: 0.75,
      targetScale: 1.0,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'scale_100',
      category: 'multiscale',
      description: 'Frame scale=1.0x (baseline)',
      maxDimension: null,
      frameScale: 1.0,
      targetScale: 1.0,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'scale_125',
      category: 'multiscale',
      description: 'Frame scale=1.25x',
      maxDimension: null,
      frameScale: 1.25,
      targetScale: 1.0,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'scale_150',
      category: 'multiscale',
      description: 'Frame scale=1.5x',
      maxDimension: null,
      frameScale: 1.5,
      targetScale: 1.0,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'scale_200',
      category: 'multiscale',
      description: 'Frame scale=2.0x',
      maxDimension: null,
      frameScale: 2.0,
      targetScale: 1.0,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // Target scaling tests
    {
      id: 'scale_target050',
      category: 'multiscale',
      description: 'Target scale=0.5x, frame=1.0x',
      maxDimension: null,
      frameScale: 1.0,
      targetScale: 0.5,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'scale_target150',
      category: 'multiscale',
      description: 'Target scale=1.5x, frame=1.0x',
      maxDimension: null,
      frameScale: 1.0,
      targetScale: 1.5,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    // Both scaled
    {
      id: 'scale_both075',
      category: 'multiscale',
      description: 'Both scaled to 0.75x',
      maxDimension: null,
      frameScale: 0.75,
      targetScale: 0.75,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    },
    {
      id: 'scale_both150',
      category: 'multiscale',
      description: 'Both scaled to 1.5x',
      maxDimension: null,
      frameScale: 1.5,
      targetScale: 1.5,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    }
  ],

  /**
   * Category 5: Preprocessing Variations
   * Test different preprocessing combinations
   */
  preprocessingTests: [
    {
      id: 'preproc_noblur',
      category: 'preprocessing',
      description: 'No blur, with CLAHE',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: false, clahe: true, blurKernel: null }
    },
    {
      id: 'preproc_noclahe',
      category: 'preprocessing',
      description: 'With blur, no CLAHE',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: false }
    },
    {
      id: 'preproc_blur5x5',
      category: 'preprocessing',
      description: 'Gaussian blur 5x5 (vs 3x3)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true, blurKernel: 5 }
    },
    {
      id: 'preproc_clahe10',
      category: 'preprocessing',
      description: 'CLAHE clip limit=1.0 (less contrast)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true, claheClipLimit: 1.0 }
    },
    {
      id: 'preproc_clahe30',
      category: 'preprocessing',
      description: 'CLAHE clip limit=3.0 (more contrast)',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true, claheClipLimit: 3.0 }
    }
  ],

  /**
   * Get all experiment configurations
   */
  getAllConfigs() {
    return [
      ...this.resolutionTests,
      ...this.briskTests,
      ...this.matchingTests,
      ...this.multiScaleTests,
      ...this.preprocessingTests
    ];
  },

  /**
   * Get configs by category
   */
  getByCategory(category) {
    return this.getAllConfigs().filter(config => config.category === category);
  },

  /**
   * Get baseline config for comparison
   */
  getBaseline() {
    return {
      id: 'baseline',
      category: 'baseline',
      description: 'Current production settings',
      maxDimension: 640,
      brisk: { threshold: 30, octaves: 6, patternScale: 1.0 },
      maxFeatures: 800,
      matching: { ratioThreshold: 0.75, minGoodMatches: 12, ransacThreshold: 4.0 },
      preprocessing: { blur: true, clahe: true }
    };
  }
};
