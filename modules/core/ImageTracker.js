/**
 * WebAR Image Tracking Module
 * A modular system for detecting and tracking reference images in a video stream.
 * Features best-in-class optical flow tracking for robust performance.
 */

// Main application coordinator
class ImageTracker {
    constructor() {
        console.log('[ImageTracker] Config:', {
            maxDimension: AppConfig.frameProcessing.maxDimension,
            detectionInterval: AppConfig.detection.detectionInterval
        });

        // Initialize state
        this.state = {
            isProcessing: false,
            isTracking: false,
            lastProcessingTime: 0,
            lastFrameTimestamp: 0,
            fps: 0,
            drawKeypoints: false,
            visualizeFlowPoints: false, // Visualize optical flow tracking points
            maxDimension: AppConfig.frameProcessing.maxDimension,
            useOpticalFlow: true, // Enable optical flow for smooth tracking
            detectionInterval: AppConfig.detection.detectionInterval,
            frameCount: 0, // Current frame counter
            lastCorners: null, // Last detected corners for optical flow (legacy single target)
            lastFrame: null, // Last processed frame for optical flow
            featurePoints: null, // Feature points used in optical flow tracking
            flowStatus: null, // Status of optical flow tracking points
            maxFeatures: AppConfig.brisk.maxFeaturesPerFrame,
            trackedTargets: new Map(), // Map of targetId -> {corners, lastFrame, featurePoints}

            // Single-video mode with center-priority selection
            activeVideoTarget: null, // Currently playing video target ID
            targetSelectionTime: 0, // When current target was selected
            minSwitchDelay: AppConfig.targetSwitching.minSwitchDelay
        };

        // Initialize profiler
        this.profiler = new PerformanceProfiler();

        // Initialize debug exporter
        this.debugExporter = new DebugExporter(this);

        // Initialize viewport manager (central dimension authority)
        this.viewportManager = new ViewportManager();

        // Initialize sub-modules
        this.ui = new UIManager(this);
        this.offlineManager = window.OfflineManager ? new OfflineManager() : null;
        this.camera = new CameraManager();
        this.referenceManager = new ReferenceImageManager(this.ui);
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

            // Load album and update detector with vocabulary query when done
            this.referenceManager.loadDatabase().then(async () => {
                const vocabularyQuery = this.referenceManager.zipLoader?.getVocabularyQuery();
                if (this.detector && vocabularyQuery) {
                    this.detector.setVocabularyQuery(vocabularyQuery);
                }

                // Create ARRenderer early so VideoManager exists
                this.ui.updateStatus('Initializing AR renderer...');
                await this.preloadARRenderer();

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
            onShowTrackingRects: (show) => this.toggleTrackingRects(show),
            onVideoOverlayToggle: (enabled) => this.toggleVideoOverlay(enabled),
            onMuteVideos: (muted) => this.setVideosMuted(muted)
        });

        // Get vocabulary query from zip loader (will be null initially, set after loading)
        const vocabularyQuery = this.referenceManager.zipLoader?.getVocabularyQuery();

        // Initialize detector with vocabulary tree and optical flow tracker
        this.detector = new FeatureDetector(this.state, this.profiler, vocabularyQuery);
        this.opticalFlow = new OpticalFlowTracker(this.state);

        // Handle orientation/resize changes
        this.setupOrientationHandling();
    }

    setupOrientationHandling() {
        // Get overlay element reference
        const overlay = document.getElementById('cameraTransitionOverlay');

        // Show overlay immediately on resize/orientation events (no debounce)
        // This prevents user from seeing distorted camera feed
        const showOverlayImmediately = () => {
            if (overlay && this.state.isTracking) {
                overlay.classList.add('visible');
                console.log('[ImageTracker] Overlay shown immediately on resize/orientation');
            }
        };

        // Add immediate event listeners for instant overlay display
        window.addEventListener('resize', showOverlayImmediately);
        window.addEventListener('orientationchange', showOverlayImmediately);
        if (screen.orientation) {
            screen.orientation.addEventListener('change', showOverlayImmediately);
        }

        // Subscribe to viewport updates from ViewportManager (debounced)
        // This handles the actual camera restart after orientation stabilizes
        this.viewportManager.on('update', async (data) => {
            console.log('[ImageTracker] Viewport update received:', data);

            // Only restart camera stream if orientation actually changed
            if (data.orientationChanged && this.state.isTracking) {
                await this.handleOrientationChange();
            } else if (overlay) {
                // Hide overlay even if orientation didn't change (e.g., desktop resize)
                // This ensures the overlay doesn't stay visible after simple resizes
                overlay.classList.remove('visible');
                console.log('[ImageTracker] Overlay hidden after viewport resize');
            }
        });
    }

    async handleOrientationChange() {
        console.log('[ImageTracker] Orientation changed - restarting camera...');

        // Ensure black overlay is visible (should already be shown by immediate event listener)
        const overlay = document.getElementById('cameraTransitionOverlay');
        if (overlay) {
            overlay.classList.add('visible');
        }

        try {
            // Pause tracking temporarily (but keep render loop running)
            const wasTracking = this.state.isTracking;
            this.state.isTracking = false;

            // Clear ARRenderer frame dimensions to force recalculation
            if (this.arRenderer) {
                this.arRenderer.frameWidth = 0;
                this.arRenderer.frameHeight = 0;
            }

            // Get new optimal constraints from ViewportManager
            const newConstraints = this.viewportManager.getCameraConstraints();

            // Restart camera stream with new constraints
            await this.camera.restart(newConstraints);

            // Wait a bit for video dimensions to stabilize
            await new Promise(resolve => setTimeout(resolve, 100));

            // Force ARRenderer to update background plane with new video dimensions
            if (this.arRenderer) {
                this.arRenderer.updateBackgroundPlane();
            }

            // Resume tracking and restart processing loop
            if (wasTracking) {
                this.state.isTracking = true;
                console.log('[ImageTracker] Camera restarted, resuming tracking...');

                // Restart the processing loop
                this.processVideo();
            }

            // Hide black overlay after camera restart is complete
            if (overlay) {
                overlay.classList.remove('visible');
            }
        } catch (error) {
            console.error('[ImageTracker] Error handling orientation change:', error);
            this.ui.updateStatus('Error restarting camera after rotation');

            // Hide overlay even on error
            if (overlay) {
                overlay.classList.remove('visible');
            }
        }
    }

    async startTracking() {
        if (this.state.isTracking) return;

        // Preload AR renderer before showing prompt
        await this.preloadARRenderer();

        // Show permission prompt
        this.showPermissionPrompt();
    }

    async preloadARRenderer() {
        // Initialize AR renderer early (before camera starts)
        if (!this.arRenderer) {
            console.log('[ImageTracker] Preloading ARRenderer...');
            if (typeof ARRenderer === 'undefined') {
                console.error('[ImageTracker] ARRenderer not found! Check module loading.');
            } else {
                const videoElement = document.getElementById('video');
                console.log('[ImageTracker] Creating ARRenderer with video element:', videoElement);
                this.arRenderer = new ARRenderer(
                  'arCanvas',
                  videoElement,
                  this.viewportManager,
                  {
                    enabled: true,
                    muted: false, // Audio on by default
                    showTrackingRects: false // Hidden by default
                  }
                );
                console.log('[ImageTracker] ARRenderer preloaded:', this.arRenderer);
            }
        }
    }

    async startTrackingAfterPermission() {
        this.ui.updateStatus('Starting tracking...');

        try {
            // Get optimal camera constraints for current orientation
            const constraints = this.viewportManager.getCameraConstraints();

            // Start camera with orientation-aware constraints
            await this.camera.start(constraints);

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

    toggleTrackingRects(show) {
        if (this.arRenderer) {
            this.arRenderer.setShowTrackingRects(show);
        }
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

    showPermissionPrompt() {
        const permissionPrompt = document.getElementById('permissionPrompt');
        const startARBtn = document.getElementById('startARBtn');

        if (!permissionPrompt || !startARBtn) return;

        // Show the prompt
        permissionPrompt.style.display = 'flex';

        // Handle button click
        const handleClick = async () => {
            // Hide the prompt immediately
            permissionPrompt.style.display = 'none';

            // Show loading status
            this.ui.updateStatus('Preloading videos...');

            // CRITICAL: Preload videos during user interaction to unlock autoplay
            // This must happen synchronously during the user click event
            if (this.arRenderer && this.arRenderer.videoManager) {
                const targets = this.referenceManager.getTargets();

                try {
                    await this.arRenderer.videoManager.preloadVideos(targets);
                } catch (error) {
                    console.error('[ImageTracker] Error preloading videos:', error);
                }
            }

            // Start tracking (this will trigger camera permission)
            await this.startTrackingAfterPermission();

            // Remove listener
            startARBtn.removeEventListener('click', handleClick);
        };

        startARBtn.addEventListener('click', handleClick);
    }

    /**
     * Select best target to display based on center proximity
     * @param {Array} trackingResults - All tracked targets
     * @param {number} frameWidth - Frame width
     * @param {number} frameHeight - Frame height
     * @returns {string|null} - Selected target ID
     */
    selectBestTarget(trackingResults, frameWidth, frameHeight) {
        const now = Date.now();
        const centerX = frameWidth / 2;
        const centerY = frameHeight / 2;

        // Filter successful tracking results
        const validTargets = trackingResults.filter(r => r.success && r.corners);
        if (validTargets.length === 0) {
            // No targets visible
            this.state.activeVideoTarget = null;
            return null;
        }

        // If only one target, select it
        if (validTargets.length === 1) {
            const targetId = validTargets[0].targetId;
            if (this.state.activeVideoTarget !== targetId) {
                this.state.activeVideoTarget = targetId;
                this.state.targetSelectionTime = now;
            }
            return targetId;
        }

        // Multiple targets visible - apply selection logic
        const currentTarget = this.state.activeVideoTarget;
        const timeSinceSelection = now - this.state.targetSelectionTime;
        const canSwitch = timeSinceSelection > this.state.minSwitchDelay;

        // Check if current target is still visible
        const currentStillVisible = currentTarget && validTargets.some(r => r.targetId === currentTarget);

        if (currentStillVisible && !canSwitch) {
            // Keep current target (resistance to switching)
            return currentTarget;
        }

        // Calculate distance from center for each target
        const targetDistances = validTargets.map(result => {
            const corners = result.corners;
            // Calculate center of target
            const targetCenterX = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
            const targetCenterY = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;

            // Distance from frame center
            const distance = Math.sqrt(
                Math.pow(targetCenterX - centerX, 2) +
                Math.pow(targetCenterY - centerY, 2)
            );

            return {
                targetId: result.targetId,
                distance: distance
            };
        });

        // If current target is visible and close enough, keep it (hysteresis)
        if (currentStillVisible) {
            const currentDistance = targetDistances.find(t => t.targetId === currentTarget)?.distance;
            const closestDistance = Math.min(...targetDistances.map(t => t.distance));

            // Only switch if another target is significantly closer
            if (currentDistance && currentDistance < closestDistance * AppConfig.targetSwitching.switchHysteresis) {
                return currentTarget;
            }
        }

        // Select target closest to center
        const bestTarget = targetDistances.reduce((best, current) =>
            current.distance < best.distance ? current : best
        );

        // Update active target
        if (this.state.activeVideoTarget !== bestTarget.targetId) {
            console.log(`[ImageTracker] Switching video target to: ${bestTarget.targetId}`);
            this.state.activeVideoTarget = bestTarget.targetId;
            this.state.targetSelectionTime = now;
        }

        return bestTarget.targetId;
    }

    processVideo() {
        // Exit if not tracking
        if (!this.state.isTracking) return;

        // Schedule next frame
        requestAnimationFrame(() => this.processVideo());

        // Calculate FPS
        const now = performance.now();
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

            // Capture processing frame (low-res for AR tracking)
            this.profiler.startTimer('capture_frame');
            frameToProcess = this.camera.captureFrame(this.state.maxDimension);
            this.profiler.endTimer('capture_frame');
            if (!frameToProcess) return;

            // Log frame resolution on first frame
            if (this.state.frameCount === 0) {
                console.log('[ImageTracker] Processed frame resolution:', {
                    width: frameToProcess.cols,
                    height: frameToProcess.rows,
                    maxDimension: this.state.maxDimension
                });
            }

            // Increment frame counter
            this.state.frameCount++;

            const targets = this.referenceManager.getTargets();
            let trackingResults = [];
            let shouldRunDetector = this.state.frameCount % this.state.detectionInterval === 0 ||
                                   !this.state.useOpticalFlow;

            // OPTIMIZATION: Detect all targets but only track the selected one
            if (targets.length === 0) {
                trackingResults = [];
            } else if (shouldRunDetector) {
                // Always detect all targets to enable switching between them
                // This allows us to see which target is closest to center
                let targetsToDetect = targets;

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
                // OPTIMIZATION: Only use optical flow for active target (single-video mode)
                this.profiler.startTimer('optical_flow_tracking');

                if (this.state.activeVideoTarget && this.state.trackedTargets.has(this.state.activeVideoTarget)) {
                    // Only track the currently selected target
                    const targetId = this.state.activeVideoTarget;
                    const tracked = this.state.trackedTargets.get(targetId);

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
                // Clean up tracking data for non-active targets to save memory
                for (const [targetId, tracked] of this.state.trackedTargets) {
                    if (targetId !== this.state.activeVideoTarget) {
                        if (tracked.lastFrame) tracked.lastFrame.delete();
                        this.state.trackedTargets.delete(targetId);
                        this.opticalFlow.resetTrackingState(targetId);
                    }
                }

                this.profiler.endTimer('optical_flow_tracking');
            }

            // Select best target for video display (center-priority with resistance)
            const selectedTargetId = this.selectBestTarget(
                trackingResults,
                frameToProcess.cols,
                frameToProcess.rows
            );

            // Render AR overlays (tracking + videos + camera background)
            if (this.arRenderer) {
                this.profiler.startTimer('ar_rendering');

                // Update video only for the selected target
                if (selectedTargetId) {
                    const selectedResult = trackingResults.find(r => r.targetId === selectedTargetId);
                    if (selectedResult && selectedResult.success && selectedResult.corners) {
                        const target = this.referenceManager.getTarget(selectedTargetId);
                        if (target && target.videoUrl) {
                            // Don't await - let it load asynchronously
                            this.arRenderer.updateTarget(
                                selectedTargetId,
                                selectedResult.corners,
                                target.videoUrl
                            ).catch(err => {
                                console.error('[ImageTracker] Video update error:', err);
                            });
                        }
                    }
                }

                // Render everything (camera background + rectangles + videos)
                // Pass processing frame for coordinate mapping
                // Video element is used directly via VideoTexture (no display frame needed)
                // Only render video for selected target
                this.arRenderer.render(trackingResults, frameToProcess, selectedTargetId);

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

