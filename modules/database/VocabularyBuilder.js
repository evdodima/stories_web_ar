/**
 * VocabularyBuilder.js
 *
 * Builds vocabulary tree from ORB descriptors using k-means clustering
 * Ported from Python build_vocabulary_tree.py for frontend use
 */

class VocabularyBuilder {
  constructor(options = {}) {
    this.k = options.branchingFactor || 10;
    this.levels = options.levels || 2;
    this.vocabularySize = Math.pow(this.k, this.levels);
    this.maxFeaturesPerTarget = options.maxFeaturesPerTarget || 1500;

    this.vocabulary = null;
    this.idfWeights = null;
    this.targets = [];

    // ORB detector params (must match live detector in FeatureDetector.js)
    // OpenCV.js uses setter pattern instead of constructor parameters
    this.orbParams = {
      maxFeatures: 1500,      // 1500 vs default 500 for better matching
      scaleFactor: 1.2,       // Default pyramid decimation
      nLevels: 12,            // 12 vs default 8 for better scale invariance
      edgeThreshold: 15,      // 15 vs default 31 for more edge features
      firstLevel: 0,          // Default
      WTA_K: 2,               // Default
      patchSize: 31           // Default
      // Note: scoreType and fastThreshold are not available in this build
    };

    this.onProgress = options.onProgress || (() => {});

    // Cache manager for storing vocabulary trees
    this.cacheManager = null;
    this.albumCode = options.albumCode || null;
    this.initCacheManager();
  }

  /**
   * Initialize cache manager
   */
  async initCacheManager() {
    try {
      if (!window.CacheManager) {
        return;
      }

      this.cacheManager = new window.CacheManager();
      await this.cacheManager.init();
      console.log('[VocabularyBuilder] Cache manager initialized');
    } catch (error) {
      console.error('[VocabularyBuilder] Failed to init cache:', error);
      this.cacheManager = null;
    }
  }

  /**
   * Extract ORB features from an image
   * @param {cv.Mat} imageMat - OpenCV Mat in grayscale
   * @param {string} targetId - Identifier for this target
   * @returns {Object} Feature data
   */
  extractFeatures(imageMat, targetId) {
    const detector = new cv.ORB();
    detector.setMaxFeatures(this.orbParams.maxFeatures);
    detector.setScaleFactor(this.orbParams.scaleFactor);
    detector.setNLevels(this.orbParams.nLevels);
    detector.setEdgeThreshold(this.orbParams.edgeThreshold);
    detector.setFirstLevel(this.orbParams.firstLevel);
    detector.setWTA_K(this.orbParams.WTA_K);
    detector.setPatchSize(this.orbParams.patchSize);

    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();

    detector.detectAndCompute(imageMat, new cv.Mat(), keypoints, descriptors);

    if (descriptors.rows === 0) {
      console.warn(`No features found for ${targetId}`);
      detector.delete();
      keypoints.delete();
      descriptors.delete();
      return null;
    }

    // Convert to arrays for processing
    const keypointsArray = [];
    const responsesArray = [];
    for (let i = 0; i < keypoints.size(); i++) {
      const kp = keypoints.get(i);
      keypointsArray.push({
        x: kp.pt.x,
        y: kp.pt.y,
        response: kp.response
      });
      responsesArray.push(kp.response);
    }

    // Save descriptor size and image size before we delete anything
    const descriptorSize = descriptors.cols;
    const imageWidth = imageMat.cols;
    const imageHeight = imageMat.rows;

    // Convert descriptors to Uint8Array (copy data before deletion)
    const totalBytes = descriptors.rows * descriptorSize;
    const descriptorsArray = new Uint8Array(totalBytes);
    for (let i = 0; i < totalBytes; i++) {
      descriptorsArray[i] = descriptors.data[i];
    }

    // Feature selection (keep best distributed features)
    const selected = this._selectBestFeatures(
      keypointsArray,
      descriptorsArray,
      descriptorSize,
      { width: imageWidth, height: imageHeight }
    );

    console.log(`  ${targetId}: ${selected.keypoints.length} features`);

    // Clean up OpenCV objects
    detector.delete();
    keypoints.delete();
    descriptors.delete();

    return {
      id: targetId,
      keypoints: selected.keypoints,
      descriptors: selected.descriptors,
      descriptorSize: descriptorSize,
      numFeatures: selected.keypoints.length,
      imageSize: { width: imageWidth, height: imageHeight }
    };
  }

  /**
   * Select best features using spatial distribution
   */
  _selectBestFeatures(keypoints, descriptorsFlat, descriptorSize, imageSize) {
    if (keypoints.length <= this.maxFeaturesPerTarget) {
      return { keypoints, descriptors: descriptorsFlat };
    }

    const { width, height } = imageSize;

    // Sort by response (strongest first)
    const indices = keypoints
      .map((kp, i) => ({ index: i, response: kp.response }))
      .sort((a, b) => b.response - a.response);

    // Spatial grid for distribution
    const gridSize = 4;
    const cellW = width / gridSize;
    const cellH = height / gridSize;
    const featuresPerCell = Math.floor(
      this.maxFeaturesPerTarget / (gridSize * gridSize)
    );

    const selected = [];
    const cellCounts = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));

    // First pass: distribute across grid
    for (const { index } of indices) {
      const kp = keypoints[index];
      const cellX = Math.min(Math.floor(kp.x / cellW), gridSize - 1);
      const cellY = Math.min(Math.floor(kp.y / cellH), gridSize - 1);

      if (cellCounts[cellY][cellX] < featuresPerCell) {
        selected.push(index);
        cellCounts[cellY][cellX]++;

        if (selected.length >= this.maxFeaturesPerTarget) break;
      }
    }

    // Second pass: fill remaining with strongest
    if (selected.length < this.maxFeaturesPerTarget) {
      for (const { index } of indices) {
        if (!selected.includes(index)) {
          selected.push(index);
          if (selected.length >= this.maxFeaturesPerTarget) break;
        }
      }
    }

    // Extract selected features
    const selectedKeypoints = selected.map(i => keypoints[i]);
    const selectedDescriptors = new Uint8Array(selected.length * descriptorSize);

    for (let i = 0; i < selected.length; i++) {
      const srcOffset = selected[i] * descriptorSize;
      const dstOffset = i * descriptorSize;
      selectedDescriptors.set(
        descriptorsFlat.slice(srcOffset, srcOffset + descriptorSize),
        dstOffset
      );
    }

    return {
      keypoints: selectedKeypoints,
      descriptors: selectedDescriptors
    };
  }

  /**
   * Build vocabulary tree using k-means clustering
   * @param {Array} allDescriptors - Array of descriptor Uint8Arrays
   * @param {number} descriptorSize - Bytes per descriptor
   */
  async buildVocabulary(allDescriptors, descriptorSize) {
    const totalDescriptors = allDescriptors.reduce(
      (sum, desc) => sum + desc.length / descriptorSize,
      0
    );

    console.log(`Building vocabulary tree:`);
    console.log(`  Branching factor: ${this.k}`);
    console.log(`  Levels: ${this.levels}`);
    console.log(`  Vocabulary size: ${this.vocabularySize} words`);
    console.log(`  Input descriptors: ${totalDescriptors}`);

    // Adjust vocabulary size if needed
    if (totalDescriptors < this.vocabularySize) {
      console.warn(
        `Few descriptors (${totalDescriptors}) vs vocab (${this.vocabularySize})`
      );
      this.vocabularySize = Math.min(this.vocabularySize, totalDescriptors);
    }

    this.onProgress({ stage: 'clustering', progress: 0 });

    // Convert binary descriptors to bit arrays for k-means
    const descriptorsBits = this._descriptorsToBitArrays(
      allDescriptors,
      descriptorSize
    );

    // Run k-means clustering
    const kmeans = await this._kMeansClustering(
      descriptorsBits,
      this.vocabularySize
    );

    // Convert cluster centers back to binary
    this.vocabulary = this._bitArraysToDescriptors(
      kmeans.centers,
      descriptorSize
    );

    console.log(`Vocabulary tree built: ${this.vocabulary.length} words`);
    this.onProgress({ stage: 'clustering', progress: 100 });

    return kmeans;
  }

  /**
   * Convert binary descriptors to bit arrays (for k-means)
   */
  _descriptorsToBitArrays(allDescriptors, descriptorSize) {
    const bitArrays = [];

    for (const descriptors of allDescriptors) {
      const numDesc = descriptors.length / descriptorSize;
      for (let i = 0; i < numDesc; i++) {
        const desc = descriptors.slice(i * descriptorSize, (i + 1) * descriptorSize);
        const bits = [];

        // Unpack bits
        for (let byte of desc) {
          for (let bit = 7; bit >= 0; bit--) {
            bits.push((byte >> bit) & 1);
          }
        }

        bitArrays.push(bits);
      }
    }

    return bitArrays;
  }

  /**
   * Convert bit arrays back to binary descriptors
   */
  _bitArraysToDescriptors(bitArrays, descriptorSize) {
    return bitArrays.map(bits => {
      const descriptor = new Uint8Array(descriptorSize);

      for (let i = 0; i < descriptorSize; i++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          if (bits[i * 8 + bit] > 0.5) {
            byte |= (1 << (7 - bit));
          }
        }
        descriptor[i] = byte;
      }

      return descriptor;
    });
  }

  /**
   * K-means clustering implementation
   */
  async _kMeansClustering(data, k, maxIterations = 50) {
    const n = data.length;
    const dims = data[0].length;

    // Initialize centers randomly
    const centerIndices = new Set();
    while (centerIndices.size < k) {
      centerIndices.add(Math.floor(Math.random() * n));
    }
    let centers = Array.from(centerIndices).map(i => [...data[i]]);

    let assignments = new Array(n).fill(0);
    let changed = true;
    let iteration = 0;

    while (changed && iteration < maxIterations) {
      changed = false;
      iteration++;

      // Assignment step: assign each point to nearest center
      for (let i = 0; i < n; i++) {
        let minDist = Infinity;
        let bestCluster = 0;

        for (let j = 0; j < k; j++) {
          const dist = this._euclideanDistance(data[i], centers[j]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = j;
          }
        }

        if (assignments[i] !== bestCluster) {
          assignments[i] = bestCluster;
          changed = true;
        }
      }

      // Update step: recalculate centers
      const newCenters = Array(k).fill(0).map(() => new Array(dims).fill(0));
      const counts = new Array(k).fill(0);

      for (let i = 0; i < n; i++) {
        const cluster = assignments[i];
        counts[cluster]++;
        for (let d = 0; d < dims; d++) {
          newCenters[cluster][d] += data[i][d];
        }
      }

      for (let j = 0; j < k; j++) {
        if (counts[j] > 0) {
          for (let d = 0; d < dims; d++) {
            newCenters[j][d] /= counts[j];
          }
          centers[j] = newCenters[j];
        }
      }

      // Progress update
      if (iteration % 5 === 0) {
        this.onProgress({
          stage: 'clustering',
          progress: (iteration / maxIterations) * 100
        });
        await this._sleep(0); // Allow UI updates
      }
    }

    console.log(`K-means converged in ${iteration} iterations`);

    return { centers, assignments };
  }

  /**
   * Euclidean distance between two vectors
   */
  _euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Quantize a descriptor to the nearest vocabulary word
   */
  quantizeDescriptor(descriptor) {
    let minDist = Infinity;
    let bestWord = 0;

    for (let i = 0; i < this.vocabulary.length; i++) {
      const dist = this._hammingDistance(descriptor, this.vocabulary[i]);
      if (dist < minDist) {
        minDist = dist;
        bestWord = i;
      }
    }

    return bestWord;
  }

  /**
   * Hamming distance between two binary descriptors
   */
  _hammingDistance(a, b) {
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
      const xor = a[i] ^ b[i];
      // Count set bits
      let count = xor;
      count = count - ((count >> 1) & 0x55);
      count = (count & 0x33) + ((count >> 2) & 0x33);
      count = (count + (count >> 4)) & 0x0f;
      dist += count;
    }
    return dist;
  }

  /**
   * Convert descriptors to Bag-of-Words
   */
  descriptorsToBoW(descriptors, descriptorSize) {
    const bow = {};
    const numDesc = descriptors.length / descriptorSize;

    for (let i = 0; i < numDesc; i++) {
      const desc = descriptors.slice(i * descriptorSize, (i + 1) * descriptorSize);
      const wordId = this.quantizeDescriptor(desc);
      bow[wordId] = (bow[wordId] || 0) + 1;
    }

    return bow;
  }

  /**
   * Compute IDF weights
   */
  computeIDF(targetBoWVectors) {
    const N = targetBoWVectors.length;
    const df = new Array(this.vocabularySize).fill(0);

    // Count document frequency for each word
    for (const bow of targetBoWVectors) {
      for (const wordId in bow) {
        df[parseInt(wordId)]++;
      }
    }

    // Compute IDF weights
    this.idfWeights = df.map(count => Math.log((N + 1) / (count + 1)));

    console.log(`IDF weights computed for ${this.vocabularySize} words`);
  }

  /**
   * Convert BoW to TF-IDF vector
   */
  computeTFIDFVector(bow, numFeatures) {
    const tfidf = {};

    for (const wordIdStr in bow) {
      const wordId = parseInt(wordIdStr);
      const count = bow[wordIdStr];

      // TF = term frequency (normalized)
      const tf = count / numFeatures;
      // IDF from pre-computed weights
      const idf = this.idfWeights[wordId] || 1.0;
      // TF-IDF
      tfidf[wordId] = tf * idf;
    }

    return tfidf;
  }

  /**
   * Process all targets and build complete database
   * Checks cache first, builds if not cached
   */
  async processTargets(targetData) {
    console.log(`Processing ${targetData.length} targets...`);

    // Ensure cache manager is initialized
    if (!this.cacheManager && window.CacheManager) {
      await this.initCacheManager();
    }

    // Try to load from cache first
    if (this.cacheManager && this.albumCode) {
      this.onProgress({ stage: 'cache', progress: 0, message: 'Checking cache...' });

      try {
        const cachedData = await this.cacheManager.getVocabulary(this.albumCode);
        if (cachedData) {
          console.log('[VocabularyBuilder] Loading from cache');
          this.importDatabase(cachedData);
          this.onProgress({
            stage: 'cache',
            progress: 100,
            message: 'Loaded from cache',
            cached: true
          });
          return this.targets;
        }

        console.log('[VocabularyBuilder] Not in cache, building...');
      } catch (error) {
        console.error('[VocabularyBuilder] Cache lookup failed:', error);
      }
    }

    // Build vocabulary tree from scratch
    this.onProgress({ stage: 'extracting', progress: 0 });

    // Step 1: Extract features from all targets
    const allDescriptors = [];
    const targetFeatures = [];
    let descriptorSize = null;

    for (let i = 0; i < targetData.length; i++) {
      const { imageMat, targetId } = targetData[i];

      this.onProgress({
        stage: 'extracting',
        progress: ((i + 1) / targetData.length) * 100
      });

      const features = this.extractFeatures(imageMat, targetId);
      if (!features) continue;

      descriptorSize = features.descriptorSize;
      targetFeatures.push(features);
      allDescriptors.push(features.descriptors);
    }

    if (allDescriptors.length === 0) {
      throw new Error('No features extracted from any target');
    }

    // Step 2: Build vocabulary
    await this.buildVocabulary(allDescriptors, descriptorSize);

    // Step 3: Convert to BoW
    this.onProgress({ stage: 'bow', progress: 0 });
    console.log('Converting to Bag-of-Words...');

    const targetBoWVectors = [];
    for (let i = 0; i < targetFeatures.length; i++) {
      const target = targetFeatures[i];
      const bow = this.descriptorsToBoW(target.descriptors, descriptorSize);
      target.bow = bow;
      targetBoWVectors.push(bow);

      this.onProgress({
        stage: 'bow',
        progress: ((i + 1) / targetFeatures.length) * 100
      });
    }

    // Step 4: Compute IDF
    this.onProgress({ stage: 'idf', progress: 0 });
    this.computeIDF(targetBoWVectors);
    this.onProgress({ stage: 'idf', progress: 100 });

    // Step 5: Compute TF-IDF
    this.onProgress({ stage: 'tfidf', progress: 0 });
    console.log('Computing TF-IDF vectors...');

    for (let i = 0; i < targetFeatures.length; i++) {
      const target = targetFeatures[i];
      target.bow_tfidf = this.computeTFIDFVector(target.bow, target.numFeatures);

      this.onProgress({
        stage: 'tfidf',
        progress: ((i + 1) / targetFeatures.length) * 100
      });
    }

    this.targets = targetFeatures;

    // Cache the built vocabulary tree
    if (this.cacheManager && this.albumCode) {
      this.onProgress({ stage: 'caching', progress: 0, message: 'Saving to cache...' });

      try {
        const database = this.exportDatabase();
        await this.cacheManager.storeVocabulary(this.albumCode, database);
        console.log('[VocabularyBuilder] Vocabulary tree cached');
        this.onProgress({ stage: 'caching', progress: 100 });
      } catch (error) {
        console.error('[VocabularyBuilder] Failed to cache vocabulary:', error);
      }
    }

    return targetFeatures;
  }

  /**
   * Export database in JSON format (compatible with existing system)
   */
  exportDatabase() {
    const database = {
      metadata: {
        num_targets: this.targets.length,
        vocabulary_size: this.vocabularySize,
        branching_factor: this.k,
        levels: this.levels,
        descriptor_type: 'ORB',
        descriptor_bytes: this.targets[0]?.descriptorSize || 32
      },
      vocabulary: {
        words: this.vocabulary.map(word => Array.from(word)),
        idf_weights: this.idfWeights
      },
      targets: this.targets.map(target => ({
        id: target.id,
        filename: target.id, // Will be set by ZipDatabaseLoader
        num_features: target.numFeatures,
        keypoints: target.keypoints.map(kp => [kp.x, kp.y]),
        descriptors: Array.from(target.descriptors).reduce((acc, val, i) => {
          const idx = Math.floor(i / target.descriptorSize);
          if (!acc[idx]) acc[idx] = [];
          acc[idx].push(val);
          return acc;
        }, []),
        bow: target.bow,
        bow_tfidf: target.bow_tfidf,
        image_meta: {
          width: target.imageSize.width,
          height: target.imageSize.height,
          aspect_ratio: target.imageSize.width / target.imageSize.height
        }
      }))
    };

    return database;
  }

  /**
   * Import database from cached data
   * Restores vocabulary tree and targets
   */
  importDatabase(database) {
    console.log('[VocabularyBuilder] Importing cached database');

    // Restore metadata
    this.k = database.metadata.branching_factor;
    this.levels = database.metadata.levels;
    this.vocabularySize = database.metadata.vocabulary_size;

    // Restore vocabulary (convert arrays back to Uint8Arrays)
    this.vocabulary = database.vocabulary.words.map(word =>
      new Uint8Array(word)
    );
    this.idfWeights = database.vocabulary.idf_weights;

    // Restore targets
    this.targets = database.targets.map(target => {
      const descriptorSize = database.metadata.descriptor_bytes;

      // Convert descriptors back to flat Uint8Array
      const descriptorsFlat = new Uint8Array(
        target.descriptors.length * descriptorSize
      );
      target.descriptors.forEach((desc, i) => {
        descriptorsFlat.set(desc, i * descriptorSize);
      });

      return {
        id: target.id,
        numFeatures: target.num_features,
        keypoints: target.keypoints.map(kp => ({ x: kp[0], y: kp[1] })),
        descriptors: descriptorsFlat,
        descriptorSize: descriptorSize,
        bow: target.bow,
        bow_tfidf: target.bow_tfidf,
        imageSize: {
          width: target.image_meta.width,
          height: target.image_meta.height
        }
      };
    });

    console.log(`[VocabularyBuilder] Imported ${this.targets.length} targets`);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.VocabularyBuilder = VocabularyBuilder;
}
