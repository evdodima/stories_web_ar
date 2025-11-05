/**
 * ProgressManager
 * Aggregates multi-stage progress into a single 0-100% without resets.
 */

class ProgressManager {
  constructor(weights = {}) {
    // Default stage weights (sum to ~100)
    this.stageWeights = Object.assign({
      api: 5,
      download: 45,
      zip: 5, // reading/extracting archive
      images: 15,
      videos: 5,
      extracting: 10, // feature extraction
      clustering: 5,
      bow: 3,
      idf: 3,
      tfidf: 4
    }, weights);

    this.stageProgress = {}; // stage -> 0..1
    for (const key of Object.keys(this.stageWeights)) {
      this.stageProgress[key] = 0;
    }
  }

  /**
   * Update progress for a stage.
   * @param {string} stage
   * @param {number|{loaded:number,total:number}} progress - percent 0..100 or bytes object
   * @returns {{totalPercent:number}}
   */
  report(stage, progress) {
    if (!(stage in this.stageWeights)) return { totalPercent: this.getTotalPercent() };

    let fraction = 0;
    if (typeof progress === 'number' && isFinite(progress)) {
      fraction = Math.max(0, Math.min(1, progress / 100));
    } else if (progress && typeof progress.loaded === 'number' && typeof progress.total === 'number' && progress.total > 0) {
      fraction = Math.max(0, Math.min(1, progress.loaded / progress.total));
    }

    // Never decrease a stage once advanced (prevents flicker)
    this.stageProgress[stage] = Math.max(this.stageProgress[stage] || 0, fraction);
    return { totalPercent: this.getTotalPercent() };
  }

  /**
   * Compute total percent across all stages using weights.
   */
  getTotalPercent() {
    let weighted = 0;
    let totalWeight = 0;
    for (const [stage, weight] of Object.entries(this.stageWeights)) {
      totalWeight += weight;
      const p = this.stageProgress[stage] || 0;
      weighted += p * weight;
    }
    if (totalWeight === 0) return 0;
    return Math.max(0, Math.min(100, Math.round((weighted / totalWeight) * 100)));
  }
}

if (typeof window !== 'undefined') {
  window.ProgressManager = ProgressManager;
}


