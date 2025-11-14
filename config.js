/**
 * WebAR Image Tracking Configuration
 *
 * Central configuration file for ORB detector parameters and other constants.
 * Modify these values to tune detection and tracking performance.
 */

const AppConfig = {
  // ======================================================================
  // ORB DETECTOR PARAMETERS
  // ======================================================================
  orb: {
    // Maximum number of features to detect per image
    maxFeatures: 1500,

    // Pyramid decimation ratio (>1). Higher = faster but less accurate
    scaleFactor: 1.2,

    // Number of pyramid levels for multi-scale detection
    nLevels: 12,

    // Size of the border where features are not detected
    // Lower values = more features near edges (more permissive)
    // Higher values = fewer features near edges (more strict)
    // Try 5-10 if getting very few features, or 20-30 if too many
    edgeThreshold: 15,

    // First pyramid level (typically 0)
    firstLevel: 0,

    // Number of points producing oriented BRIEF descriptor
    WTA_K: 2,

    // Size of the patch used by oriented BRIEF descriptor
    patchSize: 31
  },

  // ======================================================================
  // IMAGE PREPROCESSING
  // ======================================================================
  preprocessing: {
    // Enable histogram equalization to improve contrast and feature detection
    // Helpful in low-light or low-contrast conditions
    // May slightly increase processing time
    useHistogramEqualization: true
  },

  // ======================================================================
  // FEATURE DETECTION & MATCHING
  // ======================================================================
  detection: {
    // Maximum number of target candidates to verify per frame
    maxCandidates: 2,

    maxFeatures: 1500,

    // Minimum similarity threshold for vocabulary-based filtering
    minSimilarityThreshold: 0.05,

    // Lowe's ratio test threshold (lower = stricter matching)
    ratioThreshold: 0.75,

    // Multiplier for distance threshold calculation
    distanceThresholdMultiplier: 3,

    // Minimum number of matches required for homography estimation
    minMatchesForHomography: 12,

    // Run full detection every N frames (lower = more CPU, better detection)
    detectionInterval: 15
  },

  // ======================================================================
  // OPTICAL FLOW TRACKING PARAMETERS
  // ======================================================================
  opticalFlow: {
    // Lucas-Kanade window size (must be odd)
    winSize: { width: 21, height: 21 },

    // Maximum pyramid levels for optical flow
    maxLevel: 4,

    // Termination criteria
    criteria: {
      maxIterations: 30,
      epsilon: 0.01
    },

    // Minimum eigenvalue threshold for corner detection
    minEigThreshold: 0.001,

    // Quality level for feature detection (0-1)
    featureQualityLevel: 0.005,

    // Minimum distance between detected features
    featureMinDistance: 10,

    // Maximum number of features to track
    maxFlowFeatures: 100,

    // RANSAC reprojection threshold in pixels
    ransacReprojThreshold: 3.0,

    // Maximum RANSAC iterations
    maxRansacIterations: 2000,

    // RANSAC confidence level (0-1)
    ransacConfidence: 0.995
  },

  // ======================================================================
  // ADAPTIVE TRACKING THRESHOLDS
  // ======================================================================
  tracking: {
    // Forward-backward error threshold (baseline)
    fbErrorThreshold: 1.5,

    // Maximum forward-backward error when tracking is good
    fbErrorThresholdMax: 4.0,

    // Minimum inlier count for acceptable tracking
    minInliers: 15,

    // Minimum inliers for high-quality tracking
    minInliersStrict: 25,

    // Maximum flow magnitude in pixels
    maxFlowMagnitude: 150,

    // Re-detect features every N frames
    featureRefreshInterval: 10,

    // Spatial grid size for feature distribution (NxN grid)
    spatialGridSize: 4
  },

  // ======================================================================
  // GEOMETRIC CONSTRAINTS
  // ======================================================================
  geometry: {
    // Maximum scale change per frame (0.5 = 50%)
    maxScaleChange: 0.5,

    // Maximum rotation change per frame in radians (~29 degrees)
    maxRotationChange: 0.5,

    // Maximum aspect ratio change per frame (0.25 = 25%)
    maxAspectRatioChange: 0.25,

    // Minimum area threshold for valid target
    minAreaThreshold: 100,

    // Minimum compactness threshold (area/perimeter ratio)
    minCompactnessThreshold: 0.05,

    // Maximum length ratio for opposite edges
    maxEdgeLengthRatio: 5.0,

    // Minimum corner angle in radians (20 degrees)
    minCornerAngle: 20 * Math.PI / 180,

    // Maximum corner angle in radians (160 degrees)
    maxCornerAngle: 160 * Math.PI / 180,

    // Maximum aspect ratio threshold
    maxAspectRatio: 15.0,

    // Threshold for parallel edge detection
    parallelThreshold: 0.5
  },

  // ======================================================================
  // QUALITY & RE-DETECTION
  // ======================================================================
  quality: {
    // Number of frames with degraded quality before re-detection
    qualityDegradationFrames: 3,

    // Minimum quality score to continue tracking (0-1)
    minQualityForContinuation: 0.4,

    // Quality scoring weights (must sum to 1.0)
    weights: {
      inlierRatio: 0.4,
      fbError: 0.3,
      geometric: 0.3
    },

    // Exponential moving average smoothing factor (0-1)
    // Higher = more responsive, Lower = smoother
    smoothingAlpha: 0.3
  },

  // ======================================================================
  // TARGET SWITCHING
  // ======================================================================
  targetSwitching: {
    // Minimum delay before switching targets (milliseconds)
    minSwitchDelay: 2000,

    // Hysteresis threshold for switching (1.3 = new target must be 30% closer)
    switchHysteresis: 1.3
  },

  // ======================================================================
  // FRAME PROCESSING
  // ======================================================================
  frameProcessing: {
    // Maximum dimension for processed frames (width or height)
    maxDimension: 1280
  },

  // ======================================================================
  // CAMERA SETTINGS
  // ======================================================================
  camera: {
    // Default camera resolution
    defaultWidth: 1920,
    defaultHeight: 1080,

    // Maximum attempts to wait for video ready
    maxReadyAttempts: 50,

    // Check interval for video ready (milliseconds)
    readyCheckInterval: 100
  },

  // ======================================================================
  // VOCABULARY TREE CONFIGURATION
  // ======================================================================
  vocabulary: {
    // Branching factor for vocabulary tree
    branchingFactor: 10,

    // Number of levels in vocabulary tree
    levels: 2,

    // Maximum features per target image for vocabulary building
    maxFeaturesPerTarget: 1500,

    // Maximum features per target for database storage
    // (Lower than maxFeaturesPerTarget to reduce database size)
    maxFeaturesPerTargetStorage: 1500
  }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
