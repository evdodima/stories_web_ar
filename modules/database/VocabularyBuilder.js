/**
 * VocabularyBuilder.js
 *
 * Builds vocabulary tree from SIFT descriptors using k-means clustering
 * Uses SIFT for keypoint detection and feature description
 * Ported from Python build_vocabulary_tree.py for frontend use
 */

class VocabularyBuilder {
  constructor(options = {}) {
    // Check if adaptive vocabulary is enabled
    this.adaptiveVocabulary = options.adaptiveVocabulary !== undefined
      ? options.adaptiveVocabulary
      : (AppConfig.vocabulary.adaptive !== undefined ? AppConfig.vocabulary.adaptive : true);

    // Initial vocabulary params (may be overridden by adaptive sizing)
    this.k = options.branchingFactor || AppConfig.vocabulary.branchingFactor;
    this.levels = options.levels || AppConfig.vocabulary.levels;
    this.vocabularySize = Math.pow(this.k, this.levels);
    this.maxFeaturesPerTarget = options.maxFeaturesPerTarget || AppConfig.vocabulary.maxFeaturesPerTarget;

    this.vocabulary = null;
    this.vocabularyTree = null; // Hierarchical tree structure
    this.idfWeights = null;
    this.targets = [];

    // SIFT params (must match live detector in FeatureDetector.js)
    this.siftParams = {
      nfeatures: AppConfig.sift.nfeatures,
      nOctaveLayers: AppConfig.sift.nOctaveLayers,
      contrastThreshold: AppConfig.sift.contrastThreshold,
      edgeThreshold: AppConfig.sift.edgeThreshold,
      sigma: AppConfig.sift.sigma
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
   * Calculate optimal vocabulary parameters based on database size
   * Uses state-of-the-art formulas from ORB-SLAM and DBoW2, adjusted for small databases
   * @param {number} numTargets - Number of target images
   * @param {number} featuresPerTarget - Average features per target
   * @returns {Object} - {branchingFactor, levels, vocabularySize}
   */
  _calculateOptimalVocabularyParams(numTargets, featuresPerTarget = 500) {
    console.log(`[Adaptive Vocabulary] Calculating optimal parameters:`);
    console.log(`  Number of targets: ${numTargets}`);
    console.log(`  Features per target: ${featuresPerTarget}`);

    const totalFeatures = numTargets * featuresPerTarget;
    console.log(`  Total descriptors: ${totalFeatures}`);

    let branchingFactor, levels, vocabularySize;

    // CRITICAL FIX: Use descriptor-based sizing for small databases
    // Rule: Aim for 8-12 features per vocabulary word for good clustering
    const targetFeaturesPerWord = 10;
    const idealVocabSize = Math.floor(totalFeatures / targetFeaturesPerWord);

    console.log(`  Ideal vocabulary size: ${idealVocabSize} words (${targetFeaturesPerWord} features/word)`);

    // Adaptive sizing based on total descriptors (more accurate than target count)
    if (totalFeatures < 1000) {
      // Very small database: 64-100 words (like BRISK era)
      branchingFactor = 10;
      levels = 2; // 10^2 = 100
      vocabularySize = Math.pow(branchingFactor, levels);
      console.log(`  Selected: Very small database config (<1000 descriptors, BRISK-like)`);
    } else if (totalFeatures < 3000) {
      // Small database: 64-256 words
      branchingFactor = 8;
      levels = 2; // 8^2 = 64
      // But adjust if we have more descriptors
      if (idealVocabSize > 100) {
        levels = 3; // 8^3 = 512 (but will be capped below)
      }
      vocabularySize = Math.pow(branchingFactor, levels);
      console.log(`  Selected: Small database config (1k-3k descriptors)`);
    } else if (totalFeatures < 10000) {
      // Small database: 256-1,000 words
      branchingFactor = 8;
      levels = 3; // 8^3 = 512
      vocabularySize = Math.pow(branchingFactor, levels);
      console.log(`  Selected: Small database config (3k-10k descriptors)`);
    } else if (totalFeatures < 50000) {
      // Medium-small database: 1,000-4,000 words
      branchingFactor = 10;
      levels = 3; // 10^3 = 1,000
      vocabularySize = Math.pow(branchingFactor, levels);
      console.log(`  Selected: Medium-small database config (10k-50k descriptors)`);
    } else if (totalFeatures < 200000) {
      // Medium-large database: 4,000-8,000 words
      branchingFactor = 10;
      levels = 4; // 10^4 = 10,000
      vocabularySize = 8000; // Cap at 8k
      console.log(`  Selected: Medium-large database config (50k-200k descriptors)`);
    } else {
      // Large database: 8,000-10,000 words
      branchingFactor = 10;
      levels = 4; // 10^4 = 10,000
      vocabularySize = 10000;
      console.log(`  Selected: Large database config (200k+ descriptors)`);
    }

    // CRITICAL: Cap vocabulary at 15% of total descriptors for good clustering
    // This ensures each cluster has enough features (6-7 features/word minimum)
    const maxVocabSize = Math.floor(totalFeatures * 0.15);
    if (vocabularySize > maxVocabSize) {
      vocabularySize = maxVocabSize;
      // Recalculate levels to match capped size
      levels = Math.max(2, Math.floor(Math.log(vocabularySize) / Math.log(branchingFactor)));
      vocabularySize = Math.pow(branchingFactor, levels);
      console.log(`  ⚠️  Capped vocabulary for clustering quality (15% of descriptors)`);
    }

    // Ensure minimum vocabulary size for discrimination
    vocabularySize = Math.max(64, vocabularySize);

    // Final validation
    const featuresPerWord = totalFeatures / vocabularySize;
    const separationEstimate = featuresPerWord > 8 ? 'GOOD' : 'POOR';

    console.log(`  Final vocabulary parameters:`);
    console.log(`    Branching factor: ${branchingFactor}`);
    console.log(`    Levels: ${levels}`);
    console.log(`    Vocabulary size: ${vocabularySize} words`);
    console.log(`    Words per target: ${(vocabularySize / numTargets).toFixed(1)}`);
    console.log(`    Features per word: ${featuresPerWord.toFixed(1)} (${separationEstimate})`);

    if (featuresPerWord < 8) {
      console.warn(`  ⚠️  WARNING: Low features/word ratio may result in poor clustering!`);
      console.warn(`  ⚠️  Consider increasing maxFeaturesPerTarget or reducing vocabulary size.`);
    }

    return {
      branchingFactor,
      levels,
      vocabularySize
    };
  }

  /**
   * Extract features from an image using ORB detector and TEBLID descriptor
   * @param {cv.Mat} imageMat - OpenCV Mat in grayscale
   * @param {string} targetId - Identifier for this target
   * @returns {Object} Feature data
   */
  extractFeatures(imageMat, targetId) {
    // SIFT for both keypoint detection and feature description
    let sift;
    if (typeof cv.SIFT_create === 'function') {
      sift = cv.SIFT_create(
        this.siftParams.nfeatures,
        this.siftParams.nOctaveLayers,
        this.siftParams.contrastThreshold,
        this.siftParams.edgeThreshold,
        this.siftParams.sigma
      );
    } else if (typeof cv.SIFT === 'function') {
      sift = new cv.SIFT(
        this.siftParams.nfeatures,
        this.siftParams.nOctaveLayers,
        this.siftParams.contrastThreshold,
        this.siftParams.edgeThreshold,
        this.siftParams.sigma
      );
    } else {
      throw new Error('SIFT not available in this OpenCV.js build');
    }

    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();

    // Detect keypoints and compute descriptors with SIFT
    sift.detect(imageMat, keypoints);
    sift.compute(imageMat, keypoints, descriptors);

    if (descriptors.rows === 0) {
      console.warn(`No features found for ${targetId}`);
      sift.delete();
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

    // Convert descriptors to Float32Array (SIFT uses floating-point descriptors)
    const totalElements = descriptors.rows * descriptorSize;
    const descriptorsArray = new Float32Array(totalElements);
    for (let i = 0; i < totalElements; i++) {
      descriptorsArray[i] = descriptors.data32F[i];
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
    sift.delete();
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
   * Select best features using spatial distribution + response filtering
   * Mimics BRISK's selectivity by keeping only strong features
   */
  _selectBestFeatures(keypoints, descriptorsFlat, descriptorSize, imageSize) {
    if (keypoints.length <= this.maxFeaturesPerTarget) {
      return { keypoints, descriptors: descriptorsFlat };
    }

    const { width, height } = imageSize;

    // STEP 1: Filter by response strength (keep top 60%)
    // This mimics BRISK's selectivity - only strong corners
    const sortedByResponse = keypoints
      .map((kp, i) => ({ index: i, response: kp.response, x: kp.x, y: kp.y }))
      .sort((a, b) => b.response - a.response);

    // Calculate response threshold (60th percentile)
    const responseThresholdIdx = Math.floor(sortedByResponse.length * 0.4);
    const responseThreshold = sortedByResponse[responseThresholdIdx]?.response || 0;

    console.log(`  Response filtering: ${sortedByResponse.length} → ${sortedByResponse.filter(f => f.response > responseThreshold).length} features (threshold: ${responseThreshold.toFixed(1)})`);

    // Keep only strong features
    const strongFeatures = sortedByResponse.filter(f => f.response > responseThreshold);

    // STEP 2: Spatial distribution on filtered features
    const indices = strongFeatures;

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
   * Build hierarchical vocabulary tree using recursive k-means clustering
   * @param {Array} allDescriptors - Array of descriptor Uint8Arrays
   * @param {number} descriptorSize - Bytes per descriptor
   */
  async buildVocabulary(allDescriptors, descriptorSize) {
    const totalDescriptors = allDescriptors.reduce(
      (sum, desc) => sum + desc.length / descriptorSize,
      0
    );

    console.log(`Building hierarchical vocabulary tree:`);
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
      // Recalculate levels
      this.levels = Math.max(2, Math.ceil(Math.log(this.vocabularySize) / Math.log(this.k)));
    }

    this.onProgress({ stage: 'clustering', progress: 0 });

    // CONSTANT COMPLEXITY OPTIMIZATION:
    // Sample a fixed number of descriptors for clustering to ensure
    // constant build time regardless of total descriptor count
    const maxSamplesForClustering = 10000; // Fixed sample size
    const sampledDescriptors = this._sampleDescriptors(
      allDescriptors,
      descriptorSize,
      maxSamplesForClustering
    );

    console.log(`  Sampled descriptors for clustering: ${sampledDescriptors.length / descriptorSize}`);

    // Build hierarchical tree recursively
    console.log(`  Building hierarchical tree with ${this.levels} levels...`);
    this.vocabularyTree = await this._buildHierarchicalTree(
      sampledDescriptors,
      descriptorSize,
      0 // Start at level 0
    );

    // Extract flat vocabulary from leaf nodes for backward compatibility
    this.vocabulary = this._extractLeafNodes(this.vocabularyTree);

    console.log(`Vocabulary tree built: ${this.vocabulary.length} words (${this.levels} levels)`);
    this.onProgress({ stage: 'clustering', progress: 100 });

    return { tree: this.vocabularyTree, vocabulary: this.vocabulary };
  }

  /**
   * Recursively build hierarchical vocabulary tree
   * @param {Uint8Array} descriptorsFlat - Descriptors for this subtree
   * @param {number} descriptorSize - Bytes per descriptor
   * @param {number} currentLevel - Current level in tree (0 = root)
   * @returns {Object} Tree node with children
   */
  async _buildHierarchicalTree(descriptorsFlat, descriptorSize, currentLevel) {
    const n = descriptorsFlat.length / descriptorSize;

    // Base case: if at leaf level or too few descriptors, return leaf node
    if (currentLevel >= this.levels - 1 || n < this.k) {
      // Cluster into final vocabulary words
      const numClusters = Math.min(this.k, n);
      const kmeans = await this._kMeansClusteringBinary(
        descriptorsFlat,
        descriptorSize,
        numClusters,
        15 // Fewer iterations for leaf nodes
      );

      return {
        level: currentLevel,
        isLeaf: true,
        centers: kmeans.centers,
        children: null
      };
    }

    // Recursive case: cluster and recurse into children
    const kmeans = await this._kMeansClusteringBinary(
      descriptorsFlat,
      descriptorSize,
      this.k,
      20 // Moderate iterations for internal nodes
    );

    // Create child nodes for each cluster
    const children = [];
    for (let i = 0; i < this.k; i++) {
      // Collect descriptors assigned to this cluster
      const clusterDescriptors = [];
      for (let j = 0; j < n; j++) {
        if (kmeans.assignments[j] === i) {
          const offset = j * descriptorSize;
          clusterDescriptors.push(
            ...descriptorsFlat.slice(offset, offset + descriptorSize)
          );
        }
      }

      // Skip empty clusters
      if (clusterDescriptors.length === 0) {
        continue;
      }

      // Recursively build subtree
      const childDescriptors = new Uint8Array(clusterDescriptors);
      const childNode = await this._buildHierarchicalTree(
        childDescriptors,
        descriptorSize,
        currentLevel + 1
      );

      children.push(childNode);

      // Update progress
      const progress = ((i + 1) / this.k) * 100;
      this.onProgress({
        stage: 'clustering',
        progress: Math.min(95, progress),
        message: `Level ${currentLevel + 1}/${this.levels}`
      });
      await this._sleep(0);
    }

    return {
      level: currentLevel,
      isLeaf: false,
      centers: kmeans.centers,
      children: children
    };
  }

  /**
   * Extract leaf nodes from hierarchical tree into flat vocabulary array
   * @param {Object} tree - Root of vocabulary tree
   * @returns {Array<Uint8Array>} Flat array of vocabulary words
   */
  _extractLeafNodes(tree) {
    const leaves = [];

    function traverse(node) {
      if (node.isLeaf) {
        leaves.push(...node.centers);
      } else if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }

    traverse(tree);
    return leaves;
  }

  /**
   * Sample descriptors for clustering (constant complexity)
   * Ensures vocabulary building time is predictable
   */
  _sampleDescriptors(allDescriptors, descriptorSize, maxSamples) {
    // Calculate total number of descriptors
    const totalDescriptors = allDescriptors.reduce(
      (sum, desc) => sum + desc.length / descriptorSize,
      0
    );

    // If we have fewer descriptors than maxSamples, use all
    if (totalDescriptors <= maxSamples) {
      const combined = new Uint8Array(totalDescriptors * descriptorSize);
      let offset = 0;
      for (const desc of allDescriptors) {
        combined.set(desc, offset);
        offset += desc.length;
      }
      return combined;
    }

    // Otherwise, randomly sample descriptors
    const sampled = new Uint8Array(maxSamples * descriptorSize);
    const sampleIndices = new Set();

    // Generate random unique indices
    while (sampleIndices.size < maxSamples) {
      sampleIndices.add(Math.floor(Math.random() * totalDescriptors));
    }

    // Extract sampled descriptors
    const indices = Array.from(sampleIndices).sort((a, b) => a - b);
    let sampledIdx = 0;

    for (let i = 0; i < indices.length; i++) {
      const globalIdx = indices[i];

      // Find which descriptor array this index belongs to
      let currentIdx = globalIdx;
      let descriptorArray = null;

      for (const desc of allDescriptors) {
        const numDesc = desc.length / descriptorSize;
        if (currentIdx < numDesc) {
          descriptorArray = desc;
          break;
        }
        currentIdx -= numDesc;
      }

      if (descriptorArray) {
        const srcOffset = currentIdx * descriptorSize;
        const dstOffset = sampledIdx * descriptorSize;
        sampled.set(
          descriptorArray.slice(srcOffset, srcOffset + descriptorSize),
          dstOffset
        );
        sampledIdx++;
      }
    }

    return sampled;
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
   * K-means clustering implementation with early termination
   */
  async _kMeansClustering(data, k, maxIterations = 30) {
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
    let prevChangedCount = n;
    const earlyStopThreshold = Math.max(1, Math.floor(n * 0.001)); // 0.1% change threshold

    while (changed && iteration < maxIterations) {
      iteration++;
      let changedCount = 0;

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
          changedCount++;
        }
      }

      // Early termination: stop if very few points changed
      if (changedCount < earlyStopThreshold) {
        console.log(`K-means early stop: only ${changedCount} points changed`);
        changed = false;
        break;
      }

      // Check if we're making progress (diminishing returns)
      if (changedCount >= prevChangedCount * 0.95 && iteration > 5) {
        console.log(`K-means early stop: minimal progress (${changedCount} changes)`);
        changed = false;
        break;
      }

      prevChangedCount = changedCount;

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
      if (iteration % 3 === 0) {
        this.onProgress({
          stage: 'clustering',
          progress: Math.min(95, (iteration / maxIterations) * 100)
        });
        await this._sleep(0); // Allow UI updates
      }
    }

    console.log(`K-means converged in ${iteration} iterations`);

    return { centers, assignments };
  }

  /**
   * K-means clustering for binary descriptors using Hamming distance
   * Uses median voting for cluster center updates (optimal for binary data)
   * @param {Uint8Array} descriptorsFlat - Flat array of binary descriptors
   * @param {number} descriptorSize - Bytes per descriptor
   * @param {number} k - Number of clusters
   * @param {number} maxIterations - Maximum iterations
   */
  async _kMeansClusteringBinary(descriptorsFlat, descriptorSize, k, maxIterations = 30) {
    const n = descriptorsFlat.length / descriptorSize;

    console.log(`Running binary k-means with Hamming distance:`);
    console.log(`  Descriptors: ${n}`);
    console.log(`  Clusters: ${k}`);
    console.log(`  Descriptor size: ${descriptorSize} bytes`);

    // Initialize centers randomly by selecting k random descriptors
    const centerIndices = new Set();
    while (centerIndices.size < k) {
      centerIndices.add(Math.floor(Math.random() * n));
    }

    let centers = Array.from(centerIndices).map(i => {
      const offset = i * descriptorSize;
      return new Uint8Array(descriptorsFlat.slice(offset, offset + descriptorSize));
    });

    let assignments = new Array(n).fill(0);
    let changed = true;
    let iteration = 0;
    let prevChangedCount = n;
    const earlyStopThreshold = Math.max(1, Math.floor(n * 0.001)); // 0.1% change threshold

    while (changed && iteration < maxIterations) {
      iteration++;
      let changedCount = 0;

      // Assignment step: assign each descriptor to nearest center using Hamming distance
      for (let i = 0; i < n; i++) {
        const descOffset = i * descriptorSize;
        const descriptor = descriptorsFlat.slice(descOffset, descOffset + descriptorSize);

        let minDist = Infinity;
        let bestCluster = 0;

        for (let j = 0; j < k; j++) {
          const dist = this._hammingDistance(descriptor, centers[j]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = j;
          }
        }

        if (assignments[i] !== bestCluster) {
          assignments[i] = bestCluster;
          changedCount++;
        }
      }

      // Early termination: stop if very few points changed
      if (changedCount < earlyStopThreshold) {
        console.log(`  Binary k-means early stop: only ${changedCount} points changed`);
        changed = false;
        break;
      }

      // Check if we're making progress (diminishing returns)
      if (changedCount >= prevChangedCount * 0.95 && iteration > 5) {
        console.log(`  Binary k-means early stop: minimal progress (${changedCount} changes)`);
        changed = false;
        break;
      }

      prevChangedCount = changedCount;

      // Update step: recalculate centers using median voting (optimal for binary)
      for (let j = 0; j < k; j++) {
        // Collect all descriptors in this cluster
        const clusterDescriptors = [];
        for (let i = 0; i < n; i++) {
          if (assignments[i] === j) {
            const descOffset = i * descriptorSize;
            clusterDescriptors.push(
              descriptorsFlat.slice(descOffset, descOffset + descriptorSize)
            );
          }
        }

        // Skip empty clusters
        if (clusterDescriptors.length === 0) {
          continue;
        }

        // Compute new center using median voting (bit-wise majority)
        centers[j] = this._medianVotingCenter(clusterDescriptors, descriptorSize);
      }

      // Progress update
      if (iteration % 3 === 0) {
        this.onProgress({
          stage: 'clustering',
          progress: Math.min(95, (iteration / maxIterations) * 100)
        });
        await this._sleep(0); // Allow UI updates
      }
    }

    console.log(`  Binary k-means converged in ${iteration} iterations`);

    // Compute cluster quality metrics
    const metrics = this._computeClusterQuality(descriptorsFlat, descriptorSize, centers, assignments);
    console.log(`  Cluster quality metrics:`);
    console.log(`    Intra-cluster distance (avg): ${metrics.intraCluster.toFixed(2)}`);
    console.log(`    Inter-cluster distance (avg): ${metrics.interCluster.toFixed(2)}`);
    console.log(`    Separation ratio: ${metrics.separationRatio.toFixed(2)} (higher is better)`);

    return { centers, assignments, metrics };
  }

  /**
   * Compute cluster center using median voting (bit-wise majority)
   * For each bit position, set to 1 if majority of descriptors have it set
   * This is optimal for binary descriptors
   * @param {Array<Uint8Array>} descriptors - Array of binary descriptors
   * @param {number} descriptorSize - Bytes per descriptor
   * @returns {Uint8Array} - New center descriptor
   */
  _medianVotingCenter(descriptors, descriptorSize) {
    const n = descriptors.length;
    const newCenter = new Uint8Array(descriptorSize);

    // For each byte position
    for (let byteIdx = 0; byteIdx < descriptorSize; byteIdx++) {
      let byte = 0;

      // For each bit in the byte
      for (let bit = 0; bit < 8; bit++) {
        let onesCount = 0;

        // Count how many descriptors have this bit set
        for (const desc of descriptors) {
          if (desc[byteIdx] & (1 << (7 - bit))) {
            onesCount++;
          }
        }

        // Set bit if majority have it
        if (onesCount > n / 2) {
          byte |= (1 << (7 - bit));
        }
      }

      newCenter[byteIdx] = byte;
    }

    return newCenter;
  }

  /**
   * Compute cluster quality metrics
   * @param {Uint8Array} descriptorsFlat - All descriptors
   * @param {number} descriptorSize - Bytes per descriptor
   * @param {Array<Uint8Array>} centers - Cluster centers
   * @param {Array<number>} assignments - Cluster assignments
   * @returns {Object} Quality metrics
   */
  _computeClusterQuality(descriptorsFlat, descriptorSize, centers, assignments) {
    const n = descriptorsFlat.length / descriptorSize;
    const k = centers.length;

    // Compute intra-cluster distance (avg distance within clusters)
    let intraClusterSum = 0;
    let intraClusterCount = 0;

    for (let i = 0; i < n; i++) {
      const descOffset = i * descriptorSize;
      const descriptor = descriptorsFlat.slice(descOffset, descOffset + descriptorSize);
      const cluster = assignments[i];
      const dist = this._hammingDistance(descriptor, centers[cluster]);
      intraClusterSum += dist;
      intraClusterCount++;
    }

    const intraCluster = intraClusterSum / intraClusterCount;

    // Compute inter-cluster distance (avg distance between cluster centers)
    let interClusterSum = 0;
    let interClusterCount = 0;

    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const dist = this._hammingDistance(centers[i], centers[j]);
        interClusterSum += dist;
        interClusterCount++;
      }
    }

    const interCluster = interClusterCount > 0 ? interClusterSum / interClusterCount : 0;

    // Separation ratio: higher is better (clusters far apart, tight internally)
    const separationRatio = intraCluster > 0 ? interCluster / intraCluster : 0;

    return {
      intraCluster,
      interCluster,
      separationRatio
    };
  }

  /**
   * Euclidean distance between two vectors
   * DEPRECATED: Use _hammingDistance for binary descriptors
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
   * Quantize a descriptor to the nearest vocabulary word using hierarchical tree
   * This provides 10-100x speedup over flat quantization for large vocabularies
   * Complexity: O(k * L) instead of O(V) where V = vocabulary size
   * @param {Uint8Array} descriptor - Binary descriptor
   * @returns {number} Word ID (index in flat vocabulary)
   */
  quantizeDescriptor(descriptor) {
    // If tree is available, use hierarchical quantization (FAST)
    if (this.vocabularyTree) {
      return this._quantizeDescriptorHierarchical(descriptor, this.vocabularyTree, 0);
    }

    // Fallback to flat quantization (SLOW) for backward compatibility
    return this._quantizeDescriptorFlat(descriptor);
  }

  /**
   * Hierarchical quantization - traverse tree from root to leaf
   * @param {Uint8Array} descriptor - Binary descriptor
   * @param {Object} node - Current tree node
   * @param {number} wordOffset - Offset for word ID calculation
   * @returns {number} Word ID
   */
  _quantizeDescriptorHierarchical(descriptor, node, wordOffset) {
    // If leaf node, find best matching word among leaf centers
    if (node.isLeaf) {
      let minDist = Infinity;
      let bestLocalIdx = 0;

      for (let i = 0; i < node.centers.length; i++) {
        const dist = this._hammingDistance(descriptor, node.centers[i]);
        if (dist < minDist) {
          minDist = dist;
          bestLocalIdx = i;
        }
      }

      return wordOffset + bestLocalIdx;
    }

    // Internal node: find best matching child center
    let minDist = Infinity;
    let bestChildIdx = 0;

    for (let i = 0; i < node.centers.length; i++) {
      const dist = this._hammingDistance(descriptor, node.centers[i]);
      if (dist < minDist) {
        minDist = dist;
        bestChildIdx = i;
      }
    }

    // Calculate word offset for the chosen subtree
    // Each child subtree contains k^(levels-currentLevel-1) words
    let subtreeSize = 0;
    if (node.children && node.children.length > 0) {
      // Count words in previous siblings
      for (let i = 0; i < bestChildIdx && i < node.children.length; i++) {
        subtreeSize += this._countWords(node.children[i]);
      }
    }

    // Recurse into best matching child
    if (node.children && node.children[bestChildIdx]) {
      return this._quantizeDescriptorHierarchical(
        descriptor,
        node.children[bestChildIdx],
        wordOffset + subtreeSize
      );
    }

    // Shouldn't reach here, but return offset as fallback
    return wordOffset;
  }

  /**
   * Count total vocabulary words in a subtree
   * @param {Object} node - Tree node
   * @returns {number} Number of words
   */
  _countWords(node) {
    if (node.isLeaf) {
      return node.centers.length;
    }

    let count = 0;
    if (node.children) {
      for (const child of node.children) {
        count += this._countWords(child);
      }
    }
    return count;
  }

  /**
   * Flat quantization (fallback) - checks all vocabulary words
   * SLOW: O(V) complexity, only used if tree not available
   * @param {Uint8Array} descriptor - Binary descriptor
   * @returns {number} Word ID
   */
  _quantizeDescriptorFlat(descriptor) {
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
   * Convert BoW to BM25 vector
   * BM25 provides better term saturation than TF-IDF
   * @param {Object} bow - Bag-of-words vector
   * @param {number} numFeatures - Number of features in document
   * @param {number} avgDocLength - Average document length across all targets
   * @returns {Object} BM25 weighted vector
   */
  computeBM25Vector(bow, numFeatures, avgDocLength) {
    const bm25 = {};

    // BM25 parameters (standard values from literature)
    const k1 = 1.2; // Term saturation parameter (1.2-2.0)
    const b = 0.75; // Length normalization (0.75 is standard)

    for (const wordIdStr in bow) {
      const wordId = parseInt(wordIdStr);
      const count = bow[wordIdStr];

      // IDF from pre-computed weights
      const idf = this.idfWeights[wordId] || 1.0;

      // BM25 term frequency with saturation
      const tf_normalized = (count * (k1 + 1)) /
        (count + k1 * (1 - b + b * (numFeatures / avgDocLength)));

      // BM25 score
      bm25[wordId] = tf_normalized * idf;
    }

    return bm25;
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
          console.log('[VocabularyBuilder] Found cached vocabulary, checking version...');
          const importSuccess = this.importDatabase(cachedData);

          if (importSuccess) {
            console.log('[VocabularyBuilder] Loaded from cache successfully');
            this.onProgress({
              stage: 'cache',
              progress: 100,
              message: 'Loaded from cache',
              cached: true
            });
            return this.targets;
          } else {
            console.log('[VocabularyBuilder] Version mismatch - clearing cache and rebuilding');
            // Clear incompatible cache
            await this.cacheManager.deleteVocabulary(this.albumCode);
          }
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

    // Step 2: Adaptive vocabulary sizing (if enabled)
    if (this.adaptiveVocabulary) {
      const avgFeatures = targetFeatures.reduce((sum, t) => sum + t.numFeatures, 0) / targetFeatures.length;
      const params = this._calculateOptimalVocabularyParams(targetFeatures.length, avgFeatures);

      // Update vocabulary parameters
      this.k = params.branchingFactor;
      this.levels = params.levels;
      this.vocabularySize = params.vocabularySize;
    }

    // Step 3: Build vocabulary
    await this.buildVocabulary(allDescriptors, descriptorSize);

    // Step 4: Convert to BoW
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

    // Step 5: Choose weighting scheme (TF-IDF or BM25)
    const weightingScheme = AppConfig.vocabulary?.weightingScheme || 'bm25';
    console.log(`Computing ${weightingScheme.toUpperCase()} vectors...`);

    // Calculate average document length for BM25
    const avgDocLength = targetFeatures.reduce((sum, t) => sum + t.numFeatures, 0) / targetFeatures.length;

    this.onProgress({ stage: 'weighting', progress: 0 });

    for (let i = 0; i < targetFeatures.length; i++) {
      const target = targetFeatures[i];

      if (weightingScheme === 'bm25') {
        // Use BM25 weighting (better discrimination)
        target.bow_tfidf = this.computeBM25Vector(target.bow, target.numFeatures, avgDocLength);
        target.weighting_scheme = 'bm25';
      } else {
        // Use TF-IDF weighting (traditional)
        target.bow_tfidf = this.computeTFIDFVector(target.bow, target.numFeatures);
        target.weighting_scheme = 'tfidf';
      }

      this.onProgress({
        stage: 'weighting',
        progress: ((i + 1) / targetFeatures.length) * 100
      });
    }

    console.log(`  Weighting scheme: ${weightingScheme.toUpperCase()}`);
    console.log(`  Average document length: ${avgDocLength.toFixed(1)} features`);

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
   * Export database in JSON format (includes hierarchical tree)
   */
  exportDatabase() {
    const database = {
      metadata: {
        num_targets: this.targets.length,
        vocabulary_size: this.vocabularySize,
        branching_factor: this.k,
        levels: this.levels,
        descriptor_type: 'SIFT',
        descriptor_bytes: this.targets[0]?.descriptorSize || 128,
        has_hierarchical_tree: this.vocabularyTree !== null,
        // Database versioning
        database_version: AppConfig.database.version,
        config_signature: AppConfig.database.getConfigSignature(),
        created_at: new Date().toISOString()
      },
      vocabulary: {
        words: this.vocabulary.map(word => Array.from(word)),
        idf_weights: this.idfWeights,
        tree: this.vocabularyTree ? this._serializeTree(this.vocabularyTree) : null
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
   * Serialize tree structure for export
   * @param {Object} node - Tree node
   * @returns {Object} Serialized node
   */
  _serializeTree(node) {
    return {
      level: node.level,
      isLeaf: node.isLeaf,
      centers: node.centers.map(c => Array.from(c)),
      children: node.children ? node.children.map(c => this._serializeTree(c)) : null
    };
  }

  /**
   * Import database from cached data
   * Restores vocabulary tree and targets
   * @returns {boolean} True if import successful, false if version mismatch
   */
  importDatabase(database) {
    console.log('[VocabularyBuilder] Importing cached database');

    // Validate database version
    const currentVersion = AppConfig.database.version;
    const currentSignature = AppConfig.database.getConfigSignature();
    const dbVersion = database.metadata.database_version;
    const dbSignature = database.metadata.config_signature;

    if (!dbVersion || !dbSignature) {
      console.warn('[VocabularyBuilder] Legacy database without version info - will rebuild');
      return false;
    }

    // Check schema version compatibility
    if (dbVersion !== currentVersion) {
      console.warn(`[VocabularyBuilder] Database version mismatch:`);
      console.warn(`  Current: ${currentVersion}`);
      console.warn(`  Cached:  ${dbVersion}`);
      console.warn(`  Action:  Rebuilding vocabulary tree`);
      return false;
    }

    // Check configuration signature
    if (dbSignature !== currentSignature) {
      console.warn(`[VocabularyBuilder] Configuration changed - vocabulary rebuild required`);
      console.warn(`  Current signature: ${currentSignature}`);
      console.warn(`  Cached signature:  ${dbSignature}`);
      console.warn(`  This means ORB/TEBLID parameters or vocabulary settings changed`);
      return false;
    }

    console.log(`[VocabularyBuilder] Version check passed (v${dbVersion})`);

    // Restore metadata
    this.k = database.metadata.branching_factor;
    this.levels = database.metadata.levels;
    this.vocabularySize = database.metadata.vocabulary_size;

    // Restore vocabulary (convert arrays back to Uint8Arrays)
    this.vocabulary = database.vocabulary.words.map(word =>
      new Uint8Array(word)
    );
    this.idfWeights = database.vocabulary.idf_weights;

    // Restore hierarchical tree if available
    if (database.vocabulary.tree) {
      this.vocabularyTree = this._deserializeTree(database.vocabulary.tree);
      console.log('[VocabularyBuilder] Hierarchical tree restored');
    } else {
      this.vocabularyTree = null;
      console.log('[VocabularyBuilder] No hierarchical tree, using flat vocabulary');
    }

    // Restore targets
    this.targets = database.targets.map(target => {
      const descriptorSize = database.metadata.descriptor_bytes;

      // Convert descriptors back to flat array (Float32Array for SIFT, Uint8Array for binary)
      const isSIFT = database.metadata.descriptor_type === 'SIFT';
      const descriptorsFlat = isSIFT
        ? new Float32Array(target.descriptors.length * descriptorSize)
        : new Uint8Array(target.descriptors.length * descriptorSize);

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
    return true;
  }

  /**
   * Deserialize tree structure from import
   * @param {Object} serialized - Serialized node
   * @returns {Object} Tree node
   */
  _deserializeTree(serialized) {
    return {
      level: serialized.level,
      isLeaf: serialized.isLeaf,
      centers: serialized.centers.map(c => new Uint8Array(c)),
      children: serialized.children ? serialized.children.map(c => this._deserializeTree(c)) : null
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.VocabularyBuilder = VocabularyBuilder;
}
