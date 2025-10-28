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
            console.log(`CameraManager: Ready (${this.video.videoWidth}x` +
                        `${this.video.videoHeight})`);

            return true;
        } catch (error) {
            this.state = CameraManager.STATE.ERROR;
            console.error('Camera start error:', error);
            throw new Error(`Camera access error: ${error.message}`);
        }
    }

    getCameraConstraints(width = 1280, height = 960) {
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

            // Create a canvas to capture the video frame
            const captureCanvas = document.createElement('canvas');
            const captureContext = captureCanvas.getContext('2d');

            // Set dimensions to match video
            captureCanvas.width = this.video.videoWidth;
            captureCanvas.height = this.video.videoHeight;

            // Draw the current video frame to the canvas
            captureContext.drawImage(this.video, 0, 0, captureCanvas.width, captureCanvas.height);

            // Read the image data from the canvas into an OpenCV matrix
            let frame = cv.imread(captureCanvas);

            // Resize if larger than maximum dimension
            if (maxDimension && (frame.cols > maxDimension || frame.rows > maxDimension)) {
                let scaleFactor = Math.min(maxDimension / frame.cols, maxDimension / frame.rows);
                let newSize = new cv.Size(
                    Math.round(frame.cols * scaleFactor),
                    Math.round(frame.rows * scaleFactor)
                );
                let resizedFrame = new cv.Mat();
                cv.resize(frame, resizedFrame, newSize, 0, 0, cv.INTER_AREA);

                frame.delete();
                frame = resizedFrame;
            }

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
}

// Make available globally
if (typeof window !== 'undefined') {
    window.CameraManager = CameraManager;
}

