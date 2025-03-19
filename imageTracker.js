/**
 * WebAR Image Tracking Module
 * A modular system for detecting and tracking multiple reference images in a video stream.
 * Features best-in-class optical flow tracking for robust performance.
 * Supports multi-target tracking up to 20 targets.
 */

/**
 * Utility class with shared helper methods
 */
class Utils {
    /**
     * Checks if a point is inside a polygon using ray casting algorithm
     * @param {Array} corners - Array of corner points defining the polygon
     * @param {number} x - X coordinate of the point to check
     * @param {number} y - Y coordinate of the point to check
     * @returns {boolean} - True if the point is inside the polygon
     */
    static isPointInPolygon(corners, x, y) {
        let inside = false;
        for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
            const xi = corners[i].x;
            const yi = corners[i].y;
            const xj = corners[j].x;
            const yj = corners[j].y;
            
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    /**
     * Safely delete an OpenCV resource
     * @param {Object} resource - OpenCV resource to delete
     */
    static deleteResource(resource) {
        if (resource && typeof resource.delete === 'function') {
            try {
                resource.delete();
            } catch (e) {
                console.warn('Error deleting resource:', e);
            }
        }
    }
    
    /**
     * Generate a unique ID
     * @returns {string} - A unique identifier
     */
    static generateId() {
        return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    }
}

// Main application coordinator
class ImageTracker {
    constructor() {
        // Initialize state
        this.state = {
            isProcessing: false,
            isTracking: false,
            lastProcessingTime: 0,
            drawKeypoints: true,
            visualizeFlowPoints: true, // Visualize optical flow tracking points
            maxDimension: 640, // Maximum allowed dimension while preserving aspect ratio
            useOpticalFlow: true, // Enable optical flow tracking by default
            detectionInterval: 10, // Run full detection every N frames
            frameCount: 0, // Current frame counter
            maxFeatures: 100, // Maximum number of feature points to extract per frame
            goodMatchesThreshold: 0,
            
            // Multi-target tracking state
            detectedTargets: new Map(), // Map of targetId -> tracking data
            activeDetection: null, // Current active detection (targetId, corners, confidence)
        };

        // Initialize sub-modules
        this.ui = new UIManager(this);
        this.camera = new CameraManager();
        this.targetsManager = new TargetsManager(this.state);
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
            this.targetsManager.loadDefaultImage('reference.jpg');
            this.targetsManager.loadDefaultImage('reference2.png');
        }
    }

    initialize() {
        // Set up UI event listeners
        this.ui.setupEventListeners({
            onStartTracking: () => this.startTracking(),
            onStopTracking: () => this.stopTracking(),
            onReferenceImageLoad: (event) => this.targetsManager.loadFromFile(event),
            onTargetSelect: (targetId) => this.selectTarget(targetId),
            onTargetAdd: () => this.ui.showAddTargetDialog(),
            onTargetRemove: (targetId) => this.removeTarget(targetId)
        });
        
        // Initialize detector and optical flow tracker once OpenCV is ready
        this.detector = new FeatureDetector(this.state);
        this.opticalFlow = new OpticalFlowTracker(this.state);
    }

    /**
     * Select a target for viewing/editing
     * @param {string} targetId - ID of the target to select
     */
    selectTarget(targetId) {
        if (this.targetsManager.setActiveTarget(targetId)) {
            this.ui.updateTargetSelection(targetId);
            return true;
        }
        return false;
    }
    
    /**
     * Remove a target
     * @param {string} targetId - ID of the target to remove
     */
    removeTarget(targetId) {
        // Cannot remove last target
        if (this.targetsManager.getAllTargets().length <= 1) {
            this.ui.updateStatus('Cannot remove the last target.');
            return false;
        }
        
        // Remove target tracking data
        if (this.state.detectedTargets.has(targetId)) {
            const trackingData = this.state.detectedTargets.get(targetId);
            if (trackingData.lastFrame) {
                Utils.deleteResource(trackingData.lastFrame);
            }
            this.state.detectedTargets.delete(targetId);
            
            // If removed target was active detection, clear it
            if (this.state.activeDetection && this.state.activeDetection.targetId === targetId) {
                this.state.activeDetection = null;
            }
        }
        
        // Remove from manager
        if (this.targetsManager.removeTarget(targetId)) {
            // Update UI
            this.ui.refreshTargetsList();
            this.ui.updateStatus(`Target removed.`);
            return true;
        }
        
        return false;
    }

    async startTracking() {
        if (this.state.isTracking) return;
        
        // Check if we have any targets to track
        if (!this.targetsManager.hasLoadedTargets()) {
            this.ui.updateStatus('Please load at least one reference image first.');
            return;
        }
        
        this.ui.updateStatus('Starting tracking...');
        
        try {
            // Start camera
            await this.camera.start();
            
            // Update UI
            this.ui.updateControlsForTracking(true);
            
            // Set tracking state
            this.state.isTracking = true;
            
            // Clear any previous tracking data
            this.resetTrackingData();
            
            // Verify OpenCV is fully initialized
            if (this.ensureOpenCVReady()) {
                this.processVideo();
            }
        } catch (error) {
            this.ui.updateStatus(`Error starting tracking: ${error.message}`);
            console.error(error);
        }
    }
    
    /**
     * Reset tracking data for all targets
     */
    resetTrackingData() {
        // Clear any existing tracking data
        this.state.detectedTargets.forEach(data => {
            if (data.lastFrame) {
                Utils.deleteResource(data.lastFrame);
            }
        });
        
        // Reset tracking maps
        this.state.detectedTargets = new Map();
        this.state.activeDetection = null;
        this.state.frameCount = 0;
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
        
        // Clean up all tracking resources
        this.resetTrackingData();
        
        // Clean up feature detector cache
        if (this.detector) {
            this.detector.cleanup();
        }
        
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
            
            // Main tracking result to visualize
            let mainTrackingResult = { success: false };
            
            // Track all active targets with periodic full detection
            const shouldRunDetector = this.state.frameCount % this.state.detectionInterval === 0;
            
            if (shouldRunDetector || !this.state.activeDetection) {
                // Run full detection for all targets
                const activeTargets = this.targetsManager.getActiveTargets();
                let bestMatch = null;
                
                // Check each target for a match
                for (const target of activeTargets) {
                    if (!target.isProcessed) continue;
                    
                    // Get existing tracking data or create new entry
                    let trackingData = this.getTrackingDataForTarget(target.id);
                    
                    // Try detection for this target
                    const result = this.detector.detectAndMatch(frameToProcess, target.getData());
                    
                    // If detection successful, update tracking data
                    if (result.success && result.corners) {
                        trackingData.lastDetectionResult = result;
                        trackingData.lastDetectionTime = this.state.frameCount;
                        
                        // Clean up previous frame
                        if (trackingData.lastFrame) {
                            Utils.deleteResource(trackingData.lastFrame);
                        }
                        
                        // Store frame and corners for future optical flow
                        trackingData.lastFrame = frameToProcess.clone();
                        trackingData.lastCorners = result.corners.slice();
                        
                        // Determine if this is the best match (by number of matches)
                        const matchQuality = result.goodMatches ? result.goodMatches.size() : 0;
                        
                        if (!bestMatch || matchQuality > bestMatch.quality) {
                            bestMatch = {
                                targetId: target.id,
                                quality: matchQuality,
                                result: result
                            };
                        }
                    }
                }
                
                // Use the best match as the active detection
                if (bestMatch) {
                    this.state.activeDetection = {
                        targetId: bestMatch.targetId,
                        corners: bestMatch.result.corners.slice(),
                        quality: bestMatch.quality,
                        lastUpdatedFrame: this.state.frameCount
                    };
                    mainTrackingResult = bestMatch.result;
                    
                    // Update UI to show which target was detected
                    const detectedTarget = this.targetsManager.getTargetById(bestMatch.targetId);
                    if (detectedTarget) {
                        this.ui.updateDetectionStatus(detectedTarget.name, bestMatch.quality);
                    }
                }
                // Try optical flow for the active detection if available
                else if (this.state.activeDetection && this.state.useOpticalFlow) {
                    const activeId = this.state.activeDetection.targetId;
                    const trackingData = this.state.detectedTargets.get(activeId);
                    
                    if (trackingData && trackingData.lastFrame && trackingData.lastCorners) {
                        // Run optical flow tracking
                        const result = this.opticalFlow.track(
                            trackingData.lastFrame,
                            frameToProcess,
                            trackingData.lastCorners
                        );
                        
                        // If successful, update tracking data
                        if (result.success) {
                            // Clean up previous frame
                            Utils.deleteResource(trackingData.lastFrame);
                            
                            // Update with new frame and corners
                            trackingData.lastFrame = frameToProcess.clone();
                            trackingData.lastCorners = result.corners.slice();
                            
                            // Update active detection
                            this.state.activeDetection.corners = result.corners.slice();
                            this.state.activeDetection.lastUpdatedFrame = this.state.frameCount;
                            
                            // Use this result for visualization
                            mainTrackingResult = result;
                            
                            // Store feature points for visualization
                            if (this.state.visualizeFlowPoints) {
                                trackingData.featurePoints = result.nextFeaturePoints;
                                trackingData.flowStatus = result.flowStatus;
                            }
                        }
                        // If optical flow failed, clear active detection
                        else {
                            this.state.activeDetection = null;
                        }
                    }
                }
            } 
            // Use optical flow for tracking existing detection
            else if (this.state.activeDetection && this.state.useOpticalFlow) {
                const activeId = this.state.activeDetection.targetId;
                const trackingData = this.state.detectedTargets.get(activeId);
                
                if (trackingData && trackingData.lastFrame && trackingData.lastCorners) {
                    // Run optical flow tracking
                    const result = this.opticalFlow.track(
                        trackingData.lastFrame,
                        frameToProcess,
                        trackingData.lastCorners
                    );
                    
                    // If successful, update tracking data
                    if (result.success) {
                        // Clean up previous frame
                        Utils.deleteResource(trackingData.lastFrame);
                        
                        // Update with new frame and corners
                        trackingData.lastFrame = frameToProcess.clone();
                        trackingData.lastCorners = result.corners.slice();
                        
                        // Update active detection
                        this.state.activeDetection.corners = result.corners.slice();
                        this.state.activeDetection.lastUpdatedFrame = this.state.frameCount;
                        
                        // Use this result for visualization
                        mainTrackingResult = result;
                        
                        // Store feature points for visualization
                        if (this.state.visualizeFlowPoints) {
                            trackingData.featurePoints = result.nextFeaturePoints;
                            trackingData.flowStatus = result.flowStatus;
                        }
                    } 
                    // If optical flow fails, force a full detection on next frame
                    else {
                        this.state.frameCount = this.state.detectionInterval - 1;
                    }
                }
            }
            
            // If we have an active detection, enhance the tracking result for visualization
            if (this.state.activeDetection) {
                mainTrackingResult.success = true;
                mainTrackingResult.corners = this.state.activeDetection.corners;
                
                // Add feature points if available
                const trackingData = this.state.detectedTargets.get(this.state.activeDetection.targetId);
                if (trackingData && trackingData.featurePoints) {
                    mainTrackingResult.featurePoints = trackingData.featurePoints;
                    mainTrackingResult.flowStatus = trackingData.flowStatus;
                }
            }
            
            // Visualize results
            let targetName = '';
            if (this.state.activeDetection && this.state.activeDetection.targetId) {
                const detectedTarget = this.targetsManager.getTargetById(this.state.activeDetection.targetId);
                if (detectedTarget) {
                    targetName = detectedTarget.name;
                }
            }
            
            this.visualizer.renderResults(
                frameToProcess,
                mainTrackingResult,
                this.ui.canvas,
                this.state.drawKeypoints,
                this.state.visualizeFlowPoints && mainTrackingResult.nextFeaturePoints ? 
                    mainTrackingResult.nextFeaturePoints : null,
                mainTrackingResult.flowStatus,
                targetName
            );
            
            // Update tracking mode indicator
            this.ui.updateTrackingMode();
        } catch (error) {
            console.error('Error in processVideo:', error);
        } finally {
            // Clean up resources
            let shouldDeleteFrame = true;
            
            // Check if frame was stored in any tracking data
            if (this.state.detectedTargets.size > 0) {
                for (const data of this.state.detectedTargets.values()) {
                    if (data.lastFrame === frameToProcess) {
                        shouldDeleteFrame = false;
                        break;
                    }
                }
            }
            
            // Delete frame if not stored
            if (shouldDeleteFrame && frameToProcess) {
                Utils.deleteResource(frameToProcess);
            }
            
            // Mark processing as complete
            this.state.isProcessing = false;
        }
    }
    
    /**
     * Get or create tracking data for a target
     * @param {string} targetId - Target ID
     * @returns {Object} - Tracking data for the target
     */
    getTrackingDataForTarget(targetId) {
        if (!this.state.detectedTargets.has(targetId)) {
            this.state.detectedTargets.set(targetId, {
                lastFrame: null,
                lastCorners: null,
                lastDetectionResult: null,
                lastDetectionTime: 0,
                featurePoints: null,
                flowStatus: null
            });
        }
        
        return this.state.detectedTargets.get(targetId);
    }
}

/**
 * Manages the user interface elements and interactions
 */
class UIManager {
    constructor(tracker) {
        this.tracker = tracker;
        
        // DOM elements
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.startButton = document.getElementById('startTracking');
        this.stopButton = document.getElementById('stopTracking');
        this.fileInput = document.getElementById('referenceImage');
        this.statusMessage = document.getElementById('statusMessage');
        this.currentMode = document.getElementById('currentMode');
        this.useOpticalFlow = document.getElementById('useOpticalFlow');
        this.detectionInterval = document.getElementById('detectionInterval');
        this.intervalValue = document.getElementById('intervalValue');
        this.visualizeFlowPoints = document.getElementById('visualizeFlowPoints');
        this.maxFeatures = document.getElementById('maxFeatures');
        this.maxFeaturesValue = document.getElementById('maxFeaturesValue');
        this.targetsContainer = document.getElementById('targetsContainer');
        this.addTargetButton = document.getElementById('addTarget');
        this.currentDetection = document.getElementById('currentDetection');
        
        // Create targets container if it doesn't exist
        this.createTargetsContainerIfNeeded();
        
        // Initial UI state
        this.stopButton.disabled = true;
        this.useOpticalFlow.checked = tracker.state.useOpticalFlow;
        this.detectionInterval.value = tracker.state.detectionInterval;
        this.intervalValue.textContent = tracker.state.detectionInterval;
        this.visualizeFlowPoints.checked = tracker.state.visualizeFlowPoints;
        if (this.maxFeatures) {
            this.maxFeatures.value = tracker.state.maxFeatures;
            this.maxFeaturesValue.textContent = tracker.state.maxFeatures;
        }
        this.currentMode.textContent = 'Waiting for reference image';
        
        // Make elements accessible to other modules that need them
        this.elements = {
            video: this.video,
            canvas: this.canvas,
            startButton: this.startButton,
            stopButton: this.stopButton,
            fileInput: this.fileInput,
            statusMessage: this.statusMessage,
            currentMode: this.currentMode
        };
        
        // Initialize the targets list with a small delay to ensure DOM is ready
        setTimeout(() => this.refreshTargetsList(), 500);
    }
    
    /**
     * Create the targets container and add target button if they don't exist
     */
    createTargetsContainerIfNeeded() {
        // If targets container doesn't exist, create it
        if (!this.targetsContainer) {
            // Create targets section
            const controlsSection = document.querySelector('.controls');
            
            if (controlsSection) {
                // Create targets container
                const targetsSection = document.createElement('div');
                targetsSection.className = 'targets-section';
                targetsSection.innerHTML = `
                    <h3>Tracking Targets</h3>
                    <div id="targetsContainer" class="targets-container"></div>
                    <button id="addTarget" class="add-target-button">Add New Target</button>
                `;
                
                // Insert after the existing controls
                controlsSection.parentNode.insertBefore(targetsSection, controlsSection.nextSibling);
                
                // Update references
                this.targetsContainer = document.getElementById('targetsContainer');
                this.addTargetButton = document.getElementById('addTarget');
            }
        }
        
        // If current detection element doesn't exist, create it
        if (!this.currentDetection) {
            const statusSection = document.querySelector('.status');
            
            if (statusSection) {
                const detectionStatus = document.createElement('p');
                detectionStatus.id = 'currentDetection';
                detectionStatus.textContent = 'No target detected';
                
                statusSection.appendChild(detectionStatus);
                
                // Update reference
                this.currentDetection = document.getElementById('currentDetection');
            }
        }
    }
    
    setupEventListeners(handlers) {
        const { 
            onStartTracking, 
            onStopTracking, 
            onReferenceImageLoad,
            onTargetSelect,
            onTargetAdd,
            onTargetRemove
        } = handlers;
        
        this.startButton.addEventListener('click', () => {
            if (this.tracker.targetsManager.hasLoadedTargets()) {
                onStartTracking();
            } else {
                this.updateStatus('Please upload at least one reference image first.');
            }
        });
        
        this.stopButton.addEventListener('click', onStopTracking);
        this.fileInput.addEventListener('change', onReferenceImageLoad);
        
        // Set up optical flow UI interactions
        this.useOpticalFlow.addEventListener('change', () => {
            this.tracker.state.useOpticalFlow = this.useOpticalFlow.checked;
            this.updateTrackingMode();
        });
        
        this.detectionInterval.addEventListener('input', () => {
            const value = parseInt(this.detectionInterval.value);
            this.tracker.state.detectionInterval = value;
            this.intervalValue.textContent = value;
        });
        
        // Set up visualization options
        this.visualizeFlowPoints.addEventListener('change', () => {
            this.tracker.state.visualizeFlowPoints = this.visualizeFlowPoints.checked;
        });
        
        // Set up max features slider
        if (this.maxFeatures) {
            this.maxFeatures.addEventListener('input', () => {
                const value = parseInt(this.maxFeatures.value);
                this.tracker.state.maxFeatures = value;
                this.maxFeaturesValue.textContent = value;
            });
        }
        
        // Set up targets UI interactions
        if (this.addTargetButton) {
            this.addTargetButton.addEventListener('click', onTargetAdd);
        }
        
        // Initialize the targets list
        this.refreshTargetsList();
    }
    
    /**
     * Refresh the targets list UI
     */
    refreshTargetsList() {
        if (!this.targetsContainer) return;
        
        // Clear current list
        this.targetsContainer.innerHTML = '';
        
        // Get all targets
        const targets = this.tracker.targetsManager.getAllTargets();
        
        if (targets.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-targets';
            emptyMessage.textContent = 'No targets added. Upload a reference image to get started.';
            this.targetsContainer.appendChild(emptyMessage);
            return;
        }
        
        // Create target elements
        targets.forEach(target => {
            const targetElement = document.createElement('div');
            targetElement.className = 'target-item';
            targetElement.dataset.targetId = target.id;
            
            if (this.tracker.targetsManager.activeTarget === target) {
                targetElement.classList.add('active');
            }
            
            // Create thumbnail if available
            let thumbnailHtml = '';
            if (target.thumbnail) {
                thumbnailHtml = `<img src="${target.thumbnail}" alt="${target.name}" class="target-thumbnail">`;
            } else {
                thumbnailHtml = '<div class="target-thumbnail placeholder"></div>';
            }
            
            targetElement.innerHTML = `
                ${thumbnailHtml}
                <div class="target-info">
                    <div class="target-name">${target.name}</div>
                    <div class="target-features">${target.keypoints ? target.keypoints.size() : 0} features</div>
                </div>
                <div class="target-actions">
                    <button class="target-remove" data-target-id="${target.id}">×</button>
                </div>
            `;
            
            // Add event listeners
            targetElement.addEventListener('click', (e) => {
                // Don't trigger if clicked on remove button
                if (e.target.closest('.target-remove')) return;
                
                // Select this target
                const targetId = targetElement.dataset.targetId;
                this.tracker.selectTarget(targetId);
            });
            
            const removeButton = targetElement.querySelector('.target-remove');
            if (removeButton) {
                removeButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const targetId = removeButton.dataset.targetId;
                    if (confirm(`Are you sure you want to remove the target "${target.name}"?`)) {
                        this.tracker.removeTarget(targetId);
                    }
                });
            }
            
            this.targetsContainer.appendChild(targetElement);
        });
        
        // Update button state
        if (this.addTargetButton) {
            this.addTargetButton.disabled = this.tracker.targetsManager.isAtMaxCapacity();
        }
    }
    
    /**
     * Update the UI to reflect the selected target
     * @param {string} targetId - ID of the selected target 
     */
    updateTargetSelection(targetId) {
        if (!this.targetsContainer) return;
        
        // Remove active class from all targets
        const targetElements = this.targetsContainer.querySelectorAll('.target-item');
        targetElements.forEach(el => el.classList.remove('active'));
        
        // Add active class to selected target
        const selectedElement = this.targetsContainer.querySelector(`.target-item[data-target-id="${targetId}"]`);
        if (selectedElement) {
            selectedElement.classList.add('active');
        }
    }
    
    /**
     * Show dialog to add a new target
     */
    showAddTargetDialog() {
        // Check if we're at max capacity
        if (this.tracker.targetsManager.isAtMaxCapacity()) {
            this.updateStatus(`Cannot add more than ${this.tracker.targetsManager.MAX_TARGETS} targets.`);
            return;
        }
        
        // Simulate a click on the file input
        this.fileInput.click();
    }
    
    /**
     * Update status of current detection
     * @param {string} targetName - Name of the detected target
     * @param {number} confidence - Confidence score of the detection
     */
    updateDetectionStatus(targetName, confidence) {
        if (!this.currentDetection) return;
        
        this.currentDetection.textContent = `Detected: ${targetName} (${confidence} matches)`;
        this.currentDetection.style.color = '#00c853';
        
        // Reset color after a short time
        setTimeout(() => {
            if (this.currentDetection) {
                this.currentDetection.style.color = '';
            }
        }, 1000);
    }
    
    updateControlsForTracking(isTracking) {
        this.startButton.disabled = isTracking;
        this.stopButton.disabled = !isTracking;
        this.fileInput.disabled = isTracking;
        
        // Disable target management during tracking
        if (this.addTargetButton) {
            this.addTargetButton.disabled = isTracking;
        }
        
        // Disable target removal during tracking
        const removeButtons = document.querySelectorAll('.target-remove');
        removeButtons.forEach(button => {
            button.disabled = isTracking;
        });
        
        if (isTracking) {
            this.updateTrackingMode('Initializing tracking...');
            if (this.currentDetection) {
                this.currentDetection.textContent = 'Searching for targets...';
            }
        } else {
            this.updateTrackingMode('Tracking stopped');
            if (this.currentDetection) {
                this.currentDetection.textContent = 'No target detected';
            }
        }
    }
    
    updateStatus(message) {
        this.statusMessage.textContent = message;
    }
    
    updateTrackingMode(forcedMessage = null) {
        if (forcedMessage) {
            this.currentMode.textContent = forcedMessage;
            return;
        }
        
        if (!this.tracker.state.isTracking) {
            this.currentMode.textContent = 'Tracking stopped';
            return;
        }
        
        // Show current tracking mode
        if (this.tracker.state.useOpticalFlow) {
            if (this.tracker.state.frameCount % this.tracker.state.detectionInterval === 0) {
                this.currentMode.textContent = 'Feature detection (periodic refresh)';
            } else {
                this.currentMode.textContent = `Optical flow (${this.tracker.state.detectionInterval - (this.tracker.state.frameCount % this.tracker.state.detectionInterval)} frames until refresh)`;
            }
        } else {
            this.currentMode.textContent = 'Feature detection only (optical flow disabled)';
        }
    }
}

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
                width: { ideal: 640 },
                height: { ideal: 480 },
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
                    
                    // Set canvas dimensions to match video
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    
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
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
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
                
                // Update canvas dimensions to match the new frame size
                this.canvas.width = newSize.width;
                this.canvas.height = newSize.height;
                
                frame.delete();
                frame = resizedFrame;
            }
            
            return frame;
        } catch (error) {
            console.error("Error capturing video frame:", error);
            return null;
        }
    }
}

/**
 * Manages reference image loading and processing
 */
/**
 * Represents a single target for tracking
 */
class ReferenceTarget {
    constructor(id, name) {
        this.id = id || Utils.generateId();
        this.name = name || `Target ${this.id.substring(0, 4)}`;
        this.reset();
        this.isActive = true;
    }
    
    reset() {
        // OpenCV resources
        this.image = null;
        this.imageGray = null;
        this.keypoints = null;
        this.descriptors = null;
        this.thumbnail = null;
        this.isProcessed = false;
    }
    
    isLoaded() {
        return this.image !== null;
    }
    
    getData() {
        return {
            id: this.id,
            name: this.name,
            image: this.image,
            imageGray: this.imageGray,
            keypoints: this.keypoints,
            descriptors: this.descriptors,
            isActive: this.isActive
        };
    }
    
    cleanup() {
        // Clean up OpenCV resources using Utils helper
        [this.image, this.imageGray, this.keypoints, this.descriptors].forEach(
            resource => Utils.deleteResource(resource)
        );
        
        // Reset references
        this.reset();
    }
}

/**
 * Manages multiple reference images for tracking
 */
class TargetsManager {
    constructor(state) {
        this.targets = [];
        this.activeTarget = null;
        this.state = state;
        this.ui = document.getElementById('statusMessage');
        this.MAX_TARGETS = 20;
    }
    
    /**
     * Get all targets
     * @returns {Array} - Array of target objects
     */
    getAllTargets() {
        return this.targets;
    }
    
    /**
     * Get only active targets
     * @returns {Array} - Array of active target objects
     */
    getActiveTargets() {
        // Return all processed targets, regardless of isActive state
        return this.targets.filter(target => target.isProcessed);
    }
    
    /**
     * Get a target by ID
     * @param {string} id - Target ID
     * @returns {ReferenceTarget} - Target object or null if not found
     */
    getTargetById(id) {
        return this.targets.find(target => target.id === id);
    }
    
    /**
     * Add a new target
     * @param {string} name - Optional name for the target
     * @returns {ReferenceTarget} - The newly created target
     */
    addTarget(name) {
        if (this.targets.length >= this.MAX_TARGETS) {
            this.updateStatus(`Cannot add more than ${this.MAX_TARGETS} targets.`);
            return null;
        }
        
        const target = new ReferenceTarget(null, name);
        this.targets.push(target);
        this.activeTarget = target;
        
        return target;
    }
    
    /**
     * Remove a target by ID
     * @param {string} id - Target ID to remove
     * @returns {boolean} - True if target was removed
     */
    removeTarget(id) {
        const targetIndex = this.targets.findIndex(target => target.id === id);
        
        if (targetIndex >= 0) {
            // Clean up target resources
            this.targets[targetIndex].cleanup();
            
            // Remove from array
            this.targets.splice(targetIndex, 1);
            
            // Update active target if needed
            if (this.activeTarget && this.activeTarget.id === id) {
                this.activeTarget = this.targets.length > 0 ? this.targets[0] : null;
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Set a target as active by ID
     * @param {string} id - Target ID
     * @returns {boolean} - True if target was set as active
     */
    setActiveTarget(id) {
        const target = this.getTargetById(id);
        
        if (target) {
            // Just update the UI reference, but don't change tracking state
            this.activeTarget = target;
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if any targets are loaded
     * @returns {boolean} - True if at least one target is loaded
     */
    hasLoadedTargets() {
        return this.targets.some(target => target.isLoaded());
    }
    
    /**
     * Check if max targets limit is reached
     * @returns {boolean} - True if at maximum capacity
     */
    isAtMaxCapacity() {
        return this.targets.length >= this.MAX_TARGETS;
    }
    
    /**
     * Load default reference image 
     */
    async loadDefaultImage(src) {
        this.updateStatus('Loading default reference image...');
        
        try {
            const img = new Image();
            
            // Wait for image to load
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Failed to load reference.jpg'));
                img.src = src;
            });
            
            // Create a default target
            const target = this.addTarget('Default');
            if (!target) {
                throw new Error('Could not create target');
            }
            
            // Process the reference image
            await this.processImage(img, target, { 
                briskThreshold: 50,
                autoStart: true
            });
            
        } catch (error) {
            this.updateStatus(`Error loading reference image: ${error.message}`);
            console.error(error);
        }
    }
    
    /**
     * Load a target from a file input event
     * @param {Event} event - File input event
     * @param {string} targetName - Optional name for the target
     */
    async loadFromFile(event, targetName) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.updateStatus('Loading reference image...');
        
        // Generate a name from the file name if not provided
        if (!targetName) {
            targetName = file.name.split('.')[0];
        }
        
        try {
            // Check if we're at max capacity
            if (this.isAtMaxCapacity()) {
                this.updateStatus(`Cannot add more than ${this.MAX_TARGETS} targets.`);
                return;
            }
            
            // Create a new target
            const target = this.addTarget(targetName);
            
            // Read the file and convert to image element
            const imageUrl = URL.createObjectURL(file);
            const img = new Image();
            
            // Wait for image to load
            await new Promise((resolve) => {
                img.onload = resolve;
                img.src = imageUrl;
            });
            
            // Process the reference image
            const success = await this.processImage(img, target, { 
                briskThreshold: 60
            });
            
            if (success) {
                // Enable start button
                document.getElementById('startTracking').disabled = false;
                
                // Update the UI to reflect the new target
                // Find UIManager instance to refresh the targets list
                if (window.imageTrackerInstance && window.imageTrackerInstance.ui) {
                    window.imageTrackerInstance.ui.refreshTargetsList();
                    if (target.id) {
                        window.imageTrackerInstance.ui.updateTargetSelection(target.id);
                    }
                } else {
                    // Try to find the targets container and refresh it manually
                    const targetsContainer = document.getElementById('targetsContainer');
                    if (targetsContainer) {
                        const event = new CustomEvent('refreshTargets');
                        document.dispatchEvent(event);
                    }
                }
            }
            
            // Clean up URL object
            URL.revokeObjectURL(imageUrl);
        } catch (error) {
            this.updateStatus(`Error loading reference image: ${error.message}`);
            console.error(error);
        }
    }
    
    /**
     * Process an image and update the target with extracted features
     * @param {Image} img - Image element to process
     * @param {ReferenceTarget} target - Target to update
     * @param {Object} options - Processing options
     * @returns {boolean} - True if processing was successful
     */
    async processImage(img, target, options = {}) {
        // Use maxFeatures from state if available
        const maxFeaturesDefault = this.state ? this.state.maxFeatures : 500;
        const { maxFeatures = maxFeaturesDefault, briskThreshold = 50, autoStart = false } = options;
        
        if (!target) {
            console.error('No target provided for processing');
            return false;
        }
        
        try {
            // Clean up previous resources
            target.cleanup();
            
            // Convert to OpenCV format
            target.image = cv.imread(img);
            
            // Create a thumbnail of the image for UI display
            this.createThumbnail(img, target);
            
            // Convert to grayscale for feature detection
            target.imageGray = new cv.Mat();
            cv.cvtColor(target.image, target.imageGray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(target.imageGray, target.imageGray, new cv.Size(3, 3), 0);
            cv.equalizeHist(target.imageGray, target.imageGray);
            
            // Extract features using BRISK
            const detector = new cv.BRISK(briskThreshold, 3, 1.0);
            
            const keypoints = new cv.KeyPointVector();
            const descriptors = new cv.Mat();
            
            detector.detect(target.imageGray, keypoints);
            detector.compute(target.imageGray, keypoints, descriptors);
            
            // Process keypoints to get the strongest ones
            let keypointsArray = [];
            for (let i = 0; i < keypoints.size(); i++) {
                keypointsArray.push(keypoints.get(i));
            }
            
            // Sort by strength and limit to max features
            keypointsArray.sort((a, b) => b.response - a.response);
            if (keypointsArray.length > maxFeatures) {
                keypointsArray = keypointsArray.slice(0, maxFeatures);
            }
            
            // Create filtered keypoints vector
            target.keypoints = new cv.KeyPointVector();
            for (let kp of keypointsArray) {
                target.keypoints.push_back(kp);
            }
            
            // Compute descriptors for selected keypoints
            target.descriptors = new cv.Mat();
            detector.compute(target.imageGray, target.keypoints, target.descriptors);
            
            // Clean up detector
            detector.delete();
            keypoints.delete();
            descriptors.delete();
            
            // Mark as processed
            target.isProcessed = true;
            
            // Update status
            this.updateStatus(`Target "${target.name}" loaded. Found ${target.keypoints.size()} features.`);
            
            // Auto start tracking if requested
            if (autoStart) {
                const tracker = document.querySelector('#startTracking');
                if (tracker) {
                    setTimeout(() => tracker.click(), 500);
                }
            }
            
            return true;
        } catch (error) {
            this.updateStatus(`Error processing target "${target.name}": ${error.message}`);
            console.error(error);
            return false;
        }
    }
    
    /**
     * Create a thumbnail for UI display
     * @param {Image} img - Source image
     * @param {ReferenceTarget} target - Target to store thumbnail
     */
    createThumbnail(img, target) {
        try {
            // Create a small canvas for the thumbnail
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Calculate thumbnail size (max 100px)
            const maxThumbSize = 100;
            const aspectRatio = img.width / img.height;
            let thumbWidth, thumbHeight;
            
            if (aspectRatio > 1) {
                thumbWidth = maxThumbSize;
                thumbHeight = maxThumbSize / aspectRatio;
            } else {
                thumbHeight = maxThumbSize;
                thumbWidth = maxThumbSize * aspectRatio;
            }
            
            canvas.width = thumbWidth;
            canvas.height = thumbHeight;
            
            // Draw the image at the thumbnail size
            ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
            
            // Store the thumbnail as data URL
            target.thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        } catch (error) {
            console.warn('Error creating thumbnail:', error);
        }
    }
    
    /**
     * Clean up all resources
     */
    cleanup() {
        this.targets.forEach(target => target.cleanup());
        this.targets = [];
        this.activeTarget = null;
    }
    
    updateStatus(message) {
        if (this.ui) {
            this.ui.textContent = message;
        }
    }
}

/**
 * Handles feature detection and matching
 */
class FeatureDetector {
    constructor(state) {
        this.detector = new cv.BRISK(50, 3, 1.0);
        this.state = state;
        this.cachedFrameKeypoints = null;
        this.cachedFrameDescriptors = null;
        this.lastFrameId = null;
    }
    
    // Cleanup cached resources
    cleanup() {
        if (this.cachedFrameKeypoints) {
            Utils.deleteResource(this.cachedFrameKeypoints);
            this.cachedFrameKeypoints = null;
        }
        
        if (this.cachedFrameDescriptors) {
            Utils.deleteResource(this.cachedFrameDescriptors);
            this.cachedFrameDescriptors = null;
        }
        
        this.lastFrameId = null;
    }
    
    /**
     * Detect features in a frame and match against a reference target
     * @param {Mat} frame - Current video frame
     * @param {Object} referenceData - Target reference data
     * @returns {Object} - Matching result
     */
    detectAndMatch(frame, referenceData) {
        if (!frame || frame.empty()) {
            return { success: false, reason: 'Empty frame' };
        }
        
        if (!referenceData || !referenceData.keypoints || !referenceData.descriptors) {
            return { success: false, reason: 'Reference data not available' };
        }
        
        const result = {
            success: false,
            keypoints: null,
            matches: null,
            goodMatches: null,
            homography: null,
            corners: null,
            targetId: referenceData.id // Include target ID in the result
        };
        
        // Resources to clean up
        let frameGray = null;
        let frameKeypoints = null;
        let frameDescriptors = null;
        let matcher = null;
        let matches = null;
        let goodMatches = null;
        let homography = null;
        let refPointsMat = null;
        let framePointsMat = null;
        let cornerPoints = null;
        let transformedCorners = null;
        let shouldCleanupFrameFeatures = false;
        
        try {
            // For multi-target detection in the same frame, reuse the detected features
            // Generate a unique ID for the frame based on its data pointer
            const currentFrameId = frame.data ? frame.data.toString() : null;
            
            if (currentFrameId && currentFrameId === this.lastFrameId && 
                this.cachedFrameKeypoints && this.cachedFrameDescriptors) {
                // Reuse cached frame features
                frameKeypoints = this.cachedFrameKeypoints;
                frameDescriptors = this.cachedFrameDescriptors;
            } else {
                // Convert frame to grayscale
                frameGray = new cv.Mat();
                cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);
                
                // Detect features
                frameKeypoints = new cv.KeyPointVector();
                frameDescriptors = new cv.Mat();
                
                this.detector.detect(frameGray, frameKeypoints);
                
                // Limit the number of feature points to prevent lagging
                if (frameKeypoints.size() > 0) {
                    // Extract keypoints to array for sorting
                    let keypointsArray = [];
                    for (let i = 0; i < frameKeypoints.size(); i++) {
                        keypointsArray.push(frameKeypoints.get(i));
                    }
                    
                    // Sort by response strength and limit to max features from state
                    keypointsArray.sort((a, b) => b.response - a.response);
                    const maxFeatures = this.state ? this.state.maxFeatures : 500;
                    if (keypointsArray.length > maxFeatures) {
                        keypointsArray = keypointsArray.slice(0, maxFeatures);
                    }
                    
                    // Replace original keypoints with limited set
                    frameKeypoints.delete();
                    frameKeypoints = new cv.KeyPointVector();
                    for (let kp of keypointsArray) {
                        frameKeypoints.push_back(kp);
                    }
                    
                    // Compute descriptors on the limited set of keypoints
                    this.detector.compute(frameGray, frameKeypoints, frameDescriptors);
                }
                
                // Cache the features for future matches with different targets
                if (this.cachedFrameKeypoints) {
                    Utils.deleteResource(this.cachedFrameKeypoints);
                }
                if (this.cachedFrameDescriptors) {
                    Utils.deleteResource(this.cachedFrameDescriptors);
                }
                
                // Clone the features for caching
                this.cachedFrameKeypoints = new cv.KeyPointVector();
                for (let i = 0; i < frameKeypoints.size(); i++) {
                    this.cachedFrameKeypoints.push_back(frameKeypoints.get(i));
                }
                this.cachedFrameDescriptors = frameDescriptors.clone();
                this.lastFrameId = currentFrameId;
                
                // Don't delete frame features at the end since we're reusing them
                shouldCleanupFrameFeatures = false;
            }
            
            // Store detected keypoints in result
            result.keypoints = frameKeypoints;
            
            // Only proceed with matching if we have enough features
            if (frameKeypoints.size() > 10 && 
                referenceData.keypoints.size() > 10 && 
                frameDescriptors && !frameDescriptors.empty() && 
                referenceData.descriptors && !referenceData.descriptors.empty() &&
                frameDescriptors.rows > 0 && referenceData.descriptors.rows > 0 &&
                frameDescriptors.cols === referenceData.descriptors.cols) {
                
                // Match features using KNN
                matcher = new cv.BFMatcher(cv.NORM_HAMMING);
                let knnMatches = new cv.DMatchVectorVector();
                
                try {
                    // Try KNN matching with k=2 for Lowe's ratio test
                    matcher.knnMatch(referenceData.descriptors, frameDescriptors, knnMatches, 2);
                    
                    // Using Lowe's ratio test to filter matches
                    matches = new cv.DMatchVector(); // For visualization
                    goodMatches = new cv.DMatchVector(); // For homography
                    
                    // Apply Lowe's ratio test
                    const ratioThreshold = 0.7;
                    
                    for (let i = 0; i < knnMatches.size(); i++) {
                        try {
                            const matchPair = knnMatches.get(i);
                            
                            // First, add the best match to regular matches for visualization
                            if (matchPair.size() >= 1) {
                                const firstMatch = matchPair.get(0);
                                if (firstMatch) {
                                    matches.push_back(firstMatch);
                                }
                                
                                // Apply ratio test if we have two matches
                                if (matchPair.size() >= 2) {
                                    const secondMatch = matchPair.get(1);
                                    
                                    if (firstMatch && secondMatch && 
                                        typeof firstMatch.distance === 'number' && 
                                        typeof secondMatch.distance === 'number' &&
                                        !isNaN(firstMatch.distance) && !isNaN(secondMatch.distance) &&
                                        isFinite(firstMatch.distance) && isFinite(secondMatch.distance)) {
                                        
                                        // Apply Lowe's ratio test
                                        if (firstMatch.distance < ratioThreshold * secondMatch.distance) {
                                            goodMatches.push_back(firstMatch);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            // Skip problematic matches
                        }
                    }
                    
                    // Clean up KNN matches
                    knnMatches.delete();
                    
                } catch (e) {
                    console.error("Error in KNN matching:", e);
                    
                    // Fallback to regular matching if KNN fails
                    matches = new cv.DMatchVector();
                    matcher.match(referenceData.descriptors, frameDescriptors, matches);
                    
                    // Create a fallback goodMatches based on distance threshold
                    goodMatches = new cv.DMatchVector();
                    if (matches.size() > 0) {
                        const distances = [];
                        for (let i = 0; i < matches.size(); i++) {
                            try {
                                const match = matches.get(i);
                                if (match && typeof match.distance === 'number' && 
                                    !isNaN(match.distance) && isFinite(match.distance)) {
                                    distances.push(match.distance);
                                }
                            } catch (e) {}
                        }
                        
                        if (distances.length > 0) {
                            distances.sort((a, b) => a - b);
                            const threshold = Math.min(100, 3 * distances[0]);
                            
                            for (let i = 0; i < matches.size(); i++) {
                                try {
                                    const match = matches.get(i);
                                    if (match && typeof match.distance === 'number' && 
                                        match.distance <= threshold) {
                                        goodMatches.push_back(match);
                                    }
                                } catch (e) {}
                            }
                        }
                    }
                }
                
                // Store matches in result
                result.matches = matches;
                result.goodMatches = goodMatches;
                
                // Only proceed with homography if we have enough good matches
                if (goodMatches && goodMatches.size() >= this.state.goodMatchesThreshold) {
                    // Extract point pairs from matches
                    const referencePoints = [];
                    const framePoints = [];
                    
                    for (let i = 0; i < goodMatches.size(); i++) {
                        try {
                            const match = goodMatches.get(i);
                            
                            // Validate match indices
                            if (!match || typeof match.queryIdx !== 'number' || 
                                typeof match.trainIdx !== 'number') {
                                continue;
                            }
                            
                            // Ensure indices are in valid range
                            if (match.queryIdx < 0 || match.queryIdx >= referenceData.keypoints.size() ||
                                match.trainIdx < 0 || match.trainIdx >= frameKeypoints.size()) {
                                continue;
                            }
                            
                            // Get keypoints
                            const refKeypoint = referenceData.keypoints.get(match.queryIdx);
                            const frameKeypoint = frameKeypoints.get(match.trainIdx);
                            
                            // Validate keypoints and coordinates
                            if (!refKeypoint || !frameKeypoint || 
                                !refKeypoint.pt || !frameKeypoint.pt) {
                                continue;
                            }
                            
                            // Validate coordinate values
                            if (isNaN(refKeypoint.pt.x) || isNaN(refKeypoint.pt.y) ||
                                isNaN(frameKeypoint.pt.x) || isNaN(frameKeypoint.pt.y) ||
                                !isFinite(refKeypoint.pt.x) || !isFinite(refKeypoint.pt.y) ||
                                !isFinite(frameKeypoint.pt.x) || !isFinite(frameKeypoint.pt.y)) {
                                continue;
                            }
                            
                            // Add valid point pair
                            referencePoints.push(refKeypoint.pt.x, refKeypoint.pt.y);
                            framePoints.push(frameKeypoint.pt.x, frameKeypoint.pt.y);
                        } catch (e) {
                            // Skip problematic matches
                        }
                    }
                    
                    // Only continue if we have enough valid points for homography
                    if (referencePoints.length >= 16 && framePoints.length >= 16) {
                        // Create point matrices for homography calculation
                        refPointsMat = cv.matFromArray(referencePoints.length / 2, 1, cv.CV_32FC2, referencePoints);
                        framePointsMat = cv.matFromArray(framePoints.length / 2, 1, cv.CV_32FC2, framePoints);
                        
                        // Calculate homography matrix
                        homography = cv.findHomography(refPointsMat, framePointsMat, cv.RANSAC, 5.0);
                        result.homography = homography;
                        
                        // Only proceed if we got a valid homography
                        if (homography && !homography.empty()) {
                            // Set up corners of reference image for transformation
                            cornerPoints = new cv.Mat(4, 1, cv.CV_32FC2);
                            
                            // Make sure we can safely access the cornerData
                            if (cornerPoints.data32F && cornerPoints.data32F.length >= 8) {
                                const cornerData = cornerPoints.data32F;
                                
                                // Set reference image corners safely
                                cornerData[0] = 0;
                                cornerData[1] = 0;
                                cornerData[2] = referenceData.image.cols;
                                cornerData[3] = 0;
                                cornerData[4] = referenceData.image.cols;
                                cornerData[5] = referenceData.image.rows;
                                cornerData[6] = 0;
                                cornerData[7] = referenceData.image.rows;
                                
                                // Transform corners using homography
                                transformedCorners = new cv.Mat();
                                cv.perspectiveTransform(cornerPoints, transformedCorners, homography);
                                
                                // Store corners in result
                                if (transformedCorners && transformedCorners.data32F && 
                                    transformedCorners.data32F.length >= 8) {
                                    
                                    const corners = [];
                                    let validCorners = true;
                                    
                                    for (let i = 0; i < 4; i++) {
                                        const x = transformedCorners.data32F[i * 2];
                                        const y = transformedCorners.data32F[i * 2 + 1];
                                        
                                        if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
                                            validCorners = false;
                                            break;
                                        }
                                        
                                        corners.push(new cv.Point(x, y));
                                    }
                                    
                                    if (validCorners) {
                                        result.corners = corners;
                                        result.success = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            return result;
        } catch (e) {
            console.error("Error in feature detection and matching:", e);
            return { success: false, reason: e.message, targetId: referenceData.id };
        } finally {
            // Clean up OpenCV resources using Utils helper
            const resourcesToCleanup = [
                frameGray, matcher, 
                refPointsMat, framePointsMat, 
                cornerPoints, transformedCorners
            ];
            
            // Clean up frame features only if we're not caching them
            if (shouldCleanupFrameFeatures) {
                if (frameKeypoints && frameKeypoints !== this.cachedFrameKeypoints) {
                    resourcesToCleanup.push(frameKeypoints);
                }
                if (frameDescriptors && frameDescriptors !== this.cachedFrameDescriptors) {
                    resourcesToCleanup.push(frameDescriptors);
                }
            }
            
            // Clean up resources that aren't returned in the result object
            if (matches && result.matches !== matches) resourcesToCleanup.push(matches);
            if (goodMatches && result.goodMatches !== goodMatches) resourcesToCleanup.push(goodMatches);
            if (homography && result.homography !== homography) resourcesToCleanup.push(homography);
            
            resourcesToCleanup.forEach(resource => Utils.deleteResource(resource));
        }
    }
}

/**
 * Handles optical flow tracking between frames
 * Implements Lucas-Kanade sparse optical flow for efficient tracking
 */
class OpticalFlowTracker {
    constructor(state) {
        this.state = state;
        
        /**
         * Parameters for optical flow tracking
         * @property {cv.Size} winSize - Window size for optical flow calculation (30x30 is good for performance)
         * @property {number} maxLevel - Number of pyramid levels (3-5 is a good balance)
         * @property {cv.TermCriteria} criteria - Termination criteria for iterations
         * @property {number} minEigThreshold - Minimum eigenvalue threshold
         * @property {number} featureQualityLevel - Quality level for detecting feature points (lower is more points)
         * @property {number} featureMinDistance - Minimum distance between feature points
         * @property {number} ransacReprojThreshold - RANSAC reprojection threshold for homography
         */
        this.params = {
            winSize: new cv.Size(30, 30),
            maxLevel: 5,
            criteria: new cv.TermCriteria(
                cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 
                10, 
                0.03
            ),
            minEigThreshold: 0.001,
            featureQualityLevel: 0.01,
            featureMinDistance: 10,
            ransacReprojThreshold: 3.0
        };
    }
    
    track(prevFrame, currentFrame, prevCorners) {
        const result = {
            success: false,
            corners: null,
            flowStatus: null,
            trackingQuality: 0,
            featurePoints: null,
            prevFeaturePoints: null,
            nextFeaturePoints: null
        };
    
        if (!prevFrame || !currentFrame || !prevCorners || prevCorners.length !== 4) {
            return result;
        }
    
        let prevGray = new cv.Mat();
        let currentGray = new cv.Mat();
        cv.cvtColor(prevFrame, prevGray, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(currentFrame, currentGray, cv.COLOR_RGBA2GRAY);
    
        // Create a mask for feature detection inside the quadrilateral
        let prevMask = new cv.Mat.zeros(prevGray.rows, prevGray.cols, cv.CV_8UC1);
        let roiCorners = new cv.MatVector();
        let roi = new cv.Mat(4, 1, cv.CV_32SC2);
        for (let i = 0; i < 4; i++) {
            roi.data32S[i * 2] = Math.round(prevCorners[i].x);
            roi.data32S[i * 2 + 1] = Math.round(prevCorners[i].y);
        }
        roiCorners.push_back(roi);
        cv.fillPoly(prevMask, roiCorners, new cv.Scalar(255));
        roi.delete(); roiCorners.delete();
    
        // Detect good features inside the quadrilateral
        let featurePoints = new cv.Mat();
        cv.goodFeaturesToTrack(
            prevGray,
            featurePoints,
            this.state ? this.state.maxFeatures : 100,
            this.params.featureQualityLevel,
            this.params.featureMinDistance,
            prevMask
        );
    
        if (!featurePoints || featurePoints.rows < 8) {
            // Not enough points – return empty result
            prevGray.delete(); currentGray.delete(); prevMask.delete();
            featurePoints.delete();
            return result;
        }
    
        // Convert feature points to an array and store for visualization
        let pointsToTrack = [];
        for (let i = 0; i < featurePoints.rows; i++) {
            pointsToTrack.push(featurePoints.data32F[i * 2], featurePoints.data32F[i * 2 + 1]);
        }
        result.prevFeaturePoints = this.pointsArrayToPoints(pointsToTrack);
    
        // Create matrices for tracking
        let prevPoints = cv.matFromArray(featurePoints.rows, 1, cv.CV_32FC2, pointsToTrack);
        let nextPoints = new cv.Mat();
        let status = new cv.Mat();
        let err = new cv.Mat();
    
        // Forward optical flow: previous -> current
        cv.calcOpticalFlowPyrLK(
            prevGray, 
            currentGray, 
            prevPoints, 
            nextPoints, 
            status, 
            err, 
            this.params.winSize, 
            this.params.maxLevel, 
            this.params.criteria
        );
    
        // Backward optical flow: current -> previous
        let backPoints = new cv.Mat();
        let backStatus = new cv.Mat();
        let backErr = new cv.Mat();
        cv.calcOpticalFlowPyrLK(
            currentGray, 
            prevGray, 
            nextPoints, 
            backPoints, 
            backStatus, 
            backErr, 
            this.params.winSize, 
            this.params.maxLevel, 
            this.params.criteria
        );
    
        // Filter points by forward-backward error
        let fbThreshold = 1.0; // This threshold can be tuned
        let prevPtsFiltered = [];
        let nextPtsFiltered = [];
        let validCount = 0;
        let nextVisualPoints = [];
    
        for (let i = 0; i < status.rows; i++) {
            let forwardTracked = status.data[i] === 1;
            let backwardTracked = backStatus.data[i] === 1;
            if (forwardTracked && backwardTracked) {
                let dx = prevPoints.data32F[i*2] - backPoints.data32F[i*2];
                let dy = prevPoints.data32F[i*2+1] - backPoints.data32F[i*2+1];
                let fbError = Math.sqrt(dx*dx + dy*dy);
                if (fbError <= fbThreshold) {
                    prevPtsFiltered.push(prevPoints.data32F[i*2], prevPoints.data32F[i*2+1]);
                    nextPtsFiltered.push(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]);
                    validCount++;
                }
            }
            // Save all next points for visualization
            nextVisualPoints.push(new cv.Point(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]));
        }
        result.nextFeaturePoints = nextVisualPoints;
        result.flowStatus = new Uint8Array(status.data.slice());
    
        // Calculate tracking quality and only proceed if quality is sufficient
        let trackingQuality = validCount / status.rows;
        result.trackingQuality = trackingQuality;
        if (trackingQuality < 0.6 || prevPtsFiltered.length < 16) {
            // Not enough good points; do not update tracking.
            prevGray.delete(); currentGray.delete(); prevMask.delete();
            featurePoints.delete(); prevPoints.delete(); nextPoints.delete();
            status.delete(); err.delete();
            backPoints.delete(); backStatus.delete(); backErr.delete();
            return result;
        }
    
        // Compute homography based on filtered points
        let prevPointsMat = cv.matFromArray(prevPtsFiltered.length/2, 1, cv.CV_32FC2, prevPtsFiltered);
        let nextPointsMat = cv.matFromArray(nextPtsFiltered.length/2, 1, cv.CV_32FC2, nextPtsFiltered);
        let homography = cv.findHomography(prevPointsMat, nextPointsMat, cv.RANSAC, this.params.ransacReprojThreshold);
    
        // If homography is valid, transform the original corners
        if (homography && !homography.empty()) {
            let cornerPoints = new cv.Mat(4, 1, cv.CV_32FC2);
            for (let i = 0; i < 4; i++) {
                cornerPoints.data32F[i*2] = prevCorners[i].x;
                cornerPoints.data32F[i*2+1] = prevCorners[i].y;
            }
            let transformedCorners = new cv.Mat();
            cv.perspectiveTransform(cornerPoints, transformedCorners, homography);
            // Validate and extract transformed corners
            if (transformedCorners && transformedCorners.data32F && transformedCorners.data32F.length >= 8) {
                let corners = [];
                let validCorners = true;
                for (let i = 0; i < 4; i++) {
                    let x = transformedCorners.data32F[i * 2];
                    let y = transformedCorners.data32F[i * 2 + 1];
                    if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
                        validCorners = false;
                        break;
                    }
                    corners.push(new cv.Point(x, y));
                }
                if (validCorners && this.isValidQuadrilateral(corners)) {
                    result.corners = corners;
                    result.success = true;
                }
            }
            cornerPoints.delete(); transformedCorners.delete();
        }
    
        // Clean up all resources using the Utils helper
        const resources = [
            prevGray, currentGray, prevMask, featurePoints, 
            prevPoints, nextPoints, status, err, 
            backPoints, backStatus, backErr, 
            prevPointsMat, nextPointsMat, homography
        ];
        
        resources.forEach(resource => Utils.deleteResource(resource));
    
        return result;
    }
    
    // Generate additional tracking points inside the quadrilateral for better tracking
    generatePointsInsideQuad(corners, pointCount) {
        const points = [];
        if (!corners || corners.length !== 4) return points;
        
        try {
            // Get bounds of the quadrilateral
            const xs = corners.map(c => c.x);
            const ys = corners.map(c => c.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            
            // Instead of random points, generate a grid of points
            // This is more deterministic and avoids random number generation issues
            const stepX = (maxX - minX) / (Math.sqrt(pointCount) + 1);
            const stepY = (maxY - minY) / (Math.sqrt(pointCount) + 1);
            
            // Generate a grid of points inside the bounding box
            for (let i = 1; i <= Math.sqrt(pointCount); i++) {
                for (let j = 1; j <= Math.sqrt(pointCount); j++) {
                    const x = minX + i * stepX;
                    const y = minY + j * stepY;
                    
                    // Simple check if point is inside the quadrilateral by using barycentric coordinates
                    // This is a simplified approach that works for most convex quadrilaterals
                    if (this.isPointInPolygon(corners, x, y)) {
                        points.push(x, y);
                    }
                    
                    // Limit to requested point count
                    if (points.length >= pointCount * 2) {
                        return points;
                    }
                }
            }
            
            return points;
        } catch (error) {
            console.error("Error generating tracking points:", error);
            return []; // Return empty array if there's an error
        }
    }
    
    // Generate cv.Point objects from flat point array
    pointsArrayToPoints(pointsArray) {
        const points = [];
        if (!pointsArray || pointsArray.length < 2) return points;
        
        for (let i = 0; i < pointsArray.length; i += 2) {
            if (i + 1 < pointsArray.length) {
                points.push(new cv.Point(pointsArray[i], pointsArray[i + 1]));
            }
        }
        
        return points;
    }
    
    // Use the shared Utils.isPointInPolygon method
    isPointInPolygon(corners, x, y) {
        return Utils.isPointInPolygon(corners, x, y);
    }
    
    // Check if the tracked quadrilateral is valid (not too distorted)
    isValidQuadrilateral(corners) {
        if (corners.length !== 4) return false;
        
        // Calculate edge lengths
        const edges = [];
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            const dx = corners[next].x - corners[i].x;
            const dy = corners[next].y - corners[i].y;
            const length = Math.sqrt(dx * dx + dy * dy);
            edges.push(length);
        }
        
        // Calculate perimeter and area
        const perimeter = edges.reduce((sum, length) => sum + length, 0);
        
        // Use shoelace formula to calculate area
        let area = 0;
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            area += corners[i].x * corners[next].y - corners[next].x * corners[i].y;
        }
        area = Math.abs(area) / 2;
        
        // Check if area is reasonable (not too small)
        if (area < 100) return false;
        
        // Check compactness (circle has value 1, lower values are less compact)
        const compactness = (4 * Math.PI * area) / (perimeter * perimeter);
        
        // Reject extremely distorted quadrilaterals
        return compactness > 0.1;
    }
}

/**
 * Handles visualization of tracking results
 */
class Visualizer {
    renderResults(frame, trackingResult, canvas, drawKeypoints, flowPoints, flowStatus, targetName = '') {
        // Resources to clean up
        let displayFrame = null;
        let contours = null;
        let contour = null;
        
        try {
            // Create a clone of the frame for drawing
            displayFrame = frame.clone();
            
            // If tracking was successful, draw the contour
            if (trackingResult.success && trackingResult.corners) {
                contours = new cv.MatVector();
                contour = new cv.Mat();
                
                // Create contour for visualization
                contour.create(4, 1, cv.CV_32SC2);
                
                // Safely set contour data
                try {
                    const flatPoints = trackingResult.corners.flatMap(p => [p.x, p.y]);
                    if (contour.data32S && contour.data32S.length >= flatPoints.length) {
                        contour.data32S.set(flatPoints);
                        contours.push_back(contour);
                        
                        // Draw contour on frame
                        cv.drawContours(displayFrame, contours, 0, [0, 255, 0, 255], 3);
                        
                        // Draw target name if available
                        if (targetName) {
                            this.drawTargetName(displayFrame, trackingResult.corners, targetName);
                        }
                    }
                } catch (e) {
                    console.error("Error drawing contour:", e);
                }
            }
            
            // Draw keypoints if available and enabled
            if (drawKeypoints && trackingResult.keypoints) {
                this.drawKeypoints(displayFrame, trackingResult);
            }
            
            // Draw optical flow tracking points if available
            if (flowPoints && flowPoints.length > 0) {
                // Pass the tracking corners to the drawFlowPoints method for better visualization
                const corners = trackingResult.success && trackingResult.corners ? 
                    trackingResult.corners : null;
                this.drawFlowPoints(displayFrame, flowPoints, flowStatus, corners);
            }
            
            // Display the processed frame
            cv.imshow(canvas, displayFrame);
        } catch (e) {
            console.error("Error in visualization:", e);
        } finally {
            // Clean up resources using the Utils helper
            [displayFrame, contours, contour].forEach(resource => Utils.deleteResource(resource));
        }
    }
    
    /**
     * Draw the target name above the tracked area
     * @param {Mat} frame - Frame to draw on
     * @param {Array} corners - Corners of the tracked region
     * @param {string} targetName - Name of the detected target
     */
    drawTargetName(frame, corners, targetName) {
        try {
            if (!corners || corners.length !== 4 || !targetName) return;
            
            // Calculate the top center of the rectangle
            const topLeft = corners[0];
            const topRight = corners[1];
            const centerX = Math.floor((topLeft.x + topRight.x) / 2);
            const centerY = Math.floor(Math.min(topLeft.y, topRight.y)) - 10;
            
            // Ensure text is within frame bounds
            const textPoint = new cv.Point(
                Math.max(10, Math.min(centerX, frame.cols - 100)), 
                Math.max(30, centerY)
            );
            
            // Draw a background for the text
            // Instead of using getTextSize which is not available, use estimated dimensions
            const fontSize = 0.7;
            const textThickness = 2;
            const estimatedCharWidth = 10 * fontSize; // approximation
            const estimatedHeight = 24 * fontSize;
            const padding = 5;
            
            // Estimate text width based on character count
            const estimatedWidth = targetName.length * estimatedCharWidth;
            
            cv.rectangle(
                frame,
                new cv.Point(textPoint.x - padding, textPoint.y - estimatedHeight - padding),
                new cv.Point(textPoint.x + estimatedWidth + padding, textPoint.y + padding),
                [0, 0, 0, 180],
                -1
            );
            
            // Draw the text
            cv.putText(
                frame,
                targetName,
                textPoint,
                cv.FONT_HERSHEY_SIMPLEX,
                fontSize,
                [255, 255, 255, 255],
                textThickness
            );
        } catch (e) {
            console.error("Error drawing target name:", e);
        }
    }
    
    drawFlowPoints(frame, points, flowStatus, corners) {
        try {
            if (!points || points.length === 0) return;
            
            // Use the provided corners if available, otherwise use a fallback
            let cornerPoints = corners || [];
            
            // If no corners were provided, create a fallback
            if (!cornerPoints || cornerPoints.length !== 4) {
                // Create a simplistic approximation of the marker boundaries
                if (frame.cols > 0 && frame.rows > 0) {
                    const padding = 0;
                    cornerPoints = [
                        new cv.Point(padding, padding),
                        new cv.Point(frame.cols - padding, padding),
                        new cv.Point(frame.cols - padding, frame.rows - padding),
                        new cv.Point(padding, frame.rows - padding)
                    ];
                }
            }
            
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                if (!point) continue;
                
                // Determine color based on tracking status and location
                let color;
                const isTracked = flowStatus && flowStatus.length > i && flowStatus[i] === 1;
                
                if (isTracked) {
                    // For tracked points, use green for points inside the marker region,
                    // yellow for points that might be outside the marker
                    if (cornerPoints.length === 4) {
                        const isInside = Utils.isPointInPolygon(cornerPoints, point.x, point.y);
                        color = isInside ? [0, 255, 0, 255] : [255, 255, 0, 255]; // Green if inside, yellow if outside
                    } else {
                        color = [0, 255, 0, 255]; // Default to green if we can't determine location
                    }
                } else {
                    color = [255, 0, 0, 255]; // Red for lost points
                }
                
                // Draw the point
                cv.circle(frame, point, 3, color, -1);
            }
        } catch (e) {
            console.error("Error drawing flow points:", e);
        }
    }
    
    drawKeypoints(frame, trackingResult) {
        try {
            const { keypoints, matches, goodMatches } = trackingResult;
            
            // Draw all keypoints in blue (smaller)
            for (let i = 0; i < keypoints.size(); i++) {
                try {
                    const kp = keypoints.get(i);
                    if (kp && kp.pt) {
                        cv.circle(frame, kp.pt, 1, [255, 0, 0, 255], -1);
                    }
                } catch (e) {}
            }
            
            // If we have matches, draw matched keypoints in yellow (medium)
            if (matches && matches.size() > 0) {
                for (let i = 0; i < matches.size(); i++) {
                    try {
                        const match = matches.get(i);
                        if (match && match.trainIdx >= 0 && match.trainIdx < keypoints.size()) {
                            const kp = keypoints.get(match.trainIdx);
                            if (kp && kp.pt) {
                                cv.circle(frame, kp.pt, 2, [255, 255, 0, 255], -1);
                            }
                        }
                    } catch (e) {}
                }
            }
            
            // If we have good matches, draw them in green (larger)
            if (goodMatches && goodMatches.size() > 0) {
                for (let i = 0; i < goodMatches.size(); i++) {
                    try {
                        const match = goodMatches.get(i);
                        if (match && match.trainIdx >= 0 && match.trainIdx < keypoints.size()) {
                            const kp = keypoints.get(match.trainIdx);
                            if (kp && kp.pt) {
                                cv.circle(frame, kp.pt, 2, [0, 255, 0, 255], -1);
                            }
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.error("Error drawing keypoints:", e);
        }
    }
}

// Initialize when page is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Store the ImageTracker instance globally for cross-component access
    window.imageTrackerInstance = new ImageTracker();
    
    // Listen for the custom refresh targets event
    document.addEventListener('refreshTargets', () => {
        if (window.imageTrackerInstance && window.imageTrackerInstance.ui) {
            window.imageTrackerInstance.ui.refreshTargetsList();
        }
    });
});