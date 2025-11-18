/**
 * Debug Experiment Runner
 * Orchestrates detection experiments with different parameter configurations
 * Reuses existing modules: VocabularyBuilder for preprocessing,
 * FeatureDetector for matching
 */

import { DebugVisualizer } from './DebugVisualizer.js';

export class DebugExperimentRunner {
  constructor() {
    this.results = [];
    this.targetImage = null;
    this.frameImage = null;
    this.progressCallback = null;
  }

  /**
   * Set progress callback
   * @param {Function} callback - Called with (current, total, message)
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Report progress
   */
  _reportProgress(current, total, message) {
    if (this.progressCallback) {
      this.progressCallback(current, total, message);
    }
  }

  /**
   * Load images from URLs
   * @param {string} targetUrl - Path to target image
   * @param {string} frameUrl - Path to frame image
   */
  async loadImages(targetUrl, frameUrl) {
    this._reportProgress(0, 2, 'Loading images...');

    this.targetImage = await this._loadImageFromUrl(targetUrl);
    this._reportProgress(1, 2, 'Target image loaded');

    this.frameImage = await this._loadImageFromUrl(frameUrl);
    this._reportProgress(2, 2, 'Frame image loaded');

    console.log('Images loaded successfully');
    console.log(`Target: ${this.targetImage.cols}x${this.targetImage.rows}`);
    console.log(`Frame: ${this.frameImage.cols}x${this.frameImage.rows}`);
  }

  /**
   * Load image from URL into cv.Mat
   * @param {string} url - Image URL
   * @returns {Promise<cv.Mat>}
   */
  _loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const mat = cv.imread(canvas);
          resolve(mat);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  /**
   * Apply preprocessing to image
   * Replicates VocabularyBuilder._loadImageToMat preprocessing
   * @param {cv.Mat} imageMat - Input image (RGBA)
   * @param {Object} config - Preprocessing config
   * @returns {cv.Mat} Preprocessed grayscale image
   */
  _preprocessImage(imageMat, config) {
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const enhanced = new cv.Mat();

    try {
      // Convert to grayscale
      cv.cvtColor(imageMat, gray, cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur if enabled
      if (config.blur) {
        const kernelSize = config.blurKernel || 3;
        const sigma = 0.5;
        cv.GaussianBlur(gray, blurred, new cv.Size(kernelSize, kernelSize),
                        sigma);
      } else {
        gray.copyTo(blurred);
      }

      // Apply CLAHE if enabled
      if (config.clahe) {
        const clipLimit = config.claheClipLimit || 2.0;
        const tileGridSize = new cv.Size(8, 8);
        const clahe = new cv.CLAHE(clipLimit, tileGridSize);
        clahe.apply(blurred, enhanced);
        clahe.delete();
      } else {
        blurred.copyTo(enhanced);
      }

      gray.delete();
      blurred.delete();

      return enhanced;
    } catch (error) {
      gray.delete();
      blurred.delete();
      enhanced.delete();
      throw error;
    }
  }

  /**
   * Scale image to max dimension while preserving aspect ratio
   * @param {cv.Mat} imageMat - Input image
   * @param {number} maxDimension - Maximum dimension
   * @returns {cv.Mat} Scaled image
   */
  _scaleImage(imageMat, maxDimension) {
    if (!maxDimension) {
      return imageMat.clone();
    }

    const maxDim = Math.max(imageMat.cols, imageMat.rows);
    if (maxDim <= maxDimension) {
      return imageMat.clone();
    }

    const scale = maxDimension / maxDim;
    const newWidth = Math.round(imageMat.cols * scale);
    const newHeight = Math.round(imageMat.rows * scale);

    const scaled = new cv.Mat();
    cv.resize(imageMat, scaled, new cv.Size(newWidth, newHeight),
              0, 0, cv.INTER_LINEAR);
    return scaled;
  }

  /**
   * Apply custom scale factor
   * @param {cv.Mat} imageMat - Input image
   * @param {number} scale - Scale factor
   * @returns {cv.Mat} Scaled image
   */
  _applyScale(imageMat, scale) {
    if (!scale || scale === 1.0) {
      return imageMat.clone();
    }

    const newWidth = Math.round(imageMat.cols * scale);
    const newHeight = Math.round(imageMat.rows * scale);

    const scaled = new cv.Mat();
    cv.resize(imageMat, scaled, new cv.Size(newWidth, newHeight),
              0, 0, cv.INTER_LINEAR);
    return scaled;
  }

  /**
   * Extract features from image
   * @param {cv.Mat} imageMat - Preprocessed grayscale image
   * @param {Object} briskParams - BRISK parameters
   * @param {number} maxFeatures - Maximum number of features
   * @returns {Object} { keypoints, descriptors }
   */
  _extractFeatures(imageMat, briskParams, maxFeatures) {
    const detector = new cv.BRISK(
      briskParams.threshold,
      briskParams.octaves,
      briskParams.patternScale
    );

    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();

    detector.detectAndCompute(imageMat, new cv.Mat(), keypoints, descriptors);
    detector.delete();

    // Limit features if needed
    if (keypoints.size() > maxFeatures) {
      // Sort by response (strength)
      const kpArray = [];
      for (let i = 0; i < keypoints.size(); i++) {
        kpArray.push({
          kp: keypoints.get(i),
          desc: descriptors.row(i).clone()
        });
      }
      kpArray.sort((a, b) => b.kp.response - a.kp.response);

      // Take top N
      const limitedKps = new cv.KeyPointVector();
      const limitedDescs = [];
      for (let i = 0; i < Math.min(maxFeatures, kpArray.length); i++) {
        limitedKps.push_back(kpArray[i].kp);
        limitedDescs.push(kpArray[i].desc);
      }

      // Create new descriptor matrix
      const newDescriptors = new cv.Mat(limitedDescs.length,
                                        descriptors.cols, descriptors.type());
      for (let i = 0; i < limitedDescs.length; i++) {
        limitedDescs[i].copyTo(newDescriptors.row(i));
        limitedDescs[i].delete();
      }

      keypoints.delete();
      descriptors.delete();

      return { keypoints: limitedKps, descriptors: newDescriptors };
    }

    return { keypoints, descriptors };
  }

  /**
   * Match features between target and frame
   * @param {cv.Mat} targetDesc - Target descriptors
   * @param {cv.Mat} frameDesc - Frame descriptors
   * @param {Object} matchingParams - Matching parameters
   * @returns {Object} { matches, goodMatches }
   */
  _matchFeatures(targetDesc, frameDesc, matchingParams) {
    // Create matcher (Hamming distance for binary descriptors)
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING2, false);

    // KNN match with k=2
    const matches = new cv.DMatchVectorVector();
    matcher.knnMatch(targetDesc, frameDesc, matches, 2);

    // Apply ratio test (Lowe's ratio test)
    const goodMatches = [];
    const rawMatches = new cv.DMatchVector();

    for (let i = 0; i < matches.size(); i++) {
      const match = matches.get(i);
      if (match.size() >= 2) {
        const m = match.get(0);
        const n = match.get(1);
        rawMatches.push_back(m);

        if (m.distance < matchingParams.ratioThreshold * n.distance) {
          goodMatches.push(rawMatches.size() - 1); // Store index
        }
      } else if (match.size() === 1) {
        // Only one match found, consider it good
        rawMatches.push_back(match.get(0));
        goodMatches.push(rawMatches.size() - 1);
      }
    }

    matcher.delete();
    matches.delete();

    return { matches: rawMatches, goodMatches };
  }

  /**
   * Compute homography and extract corners
   * @param {cv.KeyPointVector} targetKps - Target keypoints
   * @param {cv.KeyPointVector} frameKps - Frame keypoints
   * @param {cv.DMatchVector} matches - All matches
   * @param {Array} goodMatches - Good match indices
   * @param {number} targetWidth - Target image width
   * @param {number} targetHeight - Target image height
   * @param {number} ransacThreshold - RANSAC threshold
   * @returns {Object} { success, corners, homography }
   */
  _computeHomography(targetKps, frameKps, matches, goodMatches,
                     targetWidth, targetHeight, ransacThreshold) {
    if (goodMatches.length < 4) {
      return { success: false, corners: null, homography: null };
    }

    // Extract point pairs
    const srcPoints = [];
    const dstPoints = [];

    for (const idx of goodMatches) {
      const match = matches.get(idx);
      const targetKp = targetKps.get(match.queryIdx);
      const frameKp = frameKps.get(match.trainIdx);
      srcPoints.push(targetKp.pt.x, targetKp.pt.y);
      dstPoints.push(frameKp.pt.x, frameKp.pt.y);
    }

    // Convert to cv.Mat
    const srcMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2,
                                    srcPoints);
    const dstMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2,
                                    dstPoints);

    try {
      // Find homography using RANSAC
      const homography = cv.findHomography(srcMat, dstMat, cv.RANSAC,
                                           ransacThreshold);

      if (homography.empty()) {
        srcMat.delete();
        dstMat.delete();
        homography.delete();
        return { success: false, corners: null, homography: null };
      }

      // Transform target corners to frame coordinates
      const targetCorners = [
        [0, 0],
        [targetWidth, 0],
        [targetWidth, targetHeight],
        [0, targetHeight]
      ];

      const cornersMat = cv.matFromArray(4, 1, cv.CV_32FC2,
        targetCorners.flat());
      const transformedMat = new cv.Mat();
      cv.perspectiveTransform(cornersMat, transformedMat, homography);

      // Extract corners
      const corners = [];
      for (let i = 0; i < 4; i++) {
        corners.push([
          transformedMat.floatAt(i, 0),
          transformedMat.floatAt(i, 1)
        ]);
      }

      srcMat.delete();
      dstMat.delete();
      cornersMat.delete();
      transformedMat.delete();
      homography.delete();

      return { success: true, corners, homography: null };
    } catch (error) {
      srcMat.delete();
      dstMat.delete();
      console.error('Homography computation failed:', error);
      return { success: false, corners: null, homography: null };
    }
  }

  /**
   * Run a single experiment
   * @param {Object} config - Experiment configuration
   * @returns {Promise<Object>} Experiment result
   */
  async runExperiment(config) {
    const startTime = performance.now();
    const result = {
      config,
      metrics: {},
      success: false,
      error: null,
      visualizations: {}
    };

    try {
      // Scale images
      let targetScaled, frameScaled;
      if (config.targetScale) {
        targetScaled = this._applyScale(this.targetImage, config.targetScale);
      } else if (config.maxDimension) {
        targetScaled = this._scaleImage(this.targetImage, config.maxDimension);
      } else {
        targetScaled = this.targetImage.clone();
      }

      if (config.frameScale) {
        frameScaled = this._applyScale(this.frameImage, config.frameScale);
      } else if (config.maxDimension) {
        frameScaled = this._scaleImage(this.frameImage, config.maxDimension);
      } else {
        frameScaled = this.frameImage.clone();
      }

      result.metrics.targetSize = `${targetScaled.cols}x${targetScaled.rows}`;
      result.metrics.frameSize = `${frameScaled.cols}x${frameScaled.rows}`;

      // Preprocess images
      const targetPreprocessed = this._preprocessImage(targetScaled,
                                                       config.preprocessing);
      const framePreprocessed = this._preprocessImage(frameScaled,
                                                      config.preprocessing);

      // Extract features
      const targetFeatures = this._extractFeatures(targetPreprocessed,
        config.brisk, config.maxFeatures);
      const frameFeatures = this._extractFeatures(framePreprocessed,
        config.brisk, config.maxFeatures);

      result.metrics.targetKeypoints = targetFeatures.keypoints.size();
      result.metrics.frameKeypoints = frameFeatures.keypoints.size();

      // Match features
      const matchResult = this._matchFeatures(targetFeatures.descriptors,
        frameFeatures.descriptors, config.matching);

      result.metrics.rawMatches = matchResult.matches.size();
      result.metrics.goodMatches = matchResult.goodMatches.length;
      result.metrics.ratioThreshold = config.matching.ratioThreshold;

      // Check if we have enough good matches
      if (matchResult.goodMatches.length >= config.matching.minGoodMatches) {
        // Compute homography
        const homographyResult = this._computeHomography(
          targetFeatures.keypoints,
          frameFeatures.keypoints,
          matchResult.matches,
          matchResult.goodMatches,
          targetPreprocessed.cols,
          targetPreprocessed.rows,
          config.matching.ransacThreshold
        );

        result.success = homographyResult.success;
        result.corners = homographyResult.corners;
      } else {
        result.success = false;
        result.corners = null;
      }

      result.metrics.success = result.success;
      result.metrics.processingTime = performance.now() - startTime;

      // Generate visualizations
      result.visualizations.composite = DebugVisualizer.createComposite({
        targetMat: targetPreprocessed,
        frameMat: framePreprocessed,
        targetKps: targetFeatures.keypoints,
        frameKps: frameFeatures.keypoints,
        matches: matchResult.matches,
        goodMatches: matchResult.goodMatches,
        corners: result.corners,
        success: result.success,
        metrics: result.metrics
      });

      // Cleanup
      targetScaled.delete();
      frameScaled.delete();
      targetPreprocessed.delete();
      framePreprocessed.delete();
      targetFeatures.keypoints.delete();
      targetFeatures.descriptors.delete();
      frameFeatures.keypoints.delete();
      frameFeatures.descriptors.delete();
      matchResult.matches.delete();

    } catch (error) {
      console.error(`Experiment ${config.id} failed:`, error);
      result.error = error.message;
      result.metrics.processingTime = performance.now() - startTime;
    }

    return result;
  }

  /**
   * Run all experiments
   * @param {Array} configs - Array of experiment configurations
   * @returns {Promise<Array>} Array of results
   */
  async runAllExperiments(configs) {
    this.results = [];
    const total = configs.length;

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      this._reportProgress(i, total,
        `Running experiment ${i + 1}/${total}: ${config.id}`);

      const result = await this.runExperiment(config);
      this.results.push(result);

      console.log(`Experiment ${config.id}: ` +
                  `Success=${result.success}, ` +
                  `Good matches=${result.metrics.goodMatches}`);
    }

    this._reportProgress(total, total, 'All experiments completed');
    return this.results;
  }

  /**
   * Get results sorted by good matches (descending)
   * @returns {Array} Sorted results
   */
  getSortedResults() {
    return [...this.results].sort((a, b) =>
      b.metrics.goodMatches - a.metrics.goodMatches
    );
  }

  /**
   * Get top N results
   * @param {number} n - Number of top results to return
   * @returns {Array} Top N results
   */
  getTopResults(n = 5) {
    return this.getSortedResults().slice(0, n);
  }

  /**
   * Get successful detections only
   * @returns {Array} Results where success=true
   */
  getSuccessfulDetections() {
    return this.results.filter(r => r.success);
  }

  /**
   * Get results by category
   * @param {string} category - Category name
   * @returns {Array} Filtered results
   */
  getResultsByCategory(category) {
    return this.results.filter(r => r.config.category === category);
  }

  /**
   * Export results as JSON
   * @returns {string} JSON string
   */
  exportResultsJSON() {
    const exportData = this.results.map(r => ({
      id: r.config.id,
      category: r.config.category,
      description: r.config.description,
      metrics: r.metrics,
      success: r.success,
      error: r.error,
      config: r.config
    }));

    return JSON.stringify(exportData, null, 2);
  }
}
