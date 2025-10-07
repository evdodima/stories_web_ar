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
            useOpticalFlow: true, // Enable optical flow for smooth tracking
            detectionInterval: 15, // Run full detection every 15 frames
            frameCount: 0, // Current frame counter
            lastCorners: null, // Last detected corners for optical flow (legacy single target)
            lastFrame: null, // Last processed frame for optical flow
            featurePoints: null, // Feature points used in optical flow tracking
            flowStatus: null, // Status of optical flow tracking points
            maxFeatures: 800, // Maximum number of feature points to extract per frame
            trackedTargets: new Map(), // Map of targetId -> {corners, lastFrame, featurePoints}
        };

        // Initialize profiler
        this.profiler = new PerformanceProfiler();

        // Initialize sub-modules
        this.ui = new UIManager(this);
        this.camera = new CameraManager();
        this.referenceManager = new ReferenceImageManager();
        this.detector = null;
        this.opticalFlow = null;
        this.arRenderer = null; // Will be initialized after camera starts

        // Initialize when OpenCV is ready
        this.waitForOpenCV();

        // Listen to reference manager changes to update UI
        this.referenceManager.onChange(() => {
            const targets = this.referenceManager.getTargetSummaries();
            this.ui.updateTargetStatus(targets);
        });
    }

    waitForOpenCV() {
        if (typeof cv === 'undefined' ||
            typeof cv.BFMatcher !== 'function' ||
            typeof cv.ORB !== 'function' ||
            typeof cv.DMatchVector !== 'function') {

            this.ui.updateStatus('Loading OpenCV...');
            setTimeout(() => this.waitForOpenCV(), 500);
        } else {
            this.ui.updateStatus('OpenCV loaded. Loading database...');
            this.initialize();

            // Load database and update detector with vocabulary query when done
            this.referenceManager.loadDatabase().then(() => {
                const vocabularyQuery = this.referenceManager.databaseLoader?.getVocabularyQuery();
                if (this.detector && vocabularyQuery) {
                    this.detector.setVocabularyQuery(vocabularyQuery);
                }

                // Hide loading screen and autostart tracking
                this.ui.hideLoadingScreen();
                this.ui.updateStatus('Ready! Point camera at target images.');

                // Autostart tracking after a brief delay
                setTimeout(() => {
                    this.startTracking();
                }, 500);
            });
        }
    }

    initialize() {
        // Set up UI event listeners (database-only mode)
        this.ui.setupEventListeners({
            onStartTracking: () => this.startTracking(),
            onStopTracking: () => this.stopTracking(),
            onVideoOverlayToggle: (enabled) => this.toggleVideoOverlay(enabled),
            onMuteVideos: (muted) => this.setVideosMuted(muted)
        });

        // Get vocabulary query from database loader
        const vocabularyQuery = this.referenceManager.databaseLoader?.getVocabularyQuery();

        // Initialize detector with vocabulary tree and optical flow tracker
        this.detector = new FeatureDetector(this.state, this.profiler, vocabularyQuery);
        this.opticalFlow = new OpticalFlowTracker(this.state);
    }

    async startTracking() {
        if (this.state.isTracking) return;

        this.ui.updateStatus('Starting tracking...');

        try {
            // Start camera
            await this.camera.start();

            // Initialize AR renderer now that camera is ready
            if (!this.arRenderer) {
                console.log('[ImageTracker] Checking for ARRenderer...');
                if (typeof ARRenderer === 'undefined') {
                    console.error('[ImageTracker] ARRenderer not found! Check module loading.');
                } else {
                    const videoElement = document.getElementById('video');
                    console.log('[ImageTracker] Creating ARRenderer with video element:', videoElement);
                    this.arRenderer = new ARRenderer('arCanvas', videoElement, {
                        enabled: true,
                        muted: true,
                        showTrackingRects: true
                    });
                    console.log('[ImageTracker] ARRenderer created:', this.arRenderer);
                }
            }

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

        // Clean up optical flow resources (legacy)
        if (this.state.lastFrame) {
            this.state.lastFrame.delete();
            this.state.lastFrame = null;
        }
        this.state.lastCorners = null;
        this.state.frameCount = 0;

        // Clean up tracked targets
        for (const [targetId, tracked] of this.state.trackedTargets) {
            if (tracked.lastFrame) {
                tracked.lastFrame.delete();
            }
            this.opticalFlow.resetTrackingState(targetId);
            this.referenceManager.updateTargetRuntime(targetId, {
                status: 'idle'
            });
        }
        this.state.trackedTargets.clear();

        // Clean up AR renderer
        if (this.arRenderer) {
            for (const targetId of Array.from(this.state.trackedTargets.keys())) {
                this.arRenderer.removeTarget(targetId);
            }
        }

        // Update UI
        this.ui.updateControlsForTracking(false);
        this.ui.updateStatus('Tracking stopped.');
    }

    toggleVideoOverlay(enabled) {
        if (this.arRenderer) {
            this.arRenderer.setEnabled(enabled);
        }
    }

    setVideosMuted(muted) {
        if (this.arRenderer) {
            this.arRenderer.setMuted(muted);
        }
    }

    processVideo() {
        // Exit if not tracking
        if (!this.state.isTracking) return;

        // Schedule next frame
        requestAnimationFrame(() => this.processVideo());

        // Rate limiting: process at max 20 FPS (50ms between frames)
        const now = performance.now();
        const elapsed = now - this.state.lastProcessingTime;
        const minFrameTime = 50; // 50ms = 20 FPS
        if (elapsed < minFrameTime) return;
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
            this.profiler.startTimer('frame_total');

            // Process current video frame
            this.profiler.startTimer('capture_frame');
            frameToProcess = this.camera.captureFrame(this.state.maxDimension);
            this.profiler.endTimer('capture_frame');
            if (!frameToProcess) return;

            // Increment frame counter
            this.state.frameCount++;

            const targets = this.referenceManager.getTargets();
            let trackingResults = [];
            let shouldRunDetector = this.state.frameCount % this.state.detectionInterval === 0 ||
                                   !this.state.useOpticalFlow;

            // Limit to 2 simultaneous tracked targets for performance
            const maxTrackedTargets = 2;
            const currentlyTrackedCount = this.state.trackedTargets.size;

            if (targets.length === 0) {
                trackingResults = [];
            } else if (shouldRunDetector) {
                // If already tracking max targets, only try to detect those
                let targetsToDetect = targets;
                if (currentlyTrackedCount >= maxTrackedTargets) {
                    const trackedIds = Array.from(this.state.trackedTargets.keys());
                    targetsToDetect = targets.filter(t => trackedIds.includes(t.id));
                }

                // Run full feature detection for targets
                this.profiler.startTimer('detection_total');
                trackingResults = this.detector.detectMultipleTargets(frameToProcess, targetsToDetect);
                this.profiler.endTimer('detection_total');

                // Update tracked targets with detection results
                for (const result of trackingResults) {
                    if (result.success && result.corners) {
                        // Clean up old frame if exists
                        const existing = this.state.trackedTargets.get(result.targetId);
                        if (existing && existing.lastFrame) {
                            existing.lastFrame.delete();
                        }

                        // Store new tracking data
                        this.state.trackedTargets.set(result.targetId, {
                            corners: result.corners.slice(),
                            lastFrame: frameToProcess.clone()
                        });

                        // Reset optical flow tracking state on new detection
                        // This initializes Kalman filters and geometric state
                        const trackState = this.opticalFlow.getTrackingState(result.targetId);
                        trackState.framesSinceDetection = 0;
                        trackState.consecutivePoorFrames = 0;
                        trackState.prevScale = this.opticalFlow.calculateScale(result.corners);
                        trackState.prevRotation = this.opticalFlow.calculateRotation(result.corners);
                        trackState.prevAspectRatio = this.opticalFlow.calculateAspectRatio(result.corners);

                        // Update target runtime status
                        this.referenceManager.updateTargetRuntime(result.targetId, {
                            status: 'tracked',
                            lastSeen: Date.now(),
                            score: result.score
                        });
                    } else if (this.state.useOpticalFlow && this.state.trackedTargets.has(result.targetId)) {
                        // Detection failed but we have tracking data - try optical flow
                        this.profiler.startTimer('optical_flow_fallback');
                        const tracked = this.state.trackedTargets.get(result.targetId);
                        const flowResult = this.opticalFlow.track(
                            tracked.lastFrame,
                            frameToProcess,
                            tracked.corners,
                            result.targetId
                        );
                        this.profiler.endTimer('optical_flow_fallback');

                        if (flowResult.success) {
                            // Update with optical flow result
                            tracked.lastFrame.delete();
                            tracked.lastFrame = frameToProcess.clone();
                            tracked.corners = flowResult.corners.slice();

                            trackingResults[trackingResults.indexOf(result)] = {
                                ...result,
                                ...flowResult,
                                success: true
                            };

                            this.referenceManager.updateTargetRuntime(result.targetId, {
                                status: 'tracked',
                                lastSeen: Date.now()
                            });

                            // Check if we should trigger re-detection for quality
                            if (flowResult.shouldRedetect) {
                                // Will trigger full detection on next interval
                                this.state.frameCount = this.state.detectionInterval - 1;
                            }
                        } else {
                            // Optical flow failed - force re-detection immediately
                            if (flowResult.shouldRedetect) {
                                this.state.trackedTargets.delete(result.targetId);
                                this.opticalFlow.resetTrackingState(result.targetId);
                                this.state.frameCount = this.state.detectionInterval - 1;
                            }
                            this.referenceManager.updateTargetRuntime(result.targetId, {
                                status: 'lost'
                            });
                        }
                    } else {
                        // No detection and no tracking data
                        this.referenceManager.updateTargetRuntime(result.targetId, {
                            status: 'lost'
                        });
                    }
                }
            } else {
                // Use optical flow for all tracked targets
                this.profiler.startTimer('optical_flow_tracking');
                for (const [targetId, tracked] of this.state.trackedTargets) {
                    const flowResult = this.opticalFlow.track(
                        tracked.lastFrame,
                        frameToProcess,
                        tracked.corners,
                        targetId
                    );

                    if (flowResult.success) {
                        // Update tracking data
                        tracked.lastFrame.delete();
                        tracked.lastFrame = frameToProcess.clone();
                        tracked.corners = flowResult.corners.slice();

                        const target = this.referenceManager.getTarget(targetId);
                        trackingResults.push({
                            targetId,
                            targetLabel: target?.label || targetId,
                            ...flowResult,
                            success: true
                        });

                        this.referenceManager.updateTargetRuntime(targetId, {
                            status: 'tracked',
                            lastSeen: Date.now()
                        });

                        // Check if we should trigger re-detection for quality
                        if (flowResult.shouldRedetect) {
                            // Will trigger full detection on next interval
                            this.state.frameCount = this.state.detectionInterval - 1;
                        }
                    } else {
                        // Optical flow failed
                        if (flowResult.shouldRedetect) {
                            // Force re-detection immediately
                            this.state.trackedTargets.delete(targetId);
                            this.opticalFlow.resetTrackingState(targetId);
                            this.state.frameCount = this.state.detectionInterval - 1;
                        }
                        this.referenceManager.updateTargetRuntime(targetId, {
                            status: 'lost'
                        });
                    }
                }
                this.profiler.endTimer('optical_flow_tracking');
            }

            // Render AR overlays (tracking + videos + camera background)
            if (this.arRenderer) {
                this.profiler.startTimer('ar_rendering');

                // Update videos for tracked targets
                for (const result of trackingResults) {
                    if (result.success && result.corners) {
                        const target = this.referenceManager.getTarget(result.targetId);
                        if (target && target.videoUrl) {
                            // Don't await - let it load asynchronously
                            this.arRenderer.updateTarget(
                                result.targetId,
                                result.corners,
                                target.videoUrl
                            ).catch(err => {
                                console.error('[ImageTracker] Video update error:', err);
                            });
                        }
                    }
                }

                // Render everything (camera background + rectangles + videos)
                // Pass the same frame we used for tracking to ensure perfect sync
                this.arRenderer.render(trackingResults, frameToProcess);

                this.profiler.endTimer('ar_rendering');
            }

            // Update tracking mode indicator
            this.ui.updateTrackingMode();

            this.profiler.endTimer('frame_total');
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

