/**
 * Camera I/O - Handle camera capture and frame processing
 * Minimal JavaScript wrapper for camera and canvas operations
 */

class CameraIO {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.stream = null;
    this.isCapturing = false;
    this.frameWidth = 640;
    this.frameHeight = 480;
  }

  /**
   * Initialize camera and canvas elements
   */
  async initialize(videoElement, canvasElement = null) {
    this.video = videoElement;

    if (canvasElement) {
      this.canvas = canvasElement;
      this.ctx = canvasElement.getContext('2d', {
        willReadFrequently: true
      });
    } else {
      // Create off-screen canvas for frame capture
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', {
        willReadFrequently: true
      });
    }

    // Request camera access
    await this.startCamera();
  }

  /**
   * Start camera stream
   */
  async startCamera(constraints = null) {
    const defaultConstraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(
        constraints || defaultConstraints
      );

      this.video.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      // Update frame dimensions
      this.updateFrameDimensions();

      this.isCapturing = true;

      console.log('[CameraIO] Camera started:',
                 `${this.frameWidth}x${this.frameHeight}`);

      return true;

    } catch (error) {
      console.error('[CameraIO] Camera access failed:', error);
      throw error;
    }
  }

  /**
   * Stop camera stream
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isCapturing = false;
  }

  /**
   * Update frame dimensions based on video size
   */
  updateFrameDimensions(maxDimension = 640) {
    if (!this.video) {
      return;
    }

    let width = this.video.videoWidth;
    let height = this.video.videoHeight;

    if (width === 0 || height === 0) {
      width = 640;
      height = 480;
    }

    // Scale down to max dimension while preserving aspect ratio
    const scale = Math.min(maxDimension / width, maxDimension / height, 1.0);
    this.frameWidth = Math.round(width * scale);
    this.frameHeight = Math.round(height * scale);

    // Update canvas size
    this.canvas.width = this.frameWidth;
    this.canvas.height = this.frameHeight;
  }

  /**
   * Capture current video frame as ImageData
   * @returns {ImageData}
   */
  captureFrame() {
    if (!this.isCapturing) {
      console.warn('[CameraIO] Not capturing');
      return null;
    }

    if (!this.video || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
      if (this.frameCount === 0) {
        console.warn('[CameraIO] Video not ready:', {
          hasVideo: !!this.video,
          readyState: this.video?.readyState,
          HAVE_ENOUGH_DATA: this.video?.HAVE_ENOUGH_DATA
        });
      }
      return null;
    }

    // Draw video frame to canvas
    this.ctx.drawImage(this.video, 0, 0, this.frameWidth, this.frameHeight);

    // Get ImageData (RGBA)
    const imageData = this.ctx.getImageData(
      0, 0,
      this.frameWidth,
      this.frameHeight
    );

    this.frameCount = (this.frameCount || 0) + 1;

    return imageData;
  }

  /**
   * Capture frame as Uint8Array (for direct WASM passing)
   * @returns {Object} {data: Uint8Array, width: number, height: number, channels: number}
   */
  captureFrameRaw() {
    const imageData = this.captureFrame();
    if (!imageData) {
      return null;
    }

    return {
      data: imageData.data,
      width: this.frameWidth,
      height: this.frameHeight,
      channels: 4  // RGBA
    };
  }

  /**
   * Get video dimensions
   */
  getDimensions() {
    return {
      width: this.frameWidth,
      height: this.frameHeight,
      videoWidth: this.video ? this.video.videoWidth : 0,
      videoHeight: this.video ? this.video.videoHeight : 0
    };
  }

  /**
   * Check if camera is ready
   */
  isReady() {
    return this.isCapturing &&
           this.video &&
           this.video.readyState === this.video.HAVE_ENOUGH_DATA;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopCamera();
    this.video = null;
    this.canvas = null;
    this.ctx = null;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CameraIO;
} else {
  window.CameraIO = CameraIO;
}
