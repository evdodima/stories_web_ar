/**
 * WebAR Image Tracking Module
 * A modular system for detecting and tracking reference images in a video stream.
 * Features best-in-class optical flow tracking for robust performance.
 */

// Main application coordinator
class ImageTracker {
    constructor() {
        // Initialize state
        this.state = {
            isProcessing: false,
            isTracking: false,
            lastProcessingTime: 0,
            lastFrameTimestamp: 0,
            fps: 0,
            drawKeypoints: false,
            visualizeFlowPoints: false, // Visualize optical flow tracking points
            maxDimension: 640, // Maximum allowed dimension while preserving aspect ratio
            useOpticalFlow: true, // Enable optical flow tracking by default
            detectionInterval: 10, // Run full detection every N frames
            frameCount: 0, // Current frame counter
            lastCorners: null, // Last detected corners for optical flow
            lastFrame: null, // Last processed frame for optical flow
            featurePoints: null, // Feature points used in optical flow tracking
            flowStatus: null, // Status of optical flow tracking points
            maxFeatures: 500, // Maximum number of feature points to extract per frame
        };

        // Initialize sub-modules
        this.ui = new UIManager(this);
        this.camera = new CameraManager();
        this.referenceImage = new ReferenceImageManager();
        this.detector = null;
        this.opticalFlow = null;
        this.visualizer = new Visualizer();

        // Initialize when OpenCV is ready
        this.waitForOpenCV();
    }

    waitForOpenCV() {
        if (typeof cv === 'undefined' ||
            typeof cv.BFMatcher !== 'function' ||
            typeof cv.ORB !== 'function' ||
            typeof cv.DMatchVector !== 'function') {

            this.ui.updateStatus('Loading OpenCV...');
            setTimeout(() => this.waitForOpenCV(), 500);
        } else {
            this.ui.updateStatus('OpenCV loaded. Loading reference image...');
            this.initialize();
            this.referenceImage.loadDefaultImage();
        }
    }

    initialize() {
        // Set up UI event listeners
        this.ui.setupEventListeners({
            onStartTracking: () => this.startTracking(),
            onStopTracking: () => this.stopTracking(),
            onReferenceImageLoad: (event) => this.referenceImage.loadFromFile(event)
        });

        // Initialize detector and optical flow tracker once OpenCV is ready
        this.detector = new FeatureDetector(this.state);
        this.opticalFlow = new OpticalFlowTracker(this.state);
    }

    async startTracking() {
        if (this.state.isTracking) return;

        this.ui.updateStatus('Starting tracking...');

        try {
            // Start camera
            await this.camera.start();

            // Update UI
            this.ui.updateControlsForTracking(true);

            // Set tracking state
            this.state.isTracking = true;

            // Verify OpenCV is fully initialized
            if (this.ensureOpenCVReady()) {
                this.processVideo();
            }
        } catch (error) {
            this.ui.updateStatus(`Error starting tracking: ${error.message}`);
            console.error(error);
        }
    }

    ensureOpenCVReady() {
        if (typeof cv === 'undefined' ||
            typeof cv.BFMatcher !== 'function' ||
            typeof cv.ORB !== 'function' ||
            typeof cv.DMatchVector !== 'function') {

            this.ui.updateStatus('Waiting for OpenCV to fully initialize...');

            setTimeout(() => {
                if (typeof cv !== 'undefined' && typeof cv.BFMatcher === 'function') {
                    this.ui.updateStatus('Starting tracking...');
                    this.processVideo();
                } else {
                    this.ui.updateStatus('OpenCV not fully loaded. Please refresh the page.');
                    this.state.isTracking = false;
                }
            }, 500);

            return false;
        }

        return true;
    }

    stopTracking() {
        // Update state
        this.state.isTracking = false;

        // Stop camera
        this.camera.stop();

        // Clean up optical flow resources
        if (this.state.lastFrame) {
            this.state.lastFrame.delete();
            this.state.lastFrame = null;
        }
        this.state.lastCorners = null;
        this.state.frameCount = 0;

        // Update UI
        this.ui.updateControlsForTracking(false);
        this.ui.updateStatus('Tracking stopped.');
    }

    processVideo() {
        // Exit if not tracking
        if (!this.state.isTracking) return;

        // Schedule next frame
        requestAnimationFrame(() => this.processVideo());

        // Rate limiting
        const now = performance.now();
        const elapsed = now - this.state.lastProcessingTime;
        if (elapsed < 1) return;
        this.state.lastProcessingTime = now;

        if (this.state.lastFrameTimestamp) {
            const delta = now - this.state.lastFrameTimestamp;
            if (delta > 0) {
                const currentFps = 1000 / delta;
                // apply exponential moving average for smoother display
                this.state.fps = this.state.fps ? (this.state.fps * 0.75 + currentFps * 0.25) : currentFps;
                this.ui.updateFPS(this.state.fps);
            }
        }
        this.state.lastFrameTimestamp = now;

        // Skip if already processing a frame
        if (this.state.isProcessing) return;

        // Set processing flag
        this.state.isProcessing = true;

        // Track frames processed to detect memory leaks
        let frameToProcess = null;

        try {
            // Process current video frame
            frameToProcess = this.camera.captureFrame(this.state.maxDimension);
            if (!frameToProcess) return;

            // Increment frame counter
            this.state.frameCount++;

            let trackingResult;
            let shouldRunDetector = false;

            // Decide whether to use feature detection or optical flow
            if (!this.state.useOpticalFlow ||
                !this.state.lastCorners ||
                !this.state.lastFrame ||
                this.state.frameCount % this.state.detectionInterval === 0) {

                shouldRunDetector = true;
            }

            if (shouldRunDetector) {
                // Run full feature detection periodically or when we don't have previous tracking data
                trackingResult = this.detector.detectAndMatch(
                    frameToProcess,
                    this.referenceImage.getData()
                );

                // Store frame and corners for optical flow tracking if detection was successful
                if (trackingResult.success && trackingResult.corners) {
                    // Clean up previous frame if it exists
                    if (this.state.lastFrame) {
                        this.state.lastFrame.delete();
                        this.state.lastFrame = null;
                    }

                    // Store current frame and corners for next optical flow tracking
                    this.state.lastFrame = frameToProcess.clone();
                    this.state.lastCorners = trackingResult.corners.slice();
                } else if (this.state.useOpticalFlow && this.state.lastFrame && this.state.lastCorners) {
                    // If detection failed but we have previous data, try optical flow as fallback
                    trackingResult = this.opticalFlow.track(
                        this.state.lastFrame,
                        frameToProcess,
                        this.state.lastCorners
                    );

                    // Save feature points for visualization if enabled
                    if (this.state.visualizeFlowPoints) {
                        this.state.featurePoints = trackingResult.nextFeaturePoints;
                        this.state.flowStatus = trackingResult.flowStatus;
                    }

                    // Update our tracking data if optical flow was successful
                    if (trackingResult.success) {
                        // Clean up previous frame
                        if (this.state.lastFrame) {
                            this.state.lastFrame.delete();
                            this.state.lastFrame = null;
                        }

                        // Update with new frame and corners
                        this.state.lastFrame = frameToProcess.clone();
                        this.state.lastCorners = trackingResult.corners.slice();
                    } else {
                        // Optical flow failed - clear tracking data to prevent tracking with stale points
                        if (this.state.lastFrame) {
                            this.state.lastFrame.delete();
                            this.state.lastFrame = null;
                        }
                        this.state.lastCorners = null;
                        // Clear visualization data to remove stale points from display
                        this.state.featurePoints = null;
                        this.state.flowStatus = null;
                    }
                }
            } else {
                // Use optical flow for most frames (more efficient)
                trackingResult = this.opticalFlow.track(
                    this.state.lastFrame,
                    frameToProcess,
                    this.state.lastCorners
                );

                // Save feature points for visualization if enabled
                if (this.state.visualizeFlowPoints) {
                    this.state.featurePoints = trackingResult.nextFeaturePoints;
                    this.state.flowStatus = trackingResult.flowStatus;
                }

                // Update our tracking data if optical flow was successful
                if (trackingResult.success) {
                    // Clean up previous frame
                    if (this.state.lastFrame) {
                        this.state.lastFrame.delete();
                        this.state.lastFrame = null;
                    }

                    // Update with new frame and corners
                    this.state.lastFrame = frameToProcess.clone();
                    this.state.lastCorners = trackingResult.corners.slice();
                } else {
                    // Optical flow failed - clear tracking data to prevent tracking with stale points
                    if (this.state.lastFrame) {
                        this.state.lastFrame.delete();
                        this.state.lastFrame = null;
                    }
                    this.state.lastCorners = null;
                    // Clear visualization data to remove stale points from display
                    this.state.featurePoints = null;
                    this.state.flowStatus = null;
                    // Force a full detection on next frame
                    this.state.frameCount = this.state.detectionInterval - 1;
                }
            }

            // Visualize results
            this.visualizer.renderResults(
                frameToProcess,
                trackingResult,
                this.ui.canvas,
                this.state.drawKeypoints,
                this.state.visualizeFlowPoints ? this.state.featurePoints : null,
                this.state.flowStatus
            );

            // Update tracking mode indicator
            this.ui.updateTrackingMode();
        } catch (error) {
            console.error('Error in processVideo:', error);
        } finally {
            // Clean up resources
            if (frameToProcess && !this.state.lastFrame || (this.state.lastFrame && frameToProcess !== this.state.lastFrame)) {
                frameToProcess.delete();
            }

            // Mark processing as complete
            this.state.isProcessing = false;
        }
    }
}

// Make ImageTracker globally available
if (typeof window !== 'undefined') {
    window.ImageTracker = ImageTracker;
}

