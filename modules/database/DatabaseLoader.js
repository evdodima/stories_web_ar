/**
 * Database Loader for Vocabulary Tree Target Database
 *
 * Loads pre-built target database with vocabulary tree, features, and metadata.
 * For now, loads targets from database (vocabulary tree query implementation later).
 */
class DatabaseLoader {
  constructor() {
    this.database = null;
    this.isLoaded = false;
  }

  /**
   * Load target database from JSON file
   * @param {string} url - URL to database JSON file
   * @returns {Promise<Object>} Loaded database
   */
  async loadDatabase(url) {
    console.log(`Loading target database from ${url}...`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load database: ${response.statusText}`);
      }

      this.database = await response.json();
      this.isLoaded = true;

      console.log(`Database loaded successfully:`);
      console.log(`  - Targets: ${this.database.metadata.num_targets}`);
      console.log(`  - Vocabulary size: ${this.database.metadata.vocabulary_size}`);
      console.log(`  - Descriptor type: ${this.database.metadata.descriptor_type}`);

      return this.database;
    } catch (error) {
      console.error('Error loading database:', error);
      throw error;
    }
  }

  /**
   * Get all targets from database
   * @returns {Array<Object>} Array of target objects
   */
  getTargets() {
    if (!this.isLoaded) {
      console.warn('Database not loaded yet');
      return [];
    }

    return this.database.targets || [];
  }

  /**
   * Get target by ID
   * @param {string} targetId - Target ID
   * @returns {Object|null} Target object or null
   */
  getTarget(targetId) {
    if (!this.isLoaded) return null;

    return this.database.targets?.find(t => t.id === targetId) || null;
  }

  /**
   * Convert database target to runtime format
   * @param {Object} dbTarget - Target from database
   * @returns {Object} Runtime target format
   */
  convertToRuntimeFormat(dbTarget) {
    // Convert descriptors from array of int arrays to OpenCV Mat format
    const descriptors = this.convertDescriptors(dbTarget.descriptors);
    const keypoints = this.convertKeypoints(dbTarget.keypoints);

    // Create a dummy image Mat with correct dimensions for corner calculations
    const imageMeta = dbTarget.image_meta || {};
    const dummyImage = new cv.Mat(
      imageMeta.height || 480,
      imageMeta.width || 640,
      cv.CV_8UC1
    );

    return {
      id: dbTarget.id,
      label: dbTarget.id,
      filename: dbTarget.filename,
      numFeatures: dbTarget.num_features,
      referenceData: {
        keypoints: keypoints,
        descriptors: descriptors,
        image: dummyImage // Dummy image with correct dimensions
      },
      // Enhanced metadata from database
      imageMeta: dbTarget.image_meta || {},
      qualityMetrics: dbTarget.quality_metrics || {},
      colorHistogram: dbTarget.color_histogram || {},
      spatialLayout: dbTarget.spatial_layout || {},
      scaleHints: dbTarget.scale_hints || {},
      validation: dbTarget.validation || {},
      // BoW data (for future vocabulary tree query)
      bow: dbTarget.bow || {},
      bowTfidf: dbTarget.bow_tfidf || {},
      // Runtime state
      runtime: {
        status: 'idle',
        lastSeen: null,
        score: 0
      }
    };
  }

  /**
   * Convert keypoints from database format to OpenCV format
   * @param {Array<Array<number>>} keypointsArray - [[x, y], ...]
   * @returns {cv.KeyPointVector} OpenCV keypoints
   */
  convertKeypoints(keypointsArray) {
    const keypoints = new cv.KeyPointVector();

    for (const [x, y] of keypointsArray) {
      // OpenCV.js doesn't expose KeyPoint constructor, create object manually
      const kp = {
        pt: { x, y },
        size: 7,
        angle: -1,
        response: 0,
        octave: 0,
        class_id: -1
      };
      keypoints.push_back(kp);
    }

    return keypoints;
  }

  /**
   * Convert descriptors from database format to OpenCV Mat
   * @param {Array<Array<number>>} descriptorsArray - [[byte, ...], ...]
   * @returns {cv.Mat} OpenCV Mat with descriptors
   */
  convertDescriptors(descriptorsArray) {
    if (!descriptorsArray || descriptorsArray.length === 0) {
      return new cv.Mat();
    }

    const numDescriptors = descriptorsArray.length;
    const descriptorSize = descriptorsArray[0].length;

    // Create Mat from flat array
    const flatData = new Uint8Array(numDescriptors * descriptorSize);

    for (let i = 0; i < numDescriptors; i++) {
      for (let j = 0; j < descriptorSize; j++) {
        flatData[i * descriptorSize + j] = descriptorsArray[i][j];
      }
    }

    const mat = new cv.Mat(numDescriptors, descriptorSize, cv.CV_8U);
    mat.data.set(flatData);

    return mat;
  }

  /**
   * Get all targets in runtime format
   * @returns {Array<Object>} Runtime-formatted targets
   */
  getAllRuntimeTargets() {
    const dbTargets = this.getTargets();
    return dbTargets.map(t => this.convertToRuntimeFormat(t));
  }

  /**
   * Get database metadata
   * @returns {Object} Database metadata
   */
  getMetadata() {
    return this.database?.metadata || {};
  }

  /**
   * Get vocabulary (for future use)
   * @returns {Object} Vocabulary data
   */
  getVocabulary() {
    return this.database?.vocabulary || {};
  }

  /**
   * Check if database is loaded
   * @returns {boolean}
   */
  isReady() {
    return this.isLoaded;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.DatabaseLoader = DatabaseLoader;
}
