/**
 * ViewportManager - Central authority for viewport dimensions and orientation
 * Provides single source of truth for all dimension-related calculations
 * across the WebAR application.
 */
class ViewportManager {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.orientation = this.detectOrientation();
    this.aspectRatio = this.width / this.height;
    this.listeners = new Map();
    this.resizeTimeout = null;

    this.setupListeners();
  }

  /**
   * Detect current device orientation using matchMedia
   * More reliable than window.orientation
   */
  detectOrientation() {
    if (window.matchMedia('(orientation: portrait)').matches) {
      return 'portrait';
    }
    return 'landscape';
  }

  /**
   * Setup event listeners for orientation and resize changes
   */
  setupListeners() {
    const handleChange = () => {
      // Clear any pending updates
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }

      // Debounce to allow device orientation to stabilize
      // 200ms ensures viewport has settled after rotation
      this.resizeTimeout = setTimeout(() => {
        this.update();
      }, 200);
    };

    window.addEventListener('resize', handleChange);
    window.addEventListener('orientationchange', handleChange);

    // Modern screen orientation API (when available)
    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleChange);
    }
  }

  /**
   * Update dimensions and notify all listeners
   */
  update() {
    const oldOrientation = this.orientation;

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.orientation = this.detectOrientation();
    this.aspectRatio = this.width / this.height;

    const orientationChanged = oldOrientation !== this.orientation;

    console.log(`ViewportManager: Updated to ${this.width}x${this.height} ` +
                `(${this.orientation}, changed: ${orientationChanged})`);

    // Notify all listeners with new viewport state
    this.emit('update', {
      width: this.width,
      height: this.height,
      orientation: this.orientation,
      aspectRatio: this.aspectRatio,
      orientationChanged
    });
  }

  /**
   * Get optimal camera constraints for current orientation
   * Returns higher resolution in the longer dimension
   */
  getCameraConstraints() {
    const isPortrait = this.orientation === 'portrait';

    return {
      video: {
        facingMode: 'environment',
        width: { ideal: isPortrait ? 720 : 1280 },
        height: { ideal: isPortrait ? 1280 : 720 }
      },
      audio: false
    };
  }

  /**
   * Calculate aspect-fill scale for camera feed to cover viewport
   * Ensures camera feed fills entire screen without letterboxing
   *
   * @param {number} videoWidth - Camera feed width in pixels
   * @param {number} videoHeight - Camera feed height in pixels
   * @returns {{width: number, height: number, x: number, y: number}}
   */
  getAspectFillScale(videoWidth, videoHeight) {
    // Validate input dimensions
    if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) {
      console.warn('ViewportManager: Invalid video dimensions ' +
                   `(${videoWidth}x${videoHeight}), using viewport size`);
      return {
        width: this.width,
        height: this.height,
        x: this.width / 2,
        y: this.height / 2
      };
    }

    const videoAspect = videoWidth / videoHeight;
    const viewportAspect = this.aspectRatio;

    let scaledWidth, scaledHeight;

    if (videoAspect > viewportAspect) {
      // Video is wider than viewport - fit to height, crop sides
      scaledHeight = this.height;
      scaledWidth = this.height * videoAspect;
    } else {
      // Video is taller than viewport - fit to width, crop top/bottom
      scaledWidth = this.width;
      scaledHeight = this.width / videoAspect;
    }

    return {
      width: scaledWidth,
      height: scaledHeight,
      x: this.width / 2,   // Center horizontally
      y: this.height / 2   // Center vertically
    };
  }

  /**
   * Get current viewport dimensions and state
   * @returns {{width: number, height: number, orientation: string,
   *            aspectRatio: number}}
   */
  getDimensions() {
    return {
      width: this.width,
      height: this.height,
      orientation: this.orientation,
      aspectRatio: this.aspectRatio
    };
  }

  /**
   * Validate that two dimension sets are compatible for coordinate mapping
   * @param {number} sourceWidth - Source coordinate system width
   * @param {number} sourceHeight - Source coordinate system height
   * @param {number} targetWidth - Target coordinate system width
   * @param {number} targetHeight - Target coordinate system height
   * @returns {boolean} True if dimensions are valid for scaling
   */
  validateDimensions(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
      console.error('ViewportManager: Invalid dimensions for validation');
      return false;
    }

    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = targetWidth / targetHeight;
    const aspectDiff = Math.abs(sourceAspect - targetAspect);

    // Warn if aspect ratios differ significantly (>10%)
    if (aspectDiff > 0.1 * Math.min(sourceAspect, targetAspect)) {
      console.warn(`ViewportManager: Aspect ratio mismatch - ` +
                   `source: ${sourceAspect.toFixed(2)}, ` +
                   `target: ${targetAspect.toFixed(2)}`);
    }

    return true;
  }

  /**
   * Subscribe to viewport update events
   * @param {string} event - Event name (currently only 'update' supported)
   * @param {Function} callback - Callback function to invoke on update
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Unsubscribe from viewport update events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to all registered listeners
   * @param {string} event - Event name
   * @param {*} data - Data to pass to listeners
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error('ViewportManager listener error:', err);
        }
      });
    }
  }

  /**
   * Cleanup resources and event listeners
   */
  destroy() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.listeners.clear();
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.ViewportManager = ViewportManager;
}
