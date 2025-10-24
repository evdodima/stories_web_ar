/**
 * AR Bridge - JavaScript bridge to WASM AR engine
 * Handles WASM module loading, memory management, and API wrapping
 */

class ARBridge {
  constructor() {
    this.module = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.onReadyCallbacks = [];
    this.trackingCallbacks = [];
  }

  /**
   * Load and initialize WASM module
   * @param {string} wasmPath - Path to WASM .js file
   * @returns {Promise<void>}
   */
  async initialize(wasmPath = './public/wasm/webar_engine.js') {
    if (this.isInitialized) {
      return Promise.resolve();
    }

    if (this.isLoading) {
      return new Promise((resolve) => {
        this.onReadyCallbacks.push(resolve);
      });
    }

    this.isLoading = true;

    try {
      // Load WASM module
      const createModule = await this.loadWasmModule(wasmPath);

      // Create module instance and wait for runtime initialization
      this.module = await new Promise((resolve, reject) => {
        createModule({
          locateFile: (path) => {
            if (path.endsWith('.wasm')) {
              return './public/wasm/webar_engine.wasm';
            }
            return path;
          },
          onRuntimeInitialized: function() {
            console.log('[ARBridge] WASM runtime initialized');
            // Resolve with 'this' which is the module instance
            resolve(this);
          }
        }).catch(reject);
      });

      console.log('[ARBridge] Module ready, verifying memory access...');

      // Initialize engine
      this.module.initEngine();

      this.isInitialized = true;
      this.isLoading = false;

      console.log('[ARBridge] Initialized successfully');

      // Call ready callbacks
      this.onReadyCallbacks.forEach(cb => cb());
      this.onReadyCallbacks = [];

      return Promise.resolve();

    } catch (error) {
      this.isLoading = false;
      console.error('[ARBridge] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load WASM module script
   * @param {string} scriptPath
   * @returns {Promise<Function>}
   */
  loadWasmModule(scriptPath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptPath;
      script.onload = () => {
        if (typeof createWebarModule === 'function') {
          resolve(createWebarModule);
        } else {
          reject(new Error('WASM module not found'));
        }
      };
      script.onerror = () => {
        reject(new Error(`Failed to load ${scriptPath}`));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Configure engine settings
   */
  setConfig(config) {
    this.ensureInitialized();

    this.module.setEngineConfig(
      config.useOpticalFlow ?? true,
      config.detectionInterval ?? 15,
      config.maxFeatures ?? 800,
      config.maxTrackingPoints ?? 100,
      config.matchRatioThreshold ?? 0.7
    );
  }

  /**
   * Add a target to the database
   * @param {string} id - Target identifier
   * @param {Uint8Array} descriptors - BRISK descriptors (flat array)
   * @param {number} rows - Descriptor matrix rows
   * @param {number} cols - Descriptor matrix cols
   * @param {Array<number>} corners - [x0,y0, x1,y1, x2,y2, x3,y3]
   * @returns {boolean}
   */
  addTarget(id, descriptors, rows, cols, corners) {
    this.ensureInitialized();

    // Allocate WASM memory for descriptors
    const descriptorBytes = descriptors.length;
    const descriptorPtr = this.module._malloc(descriptorBytes);

    try {
      // Copy descriptor data to WASM memory using writeArrayToMemory
      // This is available even if HEAPU8 is not exposed
      this.module.writeArrayToMemory(descriptors, descriptorPtr);

      // Create corners array
      const cornersArray = corners; // Already a flat array

      // Call WASM function
      const success = this.module.addTarget(
        id,
        descriptorPtr,
        rows,
        cols,
        cornersArray
      );

      return success;

    } finally {
      // Free allocated memory
      this.module._free(descriptorPtr);
    }
  }

  /**
   * Remove a target
   */
  removeTarget(id) {
    this.ensureInitialized();
    this.module.removeTarget(id);
  }

  /**
   * Clear all targets
   */
  clearTargets() {
    this.ensureInitialized();
    this.module.clearTargets();
  }

  /**
   * Get number of loaded targets
   */
  getTargetCount() {
    this.ensureInitialized();
    return this.module.getTargetCount();
  }

  /**
   * Process a video frame
   * @param {ImageData|Uint8Array} imageData - Image data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} channels - Number of channels (3 or 4)
   * @returns {Array<Object>} Tracking results
   */
  processFrame(imageData, width, height, channels = 4) {
    this.ensureInitialized();

    let dataArray;
    if (imageData instanceof ImageData) {
      dataArray = imageData.data;
    } else {
      dataArray = imageData;
    }

    // Allocate WASM memory for image data
    const imageBytes = width * height * channels;
    const imagePtr = this.module._malloc(imageBytes);

    try {
      // Copy image data to WASM memory
      this.module.writeArrayToMemory(dataArray, imagePtr);

      // Process frame
      const jsResults = this.module.processFrame(
        imagePtr,
        width,
        height,
        channels
      );

      // Convert to plain JavaScript array
      const results = [];

      // Get length - Embind vector has size() method
      let length = 0;
      if (typeof jsResults.size === 'function') {
        length = jsResults.size();
      } else if (jsResults.length !== undefined) {
        length = jsResults.length;
      }

      for (let i = 0; i < length; i++) {
        const jsResult = jsResults.get ? jsResults.get(i) : jsResults[i];
        const result = {
          targetId: jsResult.targetId,
          detected: jsResult.detected,
          confidence: jsResult.confidence,
          trackingMode: jsResult.trackingMode,
          corners: []
        };

        // Extract corners
        const jsCorners = jsResult.corners;
        let cornersLength = 0;
        if (typeof jsCorners.size === 'function') {
          cornersLength = jsCorners.size();
        } else if (jsCorners.length !== undefined) {
          cornersLength = jsCorners.length;
        }

        for (let j = 0; j < cornersLength; j += 2) {
          const x = jsCorners.get ? jsCorners.get(j) : jsCorners[j];
          const y = jsCorners.get ? jsCorners.get(j + 1) : jsCorners[j + 1];
          result.corners.push({ x, y });
        }

        results.push(result);
      }

      // Notify callbacks
      this.trackingCallbacks.forEach(cb => cb(results));

      return results;

    } finally {
      // Free allocated memory
      this.module._free(imagePtr);
    }
  }

  /**
   * Start tracking session
   */
  startTracking() {
    this.ensureInitialized();
    this.module.startTracking();
  }

  /**
   * Stop tracking session
   */
  stopTracking() {
    this.ensureInitialized();
    this.module.stopTracking();
  }

  /**
   * Check if tracking
   */
  isTracking() {
    this.ensureInitialized();
    return this.module.isTracking();
  }

  /**
   * Reset engine state
   */
  reset() {
    this.ensureInitialized();
    this.module.reset();
  }

  /**
   * Get frame statistics
   */
  getFrameStats() {
    this.ensureInitialized();
    const jsStats = this.module.getFrameStats();

    return {
      detectionMs: jsStats.detectionMs,
      trackingMs: jsStats.trackingMs,
      totalMs: jsStats.totalMs,
      frameNumber: jsStats.frameNumber,
      detectedTargets: jsStats.detectedTargets,
      trackedTargets: jsStats.trackedTargets
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.ensureInitialized();
    this.module.resetStats();
  }

  /**
   * Get memory info
   */
  getMemoryInfo() {
    this.ensureInitialized();
    const jsInfo = this.module.getMemoryInfo();

    return {
      heapSize: jsInfo.heapSize,
      freeMemory: jsInfo.freeMemory
    };
  }

  /**
   * Subscribe to tracking updates
   */
  onTrackingUpdate(callback) {
    this.trackingCallbacks.push(callback);
    return () => {
      const index = this.trackingCallbacks.indexOf(callback);
      if (index > -1) {
        this.trackingCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Ensure module is initialized
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('ARBridge not initialized. Call initialize() first.');
    }
  }

  /**
   * Cleanup and destroy module
   */
  destroy() {
    if (this.module) {
      this.stopTracking();
      this.clearTargets();
      this.module = null;
    }
    this.isInitialized = false;
    this.trackingCallbacks = [];
  }
}

// Export as global or module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ARBridge;
} else {
  window.ARBridge = ARBridge;
}
