/**
 * Manages camera access and video capture
 * Includes state machine for reliable stream lifecycle management
 */
class CameraManager {
    // State machine constants
    static STATE = {
        STOPPED: 'stopped',
        INITIALIZING: 'initializing',
        READY: 'ready',
        ERROR: 'error'
    };

    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.stream = null;
        this.state = CameraManager.STATE.STOPPED;
        this.currentConstraints = null;

        // Reusable canvas for frame capture (avoids creating new canvas every frame)
        this.captureCanvas = document.createElement('canvas');
        this.captureContext = this.captureCanvas.getContext('2d', {
            willReadFrequently: false,  // We read once per frame, not frequently
            alpha: false  // No alpha channel needed for camera frames
        });
    }

    async start(constraints = null) {
        try {
            this.state = CameraManager.STATE.INITIALIZING;

            // Use provided constraints or get defaults
            const cameraConstraints = constraints || this.getCameraConstraints();
            this.currentConstraints = cameraConstraints;

            console.log('CameraManager: Starting with constraints:',
                        cameraConstraints.video);

            this.stream = await navigator.mediaDevices.getUserMedia(
              cameraConstraints
            );
            this.video.srcObject = this.stream;

            // Start video playback (critical for mobile)
            await this.video.play();

            // Wait for video to be ready with stable dimensions
            await this.waitForVideoReady();

            this.state = CameraManager.STATE.READY;

            // Log actual camera capabilities
            const track = this.stream.getVideoTracks()[0];
            const settings = track.getSettings();
            console.log(`CameraManager: Ready (${this.video.videoWidth}x` +
                        `${this.video.videoHeight})`);
            console.log('CameraManager: Camera settings:', {
                aspectRatio: settings.aspectRatio,
                facingMode: settings.facingMode,
                deviceId: settings.deviceId ? 'present' : 'none',
                zoom: settings.zoom || 'not supported'
            });

            return true;
        } catch (error) {
            this.state = CameraManager.STATE.ERROR;
            console.error('Camera start error:', error);
            throw new Error(`Camera access error: ${error.message}`);
        }
    }

    getCameraConstraints(width = 1920, height = 1080) {
        return {
            video: {
                width: { ideal: width },
                height: { ideal: height },
                facingMode: 'environment' // Prefer rear camera
            },
            audio: false
        };
    }


    async waitForVideoReady() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max wait

            const checkVideo = () => {
                attempts++;

                // Check for HAVE_ENOUGH_DATA (readyState 4) for most reliable
                // playback, fallback to HAVE_CURRENT_DATA (readyState 2)
                if (this.video.readyState >= 2 &&
                    this.video.videoWidth > 0 &&
                    this.video.videoHeight > 0) {

                    console.log(`CameraManager: Video ready after ` +
                                `${attempts * 100}ms`);
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Video failed to initialize after 5s'));
                } else {
                    // Check again in 100ms
                    setTimeout(checkVideo, 100);
                }
            };

            // Start checking if video is ready
            checkVideo();

            // Also set up the loadedmetadata event as a backup
            this.video.addEventListener('loadedmetadata', () => {
                if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                    resolve();
                }
            }, { once: true });
        });
    }

    stop() {
        if (this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.video.srcObject = null;
            this.stream = null;
        }
        this.state = CameraManager.STATE.STOPPED;
        console.log('CameraManager: Stopped');
    }

    /**
     * Restart camera stream with new constraints
     * Used during orientation changes to get optimal resolution
     * @param {Object} constraints - Camera constraints from ViewportManager
     */
    async restart(constraints = null) {
        console.log('CameraManager: Restarting stream...');

        // Stop existing stream
        this.stop();

        // Small delay to ensure stream is fully released
        await new Promise(resolve => setTimeout(resolve, 100));

        // Start with new constraints
        return this.start(constraints);
    }

    /**
     * Get current video dimensions
     * @returns {{width: number, height: number}}
     */
    getDimensions() {
        return {
            width: this.video.videoWidth || 0,
            height: this.video.videoHeight || 0
        };
    }

    /**
     * Check if camera is ready for frame capture
     * @returns {boolean}
     */
    isReady() {
        return this.state === CameraManager.STATE.READY &&
               this.video.videoWidth > 0 &&
               this.video.videoHeight > 0;
    }

    captureFrame(maxDimension) {
        try {
            // Verify video is ready
            if (!this.video ||
                !this.video.videoWidth ||
                !this.video.videoHeight ||
                this.video.videoWidth <= 0 ||
                this.video.videoHeight <= 0) {
                return null;
            }

            // Calculate target dimensions (apply maxDimension before drawing)
            let drawWidth, drawHeight;
            if (maxDimension && (this.video.videoWidth > maxDimension || this.video.videoHeight > maxDimension)) {
                // Calculate scale factor to fit within maxDimension
                const scaleFactor = Math.min(
                    maxDimension / this.video.videoWidth,
                    maxDimension / this.video.videoHeight
                );
                drawWidth = Math.round(this.video.videoWidth * scaleFactor);
                drawHeight = Math.round(this.video.videoHeight * scaleFactor);
            } else {
                // Use original video dimensions
                drawWidth = this.video.videoWidth;
                drawHeight = this.video.videoHeight;
            }

            // Resize canvas to target dimensions (reuse same canvas)
            this.captureCanvas.width = drawWidth;
            this.captureCanvas.height = drawHeight;

            // Draw directly at target resolution (browser handles scaling efficiently)
            // This is much faster than drawing Full HD then resizing with OpenCV
            this.captureContext.drawImage(this.video, 0, 0, drawWidth, drawHeight);

            // Read the image data from the canvas into an OpenCV matrix
            // No resize needed since we already drew at the correct size
            let frame = cv.imread(this.captureCanvas);

            // Set canvas to match processing resolution for perfect alignment
            if (this.canvas.width !== frame.cols || this.canvas.height !== frame.rows) {
                this.canvas.width = frame.cols;
                this.canvas.height = frame.rows;
            }

            return frame;
        } catch (error) {
            console.error("Error capturing video frame:", error);
            return null;
        }
    }

    /**
     * Capture full-resolution frame for display purposes
     * Returns OpenCV Mat at native camera resolution (no downscaling)
     * Used for high-quality background rendering in ARRenderer
     * @returns {cv.Mat|null} Full resolution frame or null if error
     */
    captureDisplayFrame() {
        try {
            // Verify video is ready
            if (!this.video ||
                !this.video.videoWidth ||
                !this.video.videoHeight ||
                this.video.videoWidth <= 0 ||
                this.video.videoHeight <= 0) {
                return null;
            }

            // Create a canvas to capture the video frame at full resolution
            const captureCanvas = document.createElement('canvas');
            const captureContext = captureCanvas.getContext('2d');

            // Set dimensions to match full video resolution
            captureCanvas.width = this.video.videoWidth;
            captureCanvas.height = this.video.videoHeight;

            // Draw the current video frame to the canvas
            captureContext.drawImage(this.video, 0, 0,
                                   captureCanvas.width, captureCanvas.height);

            // Read the image data from the canvas into an OpenCV matrix
            let frame = cv.imread(captureCanvas);

            return frame;
        } catch (error) {
            console.error("Error capturing display frame:", error);
            return null;
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.CameraManager = CameraManager;
}

