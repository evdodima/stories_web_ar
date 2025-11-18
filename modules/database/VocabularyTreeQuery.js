/**
 * Vocabulary tree query for fast candidate selection
 * Uses Bag-of-Words (BoW) and TF-IDF scoring to select likely targets
 */
class VocabularyTreeQuery {
  constructor(vocabulary, idf, vocabularyTree = null) {
    this.vocabulary = vocabulary; // Array of visual word descriptors
    this.idf = idf; // Inverse document frequency weights
    this.vocabularySize = vocabulary.length;
    this.vocabularyTree = vocabularyTree; // Optional hierarchical tree for fast lookup

    // Convert vocabulary to OpenCV Mat for fast matching (fallback if no tree)
    this.vocabularyMat = this.createVocabularyMat(vocabulary);

    // Create BFMatcher for finding nearest visual words (Hamming distance for TEBLID)
    // Only used if no hierarchical tree is available
    this.matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);

    console.log(`[VocabularyTreeQuery] Initialized with ${this.vocabularySize} words`);
    console.log(`[VocabularyTreeQuery] Hierarchical tree: ${vocabularyTree ? 'ENABLED (fast)' : 'DISABLED (slow)'}`);
  }

  /**
   * Convert vocabulary array to OpenCV Mat
   * @param {Array<Array<number>>} vocabulary - Vocabulary words as arrays
   * @returns {cv.Mat} Vocabulary as Mat
   */
  createVocabularyMat(vocabulary) {
    const numWords = vocabulary.length;
    const descriptorSize = vocabulary[0].length;

    const flatData = new Uint8Array(numWords * descriptorSize);
    for (let i = 0; i < numWords; i++) {
      for (let j = 0; j < descriptorSize; j++) {
        flatData[i * descriptorSize + j] = vocabulary[i][j];
      }
    }

    const mat = new cv.Mat(numWords, descriptorSize, cv.CV_8U);
    mat.data.set(flatData);
    return mat;
  }

  /**
   * Convert frame descriptors to Bag-of-Words vector
   * Uses hierarchical tree if available (10-100x faster), otherwise falls back to BFMatcher
   * @param {cv.Mat} descriptors - Frame descriptors
   * @returns {Object} BoW vector as {wordId: count}
   */
  computeBoW(descriptors) {
    if (!descriptors || descriptors.empty() || descriptors.rows === 0) {
      return {};
    }

    // Use hierarchical quantization if tree is available (FAST)
    if (this.vocabularyTree) {
      return this._computeBoWHierarchical(descriptors);
    }

    // Fallback to BFMatcher (SLOW) for backward compatibility
    return this._computeBoWFlat(descriptors);
  }

  /**
   * Hierarchical BoW computation using tree traversal (FAST: O(k*L) per descriptor)
   * @param {cv.Mat} descriptors - Frame descriptors
   * @returns {Object} BoW vector as {wordId: count}
   */
  _computeBoWHierarchical(descriptors) {
    const bow = {};
    const descriptorSize = descriptors.cols;

    // Quantize each descriptor using tree traversal
    for (let i = 0; i < descriptors.rows; i++) {
      // Extract descriptor as Uint8Array
      const descriptor = new Uint8Array(descriptorSize);
      for (let j = 0; j < descriptorSize; j++) {
        descriptor[j] = descriptors.ucharAt(i, j);
      }

      // Quantize using hierarchical tree
      const wordId = this._quantizeDescriptorHierarchical(descriptor, this.vocabularyTree, 0);
      bow[wordId] = (bow[wordId] || 0) + 1;
    }

    return bow;
  }

  /**
   * Flat BoW computation using BFMatcher (SLOW: O(V) per descriptor)
   * Only used when hierarchical tree is not available
   * @param {cv.Mat} descriptors - Frame descriptors
   * @returns {Object} BoW vector as {wordId: count}
   */
  _computeBoWFlat(descriptors) {
    const bow = {};

    // Use BFMatcher to find nearest vocabulary word for each descriptor
    const matches = new cv.DMatchVectorVector();
    this.matcher.knnMatch(descriptors, this.vocabularyMat, matches, 1);

    // Build BoW histogram from matches
    for (let i = 0; i < matches.size(); i++) {
      const match = matches.get(i);
      if (match.size() > 0) {
        const bestMatch = match.get(0);
        const wordId = bestMatch.trainIdx; // Index in vocabulary

        bow[wordId] = (bow[wordId] || 0) + 1;
      }
    }

    matches.delete();
    return bow;
  }

  /**
   * Hierarchical quantization - traverse tree from root to leaf
   * Same implementation as in VocabularyBuilder for consistency
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
   * Hamming distance between two binary descriptors
   * @param {Uint8Array} a - First descriptor
   * @param {Uint8Array} b - Second descriptor
   * @returns {number} Hamming distance
   */
  _hammingDistance(a, b) {
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
      const xor = a[i] ^ b[i];
      // Count set bits (popcount)
      let count = xor;
      count = count - ((count >> 1) & 0x55);
      count = (count & 0x33) + ((count >> 2) & 0x33);
      count = (count + (count >> 4)) & 0x0f;
      dist += count;
    }
    return dist;
  }

  /**
   * Compute TF-IDF vector from BoW
   * @param {Object} bow - Bag-of-words vector
   * @returns {Object} TF-IDF weighted vector
   */
  computeTfIdf(bow) {
    const tfidf = {};
    const totalWords = Object.values(bow).reduce((sum, count) => sum + count, 0);

    for (const [wordId, count] of Object.entries(bow)) {
      const tf = count / totalWords;
      const idfWeight = this.idf[wordId] || 1.0;
      tfidf[wordId] = tf * idfWeight;
    }

    return tfidf;
  }

  /**
   * Compute BM25 vector from BoW
   * BM25 provides better term saturation than TF-IDF
   * @param {Object} bow - Bag-of-words vector
   * @param {number} avgDocLength - Average document length across all targets
   * @returns {Object} BM25 weighted vector
   */
  computeBM25(bow, avgDocLength) {
    const bm25 = {};
    const totalWords = Object.values(bow).reduce((sum, count) => sum + count, 0);

    // BM25 parameters (standard values)
    const k1 = 1.2; // Term saturation parameter
    const b = 0.75; // Length normalization

    for (const [wordId, count] of Object.entries(bow)) {
      const idfWeight = this.idf[wordId] || 1.0;

      // BM25 term frequency with saturation
      const tf_normalized = (count * (k1 + 1)) /
        (count + k1 * (1 - b + b * (totalWords / avgDocLength)));

      bm25[wordId] = tf_normalized * idfWeight;
    }

    return bm25;
  }

  /**
   * Compute cosine similarity between two TF-IDF vectors
   * @param {Object} vec1 - First TF-IDF vector
   * @param {Object} vec2 - Second TF-IDF vector
   * @returns {number} Cosine similarity [0, 1]
   */
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    // Get all unique word IDs
    const allWords = new Set([
      ...Object.keys(vec1).map(Number),
      ...Object.keys(vec2).map(Number)
    ]);

    for (const wordId of allWords) {
      const v1 = vec1[wordId] || 0;
      const v2 = vec2[wordId] || 0;

      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Query targets and return top N candidates
   * @param {cv.Mat} frameDescriptors - Current frame descriptors
   * @param {Array} targets - All available targets
   * @param {number} maxCandidates - Maximum candidates to return
   * @returns {Array} Sorted array of {target, score}
   */
  queryCandidates(frameDescriptors, targets, maxCandidates = 2) {
    // Compute BoW for current frame
    const frameBow = this.computeBoW(frameDescriptors);

    // Determine weighting scheme from first target or use BM25 as default
    const firstTarget = targets[0];
    const weightingScheme = firstTarget?.weighting_scheme || 'bm25';

    // Compute frame vector using appropriate weighting scheme
    let frameVector;
    if (weightingScheme === 'bm25') {
      // Calculate average document length from targets
      const avgDocLength = targets.reduce(
        (sum, t) => sum + (t.numFeatures || t.num_features || 500),
        0
      ) / targets.length;

      frameVector = this.computeBM25(frameBow, avgDocLength);
      console.log('[VocabularyTreeQuery] Frame BoW:', Object.keys(frameBow).length, 'words');
      console.log('[VocabularyTreeQuery] Frame BM25:', Object.keys(frameVector).length, 'words');
    } else {
      frameVector = this.computeTfIdf(frameBow);
      console.log('[VocabularyTreeQuery] Frame BoW:', Object.keys(frameBow).length, 'words');
      console.log('[VocabularyTreeQuery] Frame TF-IDF:', Object.keys(frameVector).length, 'words');
    }

    // Score all targets
    const scores = targets.map(target => {
      // Handle both naming conventions
      const targetVector = target.bow_tfidf || target.bowTfidf || {};
      const similarity = this.cosineSimilarity(frameVector, targetVector);

      return {
        target,
        score: similarity
      };
    });

    // Sort by score descending and take top N
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, maxCandidates);
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.vocabularyMat) {
      this.vocabularyMat.delete();
    }
    if (this.matcher) {
      this.matcher.delete();
    }
  }
}

if (typeof window !== 'undefined') {
  window.VocabularyTreeQuery = VocabularyTreeQuery;
}
