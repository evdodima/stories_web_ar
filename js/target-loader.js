/**
 * Target Loader - Load targets from database and pass to WASM
 * Handles JSON parsing and descriptor conversion
 */

class TargetLoader {
  constructor(arBridge) {
    this.arBridge = arBridge;
    this.targetsLoaded = 0;
  }

  /**
   * Load target database from JSON file
   * @param {string} databasePath - Path to target_database.json
   * @returns {Promise<number>} Number of targets loaded
   */
  async loadDatabase(databasePath = './target_database.json') {
    try {
      console.log('[TargetLoader] Loading database:', databasePath);

      const response = await fetch(databasePath);
      if (!response.ok) {
        throw new Error(`Failed to load database: ${response.statusText}`);
      }

      const database = await response.json();

      if (!database.targets || !Array.isArray(database.targets)) {
        throw new Error('Invalid database format');
      }

      console.log('[TargetLoader] Database loaded:',
                 `${database.targets.length} targets`);

      // Load each target
      let loadedCount = 0;
      for (const target of database.targets) {
        const success = await this.loadTarget(target);
        if (success) {
          loadedCount++;
        }
      }

      this.targetsLoaded = loadedCount;

      console.log('[TargetLoader] Loaded', loadedCount, 'targets');

      return loadedCount;

    } catch (error) {
      console.error('[TargetLoader] Failed to load database:', error);
      throw error;
    }
  }

  /**
   * Load a single target
   * @param {Object} target - Target object from database
   * @returns {Promise<boolean>}
   */
  async loadTarget(target) {
    try {
      const {id, descriptors, corners, image_meta} = target;

      if (!id || !descriptors) {
        console.warn('[TargetLoader] Incomplete target data:', id);
        return false;
      }

      // Generate corners from image dimensions if not provided
      let cornersArray;
      if (corners) {
        // Use provided corners
        cornersArray = Array.isArray(corners[0]) ? corners.flat() : corners;
      } else if (image_meta && image_meta.width && image_meta.height) {
        // Generate corners from image dimensions [TL, TR, BR, BL]
        const w = image_meta.width;
        const h = image_meta.height;
        cornersArray = [0, 0, w, 0, w, h, 0, h];
      } else {
        // Default 512x512 if no dimensions available
        cornersArray = [0, 0, 512, 0, 512, 512, 0, 512];
      }

      // Convert descriptors from base64 or array
      let descriptorData;
      let rows, cols;

      if (typeof descriptors === 'string') {
        // Base64 encoded
        descriptorData = this.base64ToUint8Array(descriptors);
        rows = target.descriptorRows || Math.floor(descriptorData.length / 64);
        cols = target.descriptorCols || 64;
      } else if (Array.isArray(descriptors)) {
        // Check if 2D array (descriptors per feature) or flat array
        if (Array.isArray(descriptors[0])) {
          // 2D array: [[64 bytes], [64 bytes], ...]
          rows = descriptors.length;
          cols = descriptors[0].length;
          // Flatten to 1D
          const flat = descriptors.flat();
          descriptorData = new Uint8Array(flat);
        } else {
          // Already flat 1D array
          descriptorData = new Uint8Array(descriptors);
          rows = target.descriptorRows || Math.floor(descriptors.length / 64);
          cols = target.descriptorCols || 64;
        }
      } else if (descriptors.data && descriptors.rows && descriptors.cols) {
        // Structured format
        descriptorData = new Uint8Array(descriptors.data);
        rows = descriptors.rows;
        cols = descriptors.cols;
      } else {
        console.warn('[TargetLoader] Unknown descriptor format:', id);
        return false;
      }

      // Add target to WASM engine
      const success = this.arBridge.addTarget(
        id,
        descriptorData,
        rows,
        cols,
        cornersArray
      );

      if (success) {
        console.log('[TargetLoader] Loaded target:', id);
      } else {
        console.warn('[TargetLoader] Failed to load target:', id);
      }

      return success;

    } catch (error) {
      console.error('[TargetLoader] Error loading target:', error);
      return false;
    }
  }

  /**
   * Load target from image URL (requires feature extraction)
   * Note: Feature extraction should be done offline for production
   * @param {string} id - Target ID
   * @param {string} imageUrl - Image URL
   * @returns {Promise<boolean>}
   */
  async loadFromImage(id, imageUrl) {
    console.warn('[TargetLoader] Loading from image not implemented.');
    console.warn('For production, extract features offline and use database.');
    return false;
  }

  /**
   * Get number of loaded targets
   */
  getLoadedCount() {
    return this.targetsLoaded;
  }

  /**
   * Convert base64 string to Uint8Array
   * @param {string} base64
   * @returns {Uint8Array}
   */
  base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  /**
   * Create a simple target database structure
   * Helper for testing/development
   */
  static createDatabaseTemplate(targets) {
    return {
      version: '2.0',
      created: new Date().toISOString(),
      targets: targets.map(t => ({
        id: t.id,
        descriptors: {
          data: Array.from(t.descriptors || []),
          rows: t.descriptorRows || 0,
          cols: t.descriptorCols || 64
        },
        corners: t.corners || [0, 0, 100, 0, 100, 100, 0, 100],
        metadata: t.metadata || {}
      }))
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TargetLoader;
} else {
  window.TargetLoader = TargetLoader;
}
