/**
 * Custom Experiment Configurations
 * True hyperparameter search - just define arrays, get all combinations
 */

export class CustomExperimentConfigs {
  /**
   * Hyperparameter search space
   * Just define arrays for each parameter you want to test
   */
  static searchSpace = {
    // Variable parameters - all combinations will be tested
    variables: {
      maxDimension: [640, 960, 1280, 1920],
      targetScale: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    },

    // Fixed parameters - same for all tests
    fixed: {
      frameScale: 1.0,
      brisk: {
        threshold: 30,
        octaves: 6,
        patternScale: 1.0
      },
      maxFeatures: 800,
      matching: {
        ratioThreshold: 0.75,
        minGoodMatches: 12,
        ransacThreshold: 4.0
      },
      preprocessing: {
        blur: false,
        clahe: true
      }
    }
  };

  /**
   * Generate Cartesian product of all variable parameters
   * This automatically creates all possible combinations
   */
  static generateAllCombinations() {
    const vars = this.searchSpace.variables;
    const keys = Object.keys(vars);
    const values = keys.map(k => vars[k]);

    // Generate Cartesian product
    const cartesian = (...arrays) => {
      return arrays.reduce((acc, array) =>
        acc.flatMap(x => array.map(y => [...x, y])),
        [[]]
      );
    };

    const combinations = cartesian(...values);

    // Convert to config objects
    return combinations.map((combo, index) => {
      const config = { ...this.searchSpace.fixed };

      // Assign variable values
      keys.forEach((key, i) => {
        config[key] = combo[i];
      });

      // Generate ID
      const varStr = keys.map((k, i) => `${k}${combo[i]}`).join('_');
      config.id = `exp_${index}_${varStr}`;
      config.category = 'hyperparameter_search';
      config.description = keys.map((k, i) => `${k}=${combo[i]}`).join(', ');

      return config;
    });
  }

  /**
   * Get all configs (just generates all combinations)
   */
  static getAllConfigs() {
    return this.generateAllCombinations();
  }

  /**
   * Filter configs by specific criteria
   */
  static filterConfigs(filterFn) {
    return this.getAllConfigs().filter(filterFn);
  }

  /**
   * Get configs where a specific parameter has specific values
   */
  static getConfigsWhere(paramName, values) {
    return this.filterConfigs(config =>
      values.includes(config[paramName])
    );
  }

  /**
   * Get a random sample of configs (for quick testing)
   */
  static getRandomSample(n) {
    const all = this.getAllConfigs();
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  /**
   * Get first N configs (for debugging)
   */
  static getFirst(n) {
    return this.getAllConfigs().slice(0, n);
  }

  /**
   * Get configs for a specific resolution
   */
  static getResolution(res) {
    return this.getConfigsWhere('maxDimension', [res]);
  }

  /**
   * Get configs for a specific target scale
   */
  static getTargetScale(scale) {
    return this.getConfigsWhere('targetScale', [scale]);
  }

  /**
   * Get baseline configs (full resolution, no scaling)
   */
  static getBaselines() {
    return this.filterConfigs(config =>
      config.targetScale === 1.0 && config.frameScale === 1.0
    );
  }

  /**
   * Get configs with small targets only
   */
  static getSmallTargets() {
    return this.filterConfigs(config => config.targetScale <= 0.3);
  }

  /**
   * Get configs with large targets only
   */
  static getLargeTargets() {
    return this.filterConfigs(config => config.targetScale >= 0.7);
  }

  /**
   * Get stratified sample across parameters
   */
  static getStratifiedSample() {
    const resolutions = this.searchSpace.variables.maxDimension;
    const scales = [0.1, 0.3, 0.5, 0.7, 1.0]; // Key scales

    const configs = [];
    for (const res of resolutions) {
      for (const scale of scales) {
        const config = this.filterConfigs(c =>
          c.maxDimension === res && c.targetScale === scale
        )[0];
        if (config) configs.push(config);
      }
    }
    return configs;
  }

  /**
   * Get statistics about search space
   */
  static getStats() {
    const vars = this.searchSpace.variables;
    const total = Object.values(vars).reduce((acc, arr) => acc * arr.length, 1);

    return {
      totalCombinations: total,
      variableParameters: Object.keys(vars).map(key => ({
        name: key,
        values: vars[key].length,
        range: `${Math.min(...vars[key])} to ${Math.max(...vars[key])}`
      })),
      fixedParameters: Object.keys(this.searchSpace.fixed)
    };
  }

  /**
   * Print search space summary
   */
  static printSummary() {
    const stats = this.getStats();
    console.log('=== Hyperparameter Search Configuration ===');
    console.log(`Total combinations: ${stats.totalCombinations}`);
    console.log('\nVariable Parameters:');
    stats.variableParameters.forEach(p => {
      console.log(`  ${p.name}: ${p.values} values (${p.range})`);
    });
    console.log('\nFixed Parameters:');
    stats.fixedParameters.forEach(p => {
      console.log(`  ${p}`);
    });
    console.log('\nQuick access methods:');
    console.log('  getAllConfigs() - All combinations');
    console.log('  getFirst(n) - First n configs');
    console.log('  getRandomSample(n) - Random n configs');
    console.log('  getResolution(640) - All configs for 640px');
    console.log('  getTargetScale(0.5) - All configs for 0.5x scale');
    console.log('  getBaselines() - Full resolution, no scaling');
    console.log('  getStratifiedSample() - Stratified across parameters');
  }

  /**
   * Create custom search space
   */
  static createCustomSearchSpace(customSpace) {
    const customClass = class extends CustomExperimentConfigs {};
    customClass.searchSpace = {
      variables: { ...this.searchSpace.variables, ...customSpace.variables },
      fixed: { ...this.searchSpace.fixed, ...customSpace.fixed }
    };
    return customClass;
  }

  /**
   * Add a new variable parameter to search space
   */
  static addVariable(name, values) {
    const newSearchSpace = {
      variables: { ...this.searchSpace.variables, [name]: values },
      fixed: { ...this.searchSpace.fixed }
    };
    const customClass = class extends CustomExperimentConfigs {};
    customClass.searchSpace = newSearchSpace;
    return customClass;
  }

  /**
   * Override a fixed parameter with an array (make it variable)
   */
  static makeVariable(paramPath, values) {
    const newSearchSpace = {
      variables: { ...this.searchSpace.variables, [paramPath]: values },
      fixed: { ...this.searchSpace.fixed }
    };

    // Remove from fixed
    delete newSearchSpace.fixed[paramPath];

    const customClass = class extends CustomExperimentConfigs {};
    customClass.searchSpace = newSearchSpace;
    return customClass;
  }
}

// Backward compatibility helpers
export const getAllConfigs = () => CustomExperimentConfigs.getAllConfigs();
export const getResolutionTests = () => CustomExperimentConfigs.getBaselines();
export const getAllScaleTests = () => CustomExperimentConfigs.filterConfigs(c => c.targetScale !== 1.0);
export const getScaleTestsForResolution = (res) => CustomExperimentConfigs.getResolution(res);
export const getQuickTests = () => CustomExperimentConfigs.getStratifiedSample();

export default CustomExperimentConfigs;
