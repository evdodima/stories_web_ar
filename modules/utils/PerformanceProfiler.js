/**
 * Performance profiling utility for tracking algorithm bottlenecks
 */
class PerformanceProfiler {
  constructor() {
    this.metrics = new Map();
    this.currentTimers = new Map();
    this.enabled = true;
  }

  /**
   * Start timing a specific operation
   * @param {string} label - Label for the operation
   */
  startTimer(label) {
    if (!this.enabled) return;
    this.currentTimers.set(label, performance.now());
  }

  /**
   * End timing and record the duration
   * @param {string} label - Label for the operation
   */
  endTimer(label) {
    if (!this.enabled) return;

    const startTime = this.currentTimers.get(label);
    if (startTime === undefined) {
      console.warn(`No timer started for: ${label}`);
      return;
    }

    const duration = performance.now() - startTime;
    this.currentTimers.delete(label);

    if (!this.metrics.has(label)) {
      this.metrics.set(label, {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity,
        avg: 0,
        recent: []
      });
    }

    const metric = this.metrics.get(label);
    metric.count++;
    metric.total += duration;
    metric.min = Math.min(metric.min, duration);
    metric.max = Math.max(metric.max, duration);
    metric.avg = metric.total / metric.count;

    // Keep last 30 samples for trend analysis
    metric.recent.push(duration);
    if (metric.recent.length > 30) {
      metric.recent.shift();
    }
  }

  /**
   * Get all recorded metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    const result = {};
    for (const [label, data] of this.metrics.entries()) {
      result[label] = {
        count: data.count,
        avg: Math.round(data.avg * 100) / 100,
        min: Math.round(data.min * 100) / 100,
        max: Math.round(data.max * 100) / 100,
        total: Math.round(data.total * 100) / 100,
        recentAvg: data.recent.length > 0
          ? Math.round((data.recent.reduce((a, b) => a + b, 0) /
            data.recent.length) * 100) / 100
          : 0
      };
    }
    return result;
  }

  /**
   * Get a summary report of all metrics sorted by average time
   * @returns {string} Formatted report
   */
  getReport() {
    const metrics = this.getMetrics();
    const sorted = Object.entries(metrics)
      .sort((a, b) => b[1].avg - a[1].avg);

    let report = '\n=== Performance Profile ===\n';
    for (const [label, data] of sorted) {
      report += `\n${label}:\n`;
      report += `  Avg: ${data.avg.toFixed(2)}ms `;
      report += `(Recent: ${data.recentAvg.toFixed(2)}ms)\n`;
      report += `  Min: ${data.min.toFixed(2)}ms | `;
      report += `Max: ${data.max.toFixed(2)}ms\n`;
      report += `  Count: ${data.count} | `;
      report += `Total: ${data.total.toFixed(2)}ms\n`;
    }
    report += '\n';
    return report;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.currentTimers.clear();
  }

  /**
   * Enable/disable profiling
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.PerformanceProfiler = PerformanceProfiler;
}
