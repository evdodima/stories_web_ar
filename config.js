/**
 * WebAR Image Tracking Configuration
 *
 * Central configuration file for feature detection and tracking parameters.
 * Uses ORB detector for keypoint detection and TEBLID descriptor for feature description.
 * Modify these values to tune detection and tracking performance.
 *
 * PERFORMANCE TUNING:
 * For faster performance, try:
 * - Decrease orb.nfeatures (1000-2000) = fewer features to process
 * - Increase orb.fastThreshold (15-25) = fewer features detected
 * - Decrease orb.nlevels (4-6) = less multi-scale processing
 * - Disable framePreprocessing.useBlur = skip blur step in live frames
 *
 * For better quality, try:
 * - Increase orb.nfeatures (5000-10000) = more features to match
 * - Decrease orb.fastThreshold (5-10) = more features detected
 * - Increase orb.nlevels (10-12) = better scale invariance
 * - Decrease orb.scaleFactor (1.1-1.15) = finer scale steps
 */

const AppConfig = {
  // ======================================================================
  // ORB DETECTOR PARAMETERS (Keypoint Detection Only)
  // ======================================================================
  orb: {
    // Maximum number of features to retain
    // More features = better detection but slower
    // Recommended: 2000-5000 for performance, 5000-10000 for quality
    nfeatures: 3000,

    // Pyramid decimation ratio (must be greater than 1)
    // Lower values = finer scale steps but slower
    // Recommended: 1.2 (standard), 1.1-1.15 (quality), 1.3-1.5 (performance)
    scaleFactor: 1.2,

    // Number of pyramid levels for multi-scale detection
    // More levels = better scale invariance but slower
    // Recommended: 8 (standard), 10-12 (quality), 4-6 (performance)
    nlevels: 8,

    // Size of border where features are not detected (in pixels)
    // Lower values improve repeatability but may detect unstable edge features
    // Recommended: 20-31
    edgeThreshold: 20,

    // Level of pyramid to put source image (usually 0)
    firstLevel: 0,

    // Number of points producing each element of oriented BRIEF descriptor
    // 2 = more stable, 3 or 4 = faster but less stable
    WTA_K: 2,

    // Score type for ranking features
    // 0 = HARRIS_SCORE (more robust), 1 = FAST_SCORE (faster)
    scoreType: 0,

    // Size of patch used by oriented BRIEF descriptor
    // Recommended: 31 (standard)
    patchSize: 31,

    // FAST threshold for corner detection
    // Lower values = more features detected (noisier), higher = fewer features (more robust)
    // Recommended: 10-15 (quality), 20-30 (performance)
    fastThreshold: 10
  },

  // ======================================================================
  // TEBLID DESCRIPTOR PARAMETERS (Feature Description)
  // ======================================================================
  teblid: {
    // Scale factor for TEBLID descriptor
    // Adjusts the sampling window around detected keypoints
    // 1.00 is the recommended scale for ORB keypoints
    // 5.00 for BRISK, 6.25 for KAZE, 6.75 for SIFT
    // Reference: https://docs.opencv.org/4.x/javadoc/org/opencv/xfeatures2d/TEBLID.html
    scaleFactor: 1.0,

    // Descriptor size in bits (256 or 512)
    // 256: Faster matching, less memory
    // 512: Better matching quality, more distinctive features
    size: 512
  },

  // ======================================================================
  // IMAGE PREPROCESSING - TARGET IMAGES (DATABASE CREATION)
  // ======================================================================
  targetPreprocessing: {
    // Enable CLAHE (Contrast Limited Adaptive Histogram Equalization)
    // for better feature quality in target images during database creation
    useCLAHE: true,

    // Enable Gaussian blur before CLAHE for target images
    // Reduces noise but may slightly decrease sharpness
    // Only applies when useCLAHE is true
    useBlur: true,

    // Gaussian blur kernel size (must be odd, e.g., 3, 5, 7)
    blurKernelSize: 3,

    // Gaussian blur sigma (standard deviation)
    // 0 means auto-calculate from kernel size
    blurSigma: 0.5
  },

  // ======================================================================
  // IMAGE PREPROCESSING - LIVE FRAMES (CAMERA PROCESSING)
  // ======================================================================
  framePreprocessing: {
    // Enable CLAHE (Contrast Limited Adaptive Histogram Equalization)
    // for better feature quality in live camera frames
    // May slightly increase processing time
    useCLAHE: true,

    // Enable Gaussian blur before CLAHE for live frames
    // Reduces noise but may slightly decrease sharpness
    // Only applies when useCLAHE is true
    useBlur: false,

    // Gaussian blur kernel size (must be odd, e.g., 3, 5, 7)
    blurKernelSize: 3,

    // Gaussian blur sigma (standard deviation)
    // 0 means auto-calculate from kernel size
    blurSigma: 0.5
  },

  // ======================================================================
  // FEATURE DETECTION & MATCHING
  // ======================================================================
  detection: {
    // Maximum number of target candidates to verify per frame
    maxCandidates: 2,

    // Minimum similarity threshold for vocabulary-based filtering
    minSimilarityThreshold: 0.4,

    // Lowe's ratio test threshold (lower = stricter matching)
    ratioThreshold: 0.75,

    // Multiplier for distance threshold calculation
    distanceThresholdMultiplier: 3,

    // Minimum number of matches required for homography estimation
    minMatchesForHomography: 10,

    // Run full detection every N frames (lower = more CPU, better detection)
    detectionInterval: 30
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
    minSwitchDelay: 1000,

    // Hysteresis threshold for switching (1.3 = new target must be 30% closer)
    switchHysteresis: 1.3
  },

  // ======================================================================
  // FRAME PROCESSING
  // ======================================================================
  frameProcessing: {
    // Maximum dimension for processed frames (width or height)
    maxDimension: 960
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
    // Vocabulary size = branchingFactor^levels
    // Current: 100^2 = 10,000 words (good balance for 3000 features)
    // Previous: 10^2 = 100 words (too small, caused inverted scoring)
    branchingFactor: 20,

    // Number of levels in vocabulary tree
    // Higher = more specific vocabulary but slower clustering
    levels: 2,

    // Maximum features per target image for vocabulary building
    // Reduced from 5000 to 2000 for faster processing
    // Note: Actual clustering uses max 10000 sampled descriptors total
    maxFeaturesPerTarget: 500
  }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
