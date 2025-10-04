/**
 * Manages camera access and video capture
 */
class CameraManager {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.stream = null;
    }

    async start() {
        try {
            // Try to use rear camera first with preferred settings
            const constraints = this.getCameraConstraints();

            try {
                // Try with exact environment constraint first
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.video.srcObject = this.stream;
            } catch (err) {
                console.warn("Couldn't get exact environment camera, falling back to default:", err);
                // Fallback to standard environment preference
                const fallbackConstraints = this.getFallbackConstraints();
                this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                this.video.srcObject = this.stream;
            }

            // Apply fixed settings to prevent auto adjustments
            this.optimizeVideoTrack();

            // Start video playback
            this.video.play();

            // Wait for video to be ready
            return this.waitForVideoReady();
        } catch (error) {
            throw new Error(`Camera access error: ${error.message}`);
        }
    }

    getCameraConstraints() {
        return {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 960 },
                facingMode: { exact: 'environment' }, // Force rear camera
                // Disable automatic switching and optimization
                advanced: [
                    { zoom: 1 }, // Start with no zoom
                    { focusMode: "continuous" }, // Continuous auto-focus
                    { exposureMode: "continuous" }, // Continuous auto-exposure
                    { whiteBalanceMode: "continuous" } // Continuous auto white balance
                ]
            },
            audio: false
        };
    }

    getFallbackConstraints() {
        return {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'environment'
            },
            audio: false
        };
    }

    optimizeVideoTrack() {
        const videoTrack = this.video.srcObject?.getVideoTracks()[0];
        if (!videoTrack) return;

        try {
            const capabilities = videoTrack.getCapabilities();
            console.log("Camera capabilities:", capabilities);

            // Only apply constraints for capabilities that exist
            const trackConstraints = {};

            // Disable auto zoom if supported
            if (capabilities.zoom) {
                trackConstraints.zoom = 1;
            }

            // Set focus mode if supported
            if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
                trackConstraints.focusMode = "continuous";
            }

            // Apply the constraints
            if (Object.keys(trackConstraints).length > 0) {
                videoTrack.applyConstraints(trackConstraints).catch(err => {
                    console.warn("Couldn't apply advanced camera constraints:", err);
                });
            }
        } catch (err) {
            console.warn("Error accessing camera capabilities:", err);
        }
    }

    async waitForVideoReady() {
        return new Promise((resolve) => {
            const checkVideo = () => {
                if (this.video.readyState >= 2 && // HAVE_CURRENT_DATA or better
                    this.video.videoWidth > 0 &&
                    this.video.videoHeight > 0) {

                    // Canvas size will be set dynamically based on processing resolution
                    // This is handled in the first frame capture
                    resolve();
                } else {
                    // Check again in a short while
                    setTimeout(checkVideo, 100);
                }
            };

            // Start checking if video is ready
            checkVideo();

            // Also set up the loadeddata event as a backup
            this.video.addEventListener('loadeddata', () => {
                // Double check dimensions are available
                if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                    resolve();
                }
            });
        });
    }

    stop() {
        if (this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.video.srcObject = null;
            this.stream = null;
        }
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

