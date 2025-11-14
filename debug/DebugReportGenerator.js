/**
 * Debug Report Generator
 * Generates comprehensive HTML reports from experiment results
 */

import { DebugVisualizer } from './DebugVisualizer.js';

export class DebugReportGenerator {
  constructor(results) {
    this.results = results;
  }

  /**
   * Generate complete HTML report
   * @returns {string} HTML content
   */
  generateHTML() {
    const sortedResults = this._getSortedResults();
    const topResults = sortedResults.slice(0, 5);
    const successfulResults = this.results.filter(r => r.success);
    const categoryStats = this._getCategoryStatistics();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Detection Debug Report</title>
  <style>
    ${this._getCSS()}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Detection Debug Report</h1>
      <p class="subtitle">Generated: ${new Date().toLocaleString()}</p>
    </header>

    ${this._generateSummarySection(successfulResults)}
    ${this._generateTopResultsSection(topResults)}
    ${this._generateCategoryAnalysis(categoryStats)}
    ${this._generateRecommendations(sortedResults)}
    ${this._generateFullResultsTable(sortedResults)}
    ${this._generateDetailedResults(sortedResults)}
  </div>

  <script>
    ${this._getJavaScript()}
  </script>
</body>
</html>
    `;
  }

  /**
   * Get sorted results by good matches
   */
  _getSortedResults() {
    return [...this.results].sort((a, b) =>
      b.metrics.goodMatches - a.metrics.goodMatches
    );
  }

  /**
   * Get category statistics
   */
  _getCategoryStatistics() {
    const stats = {};

    this.results.forEach(r => {
      const cat = r.config.category;
      if (!stats[cat]) {
        stats[cat] = {
          total: 0,
          successful: 0,
          avgGoodMatches: 0,
          maxGoodMatches: 0,
          avgProcessingTime: 0,
          results: []
        };
      }

      stats[cat].total++;
      if (r.success) stats[cat].successful++;
      stats[cat].results.push(r);
      stats[cat].maxGoodMatches = Math.max(stats[cat].maxGoodMatches,
                                           r.metrics.goodMatches || 0);
    });

    // Calculate averages
    Object.keys(stats).forEach(cat => {
      const results = stats[cat].results;
      stats[cat].avgGoodMatches = results.reduce((sum, r) =>
        sum + (r.metrics.goodMatches || 0), 0) / results.length;
      stats[cat].avgProcessingTime = results.reduce((sum, r) =>
        sum + (r.metrics.processingTime || 0), 0) / results.length;
    });

    return stats;
  }

  /**
   * Generate summary section
   */
  _generateSummarySection(successfulResults) {
    const totalExperiments = this.results.length;
    const successCount = successfulResults.length;
    const successRate = ((successCount / totalExperiments) * 100).toFixed(1);
    const avgGoodMatches = this.results.reduce((sum, r) =>
      sum + (r.metrics.goodMatches || 0), 0) / totalExperiments;
    const maxGoodMatches = Math.max(...this.results.map(r =>
      r.metrics.goodMatches || 0));

    return `
    <section class="summary">
      <h2>Executive Summary</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalExperiments}</div>
          <div class="stat-label">Total Experiments</div>
        </div>
        <div class="stat-card ${successCount > 0 ? 'success' : 'failure'}">
          <div class="stat-value">${successCount}</div>
          <div class="stat-label">Successful Detections</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${successRate}%</div>
          <div class="stat-label">Success Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${avgGoodMatches.toFixed(1)}</div>
          <div class="stat-label">Avg Good Matches</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${maxGoodMatches}</div>
          <div class="stat-label">Max Good Matches</div>
        </div>
      </div>
    </section>
    `;
  }

  /**
   * Generate top results section
   */
  _generateTopResultsSection(topResults) {
    return `
    <section class="top-results">
      <h2>Top 5 Configurations</h2>
      <p class="section-desc">Ranked by number of good matches</p>
      ${topResults.map((r, i) => this._generateTopResultCard(r, i + 1)).join('')}
    </section>
    `;
  }

  /**
   * Generate a single top result card
   */
  _generateTopResultCard(result, rank) {
    // Check if visualization exists
    let imgData = null;
    if (result.visualizations && result.visualizations.composite) {
      try {
        imgData = DebugVisualizer.canvasToDataURL(
          result.visualizations.composite, 'image/jpeg'
        );
      } catch (error) {
        console.warn(`Failed to convert canvas to data URL for ${result.config.id}:`, error);
      }
    }

    return `
    <div class="top-result-card">
      <div class="rank-badge">#${rank}</div>
      <div class="result-header">
        <h3>${result.config.id}</h3>
        <span class="category-badge ${result.config.category}">
          ${result.config.category}
        </span>
        ${result.success ? '<span class="success-badge">✓ Detected</span>' :
                           '<span class="failure-badge">✗ Not Detected</span>'}
      </div>
      <p class="result-desc">${result.config.description}</p>

      <div class="metrics-row">
        <div class="metric">
          <span class="metric-label">Target KPs:</span>
          <span class="metric-value">${result.metrics.targetKeypoints}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Frame KPs:</span>
          <span class="metric-value">${result.metrics.frameKeypoints}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Raw Matches:</span>
          <span class="metric-value">${result.metrics.rawMatches}</span>
        </div>
        <div class="metric highlight">
          <span class="metric-label">Good Matches:</span>
          <span class="metric-value">${result.metrics.goodMatches}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Time:</span>
          <span class="metric-value">
            ${result.metrics.processingTime.toFixed(2)}ms
          </span>
        </div>
      </div>

      <div class="config-details">
        <details>
          <summary>Configuration Details</summary>
          <pre>${JSON.stringify(result.config, null, 2)}</pre>
        </details>
      </div>

      ${imgData ? `
      <div class="visualization">
        <img src="${imgData}" alt="Visualization for ${result.config.id}">
      </div>
      ` : `
      <div class="visualization">
        <p class="no-visualization">No visualization available (experiment may have failed)</p>
      </div>
      `}
    </div>
    `;
  }

  /**
   * Generate category analysis
   */
  _generateCategoryAnalysis(categoryStats) {
    const categories = Object.keys(categoryStats).sort((a, b) =>
      categoryStats[b].maxGoodMatches - categoryStats[a].maxGoodMatches
    );

    return `
    <section class="category-analysis">
      <h2>Analysis by Category</h2>
      <div class="category-grid">
        ${categories.map(cat => this._generateCategoryCard(cat,
                                                           categoryStats[cat]))
          .join('')}
      </div>
    </section>
    `;
  }

  /**
   * Generate category card
   */
  _generateCategoryCard(category, stats) {
    const successRate = ((stats.successful / stats.total) * 100).toFixed(1);
    const bestResult = stats.results.reduce((best, r) =>
      (r.metrics.goodMatches || 0) > (best.metrics.goodMatches || 0) ? r : best
    );

    return `
    <div class="category-card">
      <h3 class="category-title ${category}">${category}</h3>
      <div class="category-stats">
        <div class="category-stat">
          <span class="label">Tests:</span>
          <span class="value">${stats.total}</span>
        </div>
        <div class="category-stat">
          <span class="label">Successful:</span>
          <span class="value">${stats.successful} (${successRate}%)</span>
        </div>
        <div class="category-stat">
          <span class="label">Max Matches:</span>
          <span class="value">${stats.maxGoodMatches}</span>
        </div>
        <div class="category-stat">
          <span class="label">Avg Matches:</span>
          <span class="value">${stats.avgGoodMatches.toFixed(1)}</span>
        </div>
        <div class="category-stat">
          <span class="label">Avg Time:</span>
          <span class="value">${stats.avgProcessingTime.toFixed(2)}ms</span>
        </div>
      </div>
      <div class="best-config">
        <strong>Best:</strong> ${bestResult.config.id}
        (${bestResult.metrics.goodMatches} matches)
      </div>
    </div>
    `;
  }

  /**
   * Generate recommendations
   */
  _generateRecommendations(sortedResults) {
    const best = sortedResults[0];
    const baseline = this.results.find(r => r.config.id === 'res_640' ||
                                            r.config.id === 'baseline');

    let recommendations = [];

    // Resolution recommendations
    const resolutionTests = this.results.filter(r =>
      r.config.category === 'resolution');
    if (resolutionTests.length > 0) {
      const bestRes = resolutionTests.reduce((best, r) =>
        (r.metrics.goodMatches || 0) > (best.metrics.goodMatches || 0) ? r : best
      );
      if (bestRes.config.maxDimension > 640) {
        recommendations.push({
          title: 'Increase Frame Resolution',
          description: `Increasing resolution to ${bestRes.config.maxDimension}px ` +
                      `improved matches from ${baseline?.metrics.goodMatches || 0} ` +
                      `to ${bestRes.metrics.goodMatches}`,
          impact: 'HIGH',
          config: bestRes.config
        });
      }
    }

    // BRISK recommendations
    const briskTests = this.results.filter(r =>
      r.config.category === 'brisk');
    if (briskTests.length > 0) {
      const bestBrisk = briskTests.reduce((best, r) =>
        (r.metrics.goodMatches || 0) > (best.metrics.goodMatches || 0) ? r : best
      );
      if (bestBrisk.metrics.goodMatches >
          (baseline?.metrics.goodMatches || 0) * 1.2) {
        recommendations.push({
          title: 'Adjust BRISK Parameters',
          description: `Using threshold=${bestBrisk.config.brisk.threshold}, ` +
                      `octaves=${bestBrisk.config.brisk.octaves} ` +
                      `improved matches to ${bestBrisk.metrics.goodMatches}`,
          impact: 'MEDIUM',
          config: bestBrisk.config
        });
      }
    }

    // Matching recommendations
    const matchingTests = this.results.filter(r =>
      r.config.category === 'matching');
    if (matchingTests.length > 0) {
      const bestMatching = matchingTests.reduce((best, r) =>
        (r.metrics.goodMatches || 0) > (best.metrics.goodMatches || 0) ? r : best
      );
      if (bestMatching.metrics.goodMatches >
          (baseline?.metrics.goodMatches || 0) * 1.15) {
        recommendations.push({
          title: 'Adjust Matching Thresholds',
          description: `Using ratio=${bestMatching.config.matching.ratioThreshold}, ` +
                      `minMatches=${bestMatching.config.matching.minGoodMatches} ` +
                      `improved matches to ${bestMatching.metrics.goodMatches}`,
          impact: 'MEDIUM',
          config: bestMatching.config
        });
      }
    }

    // Multi-scale recommendations
    const multiScaleTests = this.results.filter(r =>
      r.config.category === 'multiscale');
    if (multiScaleTests.length > 0) {
      const bestScale = multiScaleTests.reduce((best, r) =>
        (r.metrics.goodMatches || 0) > (best.metrics.goodMatches || 0) ? r : best
      );
      if (bestScale.metrics.goodMatches > (baseline?.metrics.goodMatches || 0)) {
        recommendations.push({
          title: 'Implement Multi-Scale Detection',
          description: `Testing at scale ${bestScale.config.frameScale || 1.0}x ` +
                      `achieved ${bestScale.metrics.goodMatches} matches. ` +
                      `Consider implementing scale pyramid detection.`,
          impact: 'HIGH',
          config: bestScale.config
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Current Settings Are Optimal',
        description: 'No significant improvements found in tested configurations. ' +
                    'The target may be too distant or image quality may be the ' +
                    'limiting factor.',
        impact: 'INFO',
        config: null
      });
    }

    return `
    <section class="recommendations">
      <h2>Recommendations</h2>
      <p class="section-desc">Based on experiment results, here are the suggested improvements:</p>
      ${recommendations.map(r => this._generateRecommendationCard(r)).join('')}

      <div class="implementation-guide">
        <h3>Implementation Guide</h3>
        <p>To implement the best configuration (${best.config.id}):</p>
        <pre class="code-block">
// In ImageTracker.js, update these constants:
const MAX_DIMENSION = ${best.config.maxDimension || 640};
const MAX_FEATURES = ${best.config.maxFeatures};
const BRISK_THRESHOLD = ${best.config.brisk.threshold};
const BRISK_OCTAVES = ${best.config.brisk.octaves};
const RATIO_THRESHOLD = ${best.config.matching.ratioThreshold};
const MIN_GOOD_MATCHES = ${best.config.matching.minGoodMatches};
const RANSAC_THRESHOLD = ${best.config.matching.ransacThreshold};
        </pre>
      </div>
    </section>
    `;
  }

  /**
   * Generate recommendation card
   */
  _generateRecommendationCard(rec) {
    const impactClass = rec.impact.toLowerCase();
    return `
    <div class="recommendation-card impact-${impactClass}">
      <div class="rec-header">
        <h3>${rec.title}</h3>
        <span class="impact-badge ${impactClass}">${rec.impact}</span>
      </div>
      <p>${rec.description}</p>
      ${rec.config ? `
      <details>
        <summary>View Configuration</summary>
        <pre>${JSON.stringify(rec.config, null, 2)}</pre>
      </details>
      ` : ''}
    </div>
    `;
  }

  /**
   * Generate full results table
   */
  _generateFullResultsTable(sortedResults) {
    return `
    <section class="full-table">
      <h2>Complete Results Table</h2>
      <p class="section-desc">All experiments sorted by good matches (click headers to sort)</p>
      <div class="table-wrapper">
        <table id="results-table">
          <thead>
            <tr>
              <th data-sort="id">ID</th>
              <th data-sort="category">Category</th>
              <th data-sort="success">Success</th>
              <th data-sort="targetKps">Target KPs</th>
              <th data-sort="frameKps">Frame KPs</th>
              <th data-sort="rawMatches">Raw Matches</th>
              <th data-sort="goodMatches" class="sorted-desc">Good Matches</th>
              <th data-sort="time">Time (ms)</th>
            </tr>
          </thead>
          <tbody>
            ${sortedResults.map(r => this._generateTableRow(r)).join('')}
          </tbody>
        </table>
      </div>
    </section>
    `;
  }

  /**
   * Generate table row
   */
  _generateTableRow(result) {
    return `
    <tr data-id="${result.config.id}" onclick="scrollToDetail('${result.config.id}')">
      <td>${result.config.id}</td>
      <td><span class="category-badge ${result.config.category}">
        ${result.config.category}</span></td>
      <td>${result.success ? '<span class="success-icon">✓</span>' :
                             '<span class="failure-icon">✗</span>'}</td>
      <td>${result.metrics.targetKeypoints || 0}</td>
      <td>${result.metrics.frameKeypoints || 0}</td>
      <td>${result.metrics.rawMatches || 0}</td>
      <td class="highlight">${result.metrics.goodMatches || 0}</td>
      <td>${result.metrics.processingTime ?
            result.metrics.processingTime.toFixed(2) : 'N/A'}</td>
    </tr>
    `;
  }

  /**
   * Generate detailed results
   */
  _generateDetailedResults(sortedResults) {
    return `
    <section class="detailed-results">
      <h2>Detailed Results</h2>
      <p class="section-desc">Click to expand individual experiment details</p>
      ${sortedResults.map(r => this._generateDetailedResultCard(r)).join('')}
    </section>
    `;
  }

  /**
   * Generate detailed result card
   */
  _generateDetailedResultCard(result) {
    // Check if visualization exists
    let imgData = null;
    if (result.visualizations && result.visualizations.composite) {
      try {
        imgData = DebugVisualizer.canvasToDataURL(
          result.visualizations.composite, 'image/jpeg'
        );
      } catch (error) {
        console.warn(`Failed to convert canvas to data URL for ${result.config.id}:`, error);
      }
    }

    return `
    <details class="detail-card" id="detail-${result.config.id}">
      <summary>
        <span class="detail-title">${result.config.id}</span>
        <span class="category-badge ${result.config.category}">
          ${result.config.category}
        </span>
        <span class="detail-matches">
          ${result.metrics.goodMatches || 0} matches
        </span>
        ${result.success ? '<span class="success-badge">✓</span>' :
                           '<span class="failure-badge">✗</span>'}
      </summary>
      <div class="detail-content">
        <p class="detail-desc">${result.config.description}</p>
        ${imgData ? `
        <div class="detail-visualization">
          <img src="${imgData}" alt="${result.config.id}">
        </div>
        ` : `
        <div class="detail-visualization">
          <p class="no-visualization">No visualization available (experiment may have failed)</p>
        </div>
        `}
        <div class="detail-metrics">
          <h4>Metrics</h4>
          <pre>${JSON.stringify(result.metrics, null, 2)}</pre>
        </div>
        <div class="detail-config">
          <h4>Configuration</h4>
          <pre>${JSON.stringify(result.config, null, 2)}</pre>
        </div>
        ${result.error ? `
        <div class="detail-error">
          <h4>Error</h4>
          <pre>${result.error}</pre>
        </div>
        ` : ''}
      </div>
    </details>
    `;
  }

  /**
   * Get CSS styles
   */
  _getCSS() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                     sans-serif;
        background: #0a0a0a;
        color: #e0e0e0;
        line-height: 1.6;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px;
      }

      header {
        text-align: center;
        padding: 40px 20px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 10px;
        margin-bottom: 40px;
      }

      h1 {
        font-size: 2.5em;
        margin-bottom: 10px;
        color: #00ff88;
      }

      .subtitle {
        color: #888;
        font-size: 0.9em;
      }

      section {
        background: #1a1a1a;
        border-radius: 10px;
        padding: 30px;
        margin-bottom: 30px;
        border: 1px solid #333;
      }

      h2 {
        color: #00ff88;
        margin-bottom: 15px;
        font-size: 1.8em;
      }

      h3 {
        color: #e0e0e0;
        margin-bottom: 10px;
      }

      .section-desc {
        color: #888;
        margin-bottom: 20px;
        font-size: 0.95em;
      }

      /* Summary Stats */
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }

      .stat-card {
        background: #252525;
        padding: 25px;
        border-radius: 8px;
        text-align: center;
        border: 2px solid #333;
      }

      .stat-card.success {
        border-color: #00ff88;
      }

      .stat-card.failure {
        border-color: #ff4444;
      }

      .stat-value {
        font-size: 2.5em;
        font-weight: bold;
        color: #00ff88;
        margin-bottom: 10px;
      }

      .stat-label {
        color: #888;
        font-size: 0.9em;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      /* Top Results */
      .top-result-card {
        background: #252525;
        border-radius: 10px;
        padding: 25px;
        margin-bottom: 25px;
        border: 2px solid #333;
        position: relative;
      }

      .rank-badge {
        position: absolute;
        top: -15px;
        right: 20px;
        background: linear-gradient(135deg, #00ff88, #00cc6a);
        color: #000;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 1.2em;
      }

      .result-header {
        display: flex;
        align-items: center;
        gap: 15px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }

      .result-desc {
        color: #aaa;
        margin-bottom: 20px;
      }

      .category-badge {
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 0.8em;
        text-transform: uppercase;
        font-weight: 600;
      }

      .category-badge.resolution { background: #3498db; color: #fff; }
      .category-badge.brisk { background: #9b59b6; color: #fff; }
      .category-badge.matching { background: #e67e22; color: #fff; }
      .category-badge.multiscale { background: #e74c3c; color: #fff; }
      .category-badge.preprocessing { background: #1abc9c; color: #fff; }

      .success-badge, .success-icon {
        color: #00ff88;
        font-weight: bold;
      }

      .failure-badge, .failure-icon {
        color: #ff4444;
        font-weight: bold;
      }

      .metrics-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 15px;
        margin: 20px 0;
      }

      .metric {
        background: #1a1a1a;
        padding: 12px;
        border-radius: 6px;
        border: 1px solid #333;
      }

      .metric.highlight {
        border-color: #00ff88;
        background: rgba(0, 255, 136, 0.05);
      }

      .metric-label {
        display: block;
        color: #888;
        font-size: 0.85em;
        margin-bottom: 5px;
      }

      .metric-value {
        display: block;
        color: #e0e0e0;
        font-size: 1.2em;
        font-weight: bold;
      }

      .visualization img {
        width: 100%;
        border-radius: 8px;
        margin-top: 20px;
        border: 1px solid #333;
      }

      .config-details {
        margin-top: 15px;
      }

      details {
        cursor: pointer;
      }

      summary {
        user-select: none;
        padding: 10px;
        background: #1a1a1a;
        border-radius: 5px;
        border: 1px solid #333;
      }

      summary:hover {
        background: #252525;
      }

      pre {
        background: #0a0a0a;
        padding: 15px;
        border-radius: 5px;
        overflow-x: auto;
        margin-top: 10px;
        border: 1px solid #333;
        font-size: 0.85em;
        line-height: 1.4;
      }

      /* Category Analysis */
      .category-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
      }

      .category-card {
        background: #252525;
        border-radius: 8px;
        padding: 20px;
        border: 2px solid #333;
      }

      .category-title {
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid #00ff88;
      }

      .category-stats {
        margin: 15px 0;
      }

      .category-stat {
        display: flex;
        justify-content: space-between;
        margin: 8px 0;
        padding: 8px 0;
        border-bottom: 1px solid #333;
      }

      .category-stat .label {
        color: #888;
      }

      .category-stat .value {
        color: #e0e0e0;
        font-weight: 600;
      }

      .best-config {
        margin-top: 15px;
        padding: 12px;
        background: rgba(0, 255, 136, 0.1);
        border-radius: 5px;
        border-left: 3px solid #00ff88;
        font-size: 0.9em;
      }

      /* Recommendations */
      .recommendation-card {
        background: #252525;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        border-left: 4px solid;
      }

      .recommendation-card.impact-high {
        border-left-color: #ff4444;
      }

      .recommendation-card.impact-medium {
        border-left-color: #ffaa00;
      }

      .recommendation-card.impact-info {
        border-left-color: #3498db;
      }

      .rec-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }

      .impact-badge {
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 0.75em;
        font-weight: 700;
        text-transform: uppercase;
      }

      .impact-badge.high {
        background: #ff4444;
        color: #fff;
      }

      .impact-badge.medium {
        background: #ffaa00;
        color: #000;
      }

      .impact-badge.info {
        background: #3498db;
        color: #fff;
      }

      .implementation-guide {
        margin-top: 30px;
        padding: 20px;
        background: #1a1a1a;
        border-radius: 8px;
        border: 2px solid #00ff88;
      }

      .code-block {
        background: #0a0a0a;
        color: #00ff88;
        font-family: 'Courier New', monospace;
      }

      /* Table */
      .table-wrapper {
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }

      th {
        background: #252525;
        padding: 12px;
        text-align: left;
        border-bottom: 2px solid #00ff88;
        cursor: pointer;
        user-select: none;
      }

      th:hover {
        background: #2a2a2a;
      }

      th.sorted-asc::after {
        content: ' ▲';
        color: #00ff88;
      }

      th.sorted-desc::after {
        content: ' ▼';
        color: #00ff88;
      }

      td {
        padding: 12px;
        border-bottom: 1px solid #333;
      }

      tr:hover {
        background: #252525;
        cursor: pointer;
      }

      td.highlight {
        color: #00ff88;
        font-weight: bold;
      }

      /* Detailed Results */
      .detail-card {
        background: #252525;
        border-radius: 8px;
        margin-bottom: 15px;
        border: 1px solid #333;
      }

      .detail-card summary {
        padding: 15px 20px;
        display: flex;
        align-items: center;
        gap: 15px;
      }

      .detail-title {
        font-weight: 600;
        flex: 1;
      }

      .detail-matches {
        color: #00ff88;
        font-weight: 600;
      }

      .detail-content {
        padding: 20px;
        border-top: 1px solid #333;
      }

      .detail-desc {
        color: #aaa;
        margin-bottom: 20px;
      }

      .detail-visualization img {
        width: 100%;
        border-radius: 8px;
        margin-bottom: 20px;
      }

      .detail-metrics, .detail-config, .detail-error {
        margin-top: 20px;
      }

      .detail-error {
        padding: 15px;
        background: rgba(255, 68, 68, 0.1);
        border-left: 4px solid #ff4444;
        border-radius: 5px;
      }
    `;
  }

  /**
   * Get JavaScript code
   */
  _getJavaScript() {
    return `
      // Table sorting
      let currentSort = { column: 'goodMatches', direction: 'desc' };

      document.querySelectorAll('#results-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort));
      });

      function sortTable(column) {
        const table = document.getElementById('results-table');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        // Toggle direction
        if (currentSort.column === column) {
          currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.column = column;
          currentSort.direction = 'desc';
        }

        // Sort rows
        rows.sort((a, b) => {
          let aVal, bVal;

          switch (column) {
            case 'id':
            case 'category':
              aVal = a.querySelector(\`td:\${getColumnIndex(column)}\`).textContent;
              bVal = b.querySelector(\`td:\${getColumnIndex(column)}\`).textContent;
              return currentSort.direction === 'asc' ?
                     aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'success':
              aVal = a.querySelector(\`td:\${getColumnIndex(column)}\`).textContent.includes('✓');
              bVal = b.querySelector(\`td:\${getColumnIndex(column)}\`).textContent.includes('✓');
              return currentSort.direction === 'asc' ?
                     (aVal - bVal) : (bVal - aVal);
            default:
              aVal = parseFloat(a.querySelector(\`td:\${getColumnIndex(column)}\`).textContent) || 0;
              bVal = parseFloat(b.querySelector(\`td:\${getColumnIndex(column)}\`).textContent) || 0;
              return currentSort.direction === 'asc' ?
                     aVal - bVal : bVal - aVal;
          }
        });

        // Update table
        rows.forEach(row => tbody.appendChild(row));

        // Update header styles
        document.querySelectorAll('#results-table th').forEach(th => {
          th.classList.remove('sorted-asc', 'sorted-desc');
        });
        const sortedTh = document.querySelector(\`#results-table th[data-sort="\${column}"]\`);
        sortedTh.classList.add(\`sorted-\${currentSort.direction}\`);
      }

      function getColumnIndex(column) {
        const columns = ['id', 'category', 'success', 'targetKps', 'frameKps',
                        'rawMatches', 'goodMatches', 'time'];
        return columns.indexOf(column) + 1;
      }

      function scrollToDetail(id) {
        const element = document.getElementById('detail-' + id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          element.open = true;
        }
      }
    `;
  }

  /**
   * Generate and download report
   * @param {string} filename - Output filename
   */
  downloadReport(filename = 'detection-debug-report.html') {
    const html = this.generateHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Open report in new window
   */
  openReportInNewWindow() {
    const html = this.generateHTML();
    const newWindow = window.open();
    newWindow.document.write(html);
    newWindow.document.close();
  }
}
