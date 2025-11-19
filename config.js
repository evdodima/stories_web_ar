const AppConfig = {
  sift: {
    nfeatures: 800, // 0 means no limit
    nOctaveLayers: 3,
    contrastThreshold: 0.04,
    edgeThreshold: 10,
    sigma: 1.6
  },
  targetPreprocessing: {
    useCLAHE: true,
    useBlur: true,
    blurKernelSize: 3,
    blurSigma: 0.5
  },
  framePreprocessing: {
    useCLAHE: true,
    useBlur: true,
    blurKernelSize: 3,
    blurSigma: 0.5
  },
  detection: {
    maxCandidates: 2,
    minSimilarityThreshold: 0,
    ratioThreshold: 0.65,
    distanceThresholdMultiplier: 3,
    minMatchesForHomography: 12,
    detectionInterval: 15  // Reduced from 30 for drift correction
  },
  opticalFlow: {
    winSize: { width: 21, height: 21 },
    maxLevel: 4,
    criteria: {
      maxIterations: 30,
      epsilon: 0.01
    },
    minEigThreshold: 0.001,
    featureQualityLevel: 0.005,
    featureMinDistance: 10,
    maxFlowFeatures: 100,
    ransacReprojThreshold: 3.0,
    maxRansacIterations: 2000,
    ransacConfidence: 0.995
  },
  tracking: {
    fbErrorThreshold: 1.0,
    minInliers: 15,
    maxFlowMagnitude: 150,
    spatialGridSize: 4
  },
  geometry: {
    minAreaThreshold: 100
  },
  targetSwitching: {
    minSwitchDelay: 1000,
    switchHysteresis: 1.3
  },
  frameProcessing: {
    maxDimension: 960
  },
  camera: {
    defaultWidth: 1920,
    defaultHeight: 1080,
    maxReadyAttempts: 50,
    readyCheckInterval: 100
  },
  database: {
    version: '1.0.0',
    getConfigSignature() {
      const criticalParams = {
        sift: AppConfig.sift,
        vocabulary: {
          branchingFactor: AppConfig.vocabulary.branchingFactor,
          levels: AppConfig.vocabulary.levels,
          maxFeaturesPerTarget: AppConfig.vocabulary.maxFeaturesPerTarget,
          weightingScheme: AppConfig.vocabulary.weightingScheme
        }
      };
      const str = JSON.stringify(criticalParams);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    }
  },
  vocabulary: {
    adaptive: true,
    branchingFactor: 10,
    levels: 2,
    maxFeaturesPerTarget: 500,
    weightingScheme: 'bm25',
    minScoreGap: 0.05
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
