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
      maxDimension: [960],
      maxFeatures: [3000],
      brisk: {
        threshold: [5,10,15,20,25,30,35,40,45,50],
        octaves: [2,3,4,5,6,7,8,9,10],
        patternScale: [1.0]
      },
    },

    // Fixed parameters - same for all tests
    fixed: {
      targetScale: 1,
      frameScale: 1.0,
      maxFeatures: 300,
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
   * Flatten nested objects in search space to key-value pairs
   */
  static flattenParams(obj, prefix = '') {
    const result = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(value)) {
        result.push({ key: fullKey, values: value });
      } else if (typeof value === 'object' && value !== null) {
        result.push(...this.flattenParams(value, fullKey));
      }
    }
    return result;
  }

  /**
   * Set nested property on object using dot notation
   */
  static setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Generate Cartesian product of all variable parameters
   * This automatically creates all possible combinations
   */
  static generateAllCombinations() {
    const vars = this.searchSpace.variables;

    // Flatten nested objects
    const flatParams = this.flattenParams(vars);
    const keys = flatParams.map(p => p.key);
    const valueLists = flatParams.map(p => p.values);

    // Generate Cartesian product
    const cartesian = (...arrays) => {
      return arrays.reduce((acc, array) =>
        acc.flatMap(x => array.map(y => [...x, y])),
        [[]]
      );
    };

    const combinations = cartesian(...valueLists);

    // Convert to config objects
    return combinations.map((combo, index) => {
      const config = { ...this.searchSpace.fixed };

      // Assign variable values (handle nested properties)
      keys.forEach((key, i) => {
        this.setNestedProperty(config, key, combo[i]);
      });

      // Generate ID and description
      const varPairs = keys.map((k, i) => {
        const shortKey = k.replace(/\./g, '_');
        return { key: k, shortKey, value: combo[i] };
      });

      const varStr = varPairs.map(p => `${p.shortKey}${p.value}`).join('_');
      config.id = `exp_${index}_${varStr}`;
      config.category = 'hyperparameter_search';
      config.description = varPairs.map(p => `${p.key}=${p.value}`).join(', ');

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
    const flatParams = this.flattenParams(this.searchSpace.variables);
    const total = flatParams.reduce((acc, p) => acc * p.values.length, 1);

    return {
      totalCombinations: total,
      variableParameters: flatParams.map(p => ({
        name: p.key,
        values: p.values.length,
        range: `${Math.min(...p.values)} to ${Math.max(...p.values)}`
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
