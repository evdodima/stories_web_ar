/**
 * Vocabulary tree query for fast candidate selection
 * Uses Bag-of-Words (BoW) and TF-IDF scoring to select likely targets
 */
class VocabularyTreeQuery {
  constructor(vocabulary, idf) {
    this.vocabulary = vocabulary; // Array of visual word descriptors
    this.idf = idf; // Inverse document frequency weights
    this.vocabularySize = vocabulary.length;

    // Convert vocabulary to OpenCV Mat for fast matching
    this.vocabularyMat = this.createVocabularyMat(vocabulary);

    // Create BFMatcher for finding nearest visual words (Hamming distance for BRISK)
    this.matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
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
   * @param {cv.Mat} descriptors - Frame descriptors
   * @returns {Object} BoW vector as {wordId: count}
   */
  computeBoW(descriptors) {
    if (!descriptors || descriptors.empty() || descriptors.rows === 0) {
      return {};
    }

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
  queryCandidates(frameDescriptors, targets, maxCandidates = 5) {
    // Compute BoW for current frame
    const frameBow = this.computeBoW(frameDescriptors);
    const frameTfIdf = this.computeTfIdf(frameBow);

    console.log('[VocabularyTreeQuery] Frame BoW:', Object.keys(frameBow).length, 'words');
    console.log('[VocabularyTreeQuery] Frame TF-IDF:', Object.keys(frameTfIdf).length, 'words');

    // Score all targets
    const scores = targets.map(target => {
      // Handle both naming conventions
      const targetTfIdf = target.bow_tfidf || target.bowTfidf || {};
      const similarity = this.cosineSimilarity(frameTfIdf, targetTfIdf);

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
