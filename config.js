const AppConfig = {
  orb: {
    nfeatures: 2000,
    scaleFactor: 1.12,
    nlevels: 12,
    edgeThreshold: 20,
    firstLevel: 0,
    WTA_K: 2,
    scoreType: 0,
    patchSize: 31,
    fastThreshold: 15
  },
  teblid: {
    scaleFactor: 1.0,
    size: 512
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
    ratioThreshold: 0.75,
    distanceThresholdMultiplier: 3,
    minMatchesForHomography: 4,
    detectionInterval: 30
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
    maxFlowFeatures: 150,
    ransacReprojThreshold: 3.0,
    maxRansacIterations: 2000,
    ransacConfidence: 0.995
  },
  tracking: {
    fbErrorThreshold: 1.5,
    fbErrorThresholdMax: 4.0,
    minInliers: 15,
    minInliersStrict: 25,
    maxFlowMagnitude: 150,
    featureRefreshInterval: 10,
    spatialGridSize: 4
  },
  geometry: {
    maxScaleChange: 0.5,
    maxRotationChange: 0.5,
    maxAspectRatioChange: 0.25,
    minAreaThreshold: 100,
    minCompactnessThreshold: 0.05,
    maxEdgeLengthRatio: 5.0,
    minCornerAngle: 20 * Math.PI / 180,
    maxCornerAngle: 160 * Math.PI / 180,
    maxAspectRatio: 15.0,
    parallelThreshold: 0.5
  },
  quality: {
    qualityDegradationFrames: 3,
    minQualityForContinuation: 0.4,
    weights: {
      inlierRatio: 0.4,
      fbError: 0.3,
      geometric: 0.3
    },
    smoothingAlpha: 0.3
  },
  targetSwitching: {
    minSwitchDelay: 1000,
    switchHysteresis: 1.3
  },
  frameProcessing: {
    maxDimension: 720
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
        orb: AppConfig.orb,
        teblid: AppConfig.teblid,
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
    branchingFactor: 8,
    levels: 2,
    maxFeaturesPerTarget: 500,
    weightingScheme: 'bm25',
    minScoreGap: 0.05
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
