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
            drawKeypoints: false,
            maxDimension: 640, // Maximum allowed dimension while preserving aspect ratio
            useOpticalFlow: true, // Enable optical flow tracking by default
            detectionInterval: 10, // Run full detection every N frames
            frameCount: 0, // Current frame counter
            lastCorners: null, // Last detected corners for optical flow
            lastFrame: null, // Last processed frame for optical flow
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
        this.detector = new FeatureDetector();
        this.opticalFlow = new OpticalFlowTracker();
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
                    }
                }
            } else {
                // Use optical flow for most frames (more efficient)
                trackingResult = this.opticalFlow.track(
                    this.state.lastFrame,
                    frameToProcess,
                    this.state.lastCorners
                );
                
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
                    // If optical flow fails, force a full detection on next frame
                    this.state.frameCount = this.state.detectionInterval - 1;
                }
            }
            
            // Visualize results
            this.visualizer.renderResults(
                frameToProcess,
                trackingResult,
                this.ui.canvas,
                this.state.drawKeypoints
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
        
        // Initial UI state
        this.stopButton.disabled = true;
        this.useOpticalFlow.checked = tracker.state.useOpticalFlow;
        this.detectionInterval.value = tracker.state.detectionInterval;
        this.intervalValue.textContent = tracker.state.detectionInterval;
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
    }
    
    setupEventListeners(handlers) {
        const { onStartTracking, onStopTracking, onReferenceImageLoad } = handlers;
        
        this.startButton.addEventListener('click', () => {
            if (this.tracker.referenceImage.isLoaded()) {
                onStartTracking();
            } else {
                this.updateStatus('Please upload a reference image first.');
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
    }
    
    updateControlsForTracking(isTracking) {
        this.startButton.disabled = isTracking;
        this.stopButton.disabled = !isTracking;
        this.fileInput.disabled = isTracking;
        
        if (isTracking) {
            this.updateTrackingMode('Initializing tracking...');
        } else {
            this.updateTrackingMode('Tracking stopped');
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
class ReferenceImageManager {
    constructor() {
        this.reset();
        this.ui = document.getElementById('statusMessage');
    }
    
    reset() {
        // OpenCV resources
        this.image = null;
        this.imageGray = null;
        this.keypoints = null;
        this.descriptors = null;
    }
    
    isLoaded() {
        return this.image !== null;
    }
    
    getData() {
        return {
            image: this.image,
            imageGray: this.imageGray,
            keypoints: this.keypoints,
            descriptors: this.descriptors
        };
    }
    
    async loadDefaultImage() {
        this.updateStatus('Loading default reference image...');
        
        try {
            const img = new Image();
            
            // Wait for image to load
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Failed to load reference.jpg'));
                img.src = 'reference.jpg';
            });
            
            // Process the reference image
            await this.processImage(img, { 
                maxFeatures: 500, 
                briskThreshold: 50,
                autoStart: true
            });
            
        } catch (error) {
            this.updateStatus(`Error loading reference image: ${error.message}`);
            console.error(error);
        }
    }
    
    async loadFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.updateStatus('Loading reference image...');
        
        try {
            // Read the file and convert to image element
            const imageUrl = URL.createObjectURL(file);
            const img = new Image();
            
            // Wait for image to load
            await new Promise((resolve) => {
                img.onload = resolve;
                img.src = imageUrl;
            });
            
            // Process the reference image
            const success = await this.processImage(img, { 
                maxFeatures: 500, 
                briskThreshold: 60
            });
            
            if (success) {
                // Enable start button
                document.getElementById('startTracking').disabled = false;
            }
            
            // Clean up URL object
            URL.revokeObjectURL(imageUrl);
        } catch (error) {
            this.updateStatus(`Error loading reference image: ${error.message}`);
            console.error(error);
        }
    }
    
    async processImage(img, options = {}) {
        const { maxFeatures = 1000, briskThreshold = 50, autoStart = false } = options;
        
        try {
            // Clean up previous resources
            this.cleanup();
            
            // Convert to OpenCV format
            this.image = cv.imread(img);
            
            // Convert to grayscale for feature detection
            this.imageGray = new cv.Mat();
            cv.cvtColor(this.image, this.imageGray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(this.imageGray, this.imageGray, new cv.Size(3, 3), 0);
            cv.equalizeHist(this.imageGray, this.imageGray);
            
            // Extract features using BRISK
            const detector = new cv.BRISK(briskThreshold, 3, 1.0);
            
            const keypoints = new cv.KeyPointVector();
            const descriptors = new cv.Mat();
            
            detector.detect(this.imageGray, keypoints);
            detector.compute(this.imageGray, keypoints, descriptors);
            
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
            this.keypoints = new cv.KeyPointVector();
            for (let kp of keypointsArray) {
                this.keypoints.push_back(kp);
            }
            
            // Compute descriptors for selected keypoints
            this.descriptors = new cv.Mat();
            detector.compute(this.imageGray, this.keypoints, this.descriptors);
            
            // Clean up detector
            detector.delete();
            keypoints.delete();
            descriptors.delete();
            
            // Update status
            this.updateStatus(`Reference image loaded. Found ${this.keypoints.size()} features.`);
            
            // Auto start tracking if requested
            if (autoStart) {
                const tracker = document.querySelector('#startTracking');
                if (tracker) {
                    setTimeout(() => tracker.click(), 500);
                }
            }
            
            return true;
        } catch (error) {
            this.updateStatus(`Error loading reference image: ${error.message}`);
            console.error(error);
            return false;
        }
    }
    
    cleanup() {
        // Clean up OpenCV resources
        if (this.image) this.image.delete();
        if (this.imageGray) this.imageGray.delete();
        if (this.keypoints) this.keypoints.delete();
        if (this.descriptors) this.descriptors.delete();
        
        // Reset references
        this.reset();
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
    constructor() {
        this.detector = new cv.BRISK(50, 3, 1.0);
    }
    
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
            corners: null
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
        
        try {
            // Convert frame to grayscale
            frameGray = new cv.Mat();
            cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);
            
            // Detect features
            frameKeypoints = new cv.KeyPointVector();
            frameDescriptors = new cv.Mat();
            
            this.detector.detect(frameGray, frameKeypoints);
            
            // Only compute descriptors if keypoints were found
            if (frameKeypoints.size() > 0) {
                this.detector.compute(frameGray, frameKeypoints, frameDescriptors);
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
                if (goodMatches && goodMatches.size() >= 20) {
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
            return { success: false, reason: e.message };
        } finally {
            // Clean up OpenCV resources
            if (frameGray) frameGray.delete();
            if (frameDescriptors) frameDescriptors.delete();
            if (matcher) matcher.delete();
            if (matches && result.matches !== matches) matches.delete();
            if (goodMatches && result.goodMatches !== goodMatches) goodMatches.delete();
            if (homography && result.homography !== homography) homography.delete();
            if (refPointsMat) refPointsMat.delete();
            if (framePointsMat) framePointsMat.delete();
            if (cornerPoints) cornerPoints.delete();
            if (transformedCorners) transformedCorners.delete();
        }
    }
}

/**
 * Handles optical flow tracking between frames
 * Implements Lucas-Kanade sparse optical flow for efficient tracking
 */
class OpticalFlowTracker {
    constructor() {
        // Parameters for optical flow
        this.params = {
            winSize: new cv.Size(15, 15), // Smaller window for better performance
            maxLevel: 2, // Reduced pyramid levels for stability
            criteria: new cv.TermCriteria(
                cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 
                10, 
                0.03
            ),
            minEigThreshold: 0.001,
            maxFeaturePoints: 100, // Maximum feature points to track
            featureQualityLevel: 0.01, // Quality level for feature detection
            featureMinDistance: 10, // Minimum distance between features
            ransacReprojThreshold: 3.0 // RANSAC reprojection threshold for homography
        };
    }
    
    track(prevFrame, currentFrame, prevCorners) {
        // Response object structure
        const result = {
            success: false,
            corners: null,
            flowStatus: null,
            trackingQuality: 0
        };
        
        if (!prevFrame || !currentFrame || !prevCorners || prevCorners.length !== 4) {
            return result;
        }
        
        // OpenCV resources to be cleaned up
        let prevGray = null;
        let currentGray = null;
        let prevMask = null;
        let featurePoints = null;
        let prevPoints = null;
        let nextPoints = null;
        let status = null;
        let err = null;
        let prevPointsMat = null;
        let nextPointsMat = null;
        let homography = null;
        let cornerPoints = null;
        let transformedCorners = null;
        
        try {
            // Convert frames to grayscale
            prevGray = new cv.Mat();
            currentGray = new cv.Mat();
            cv.cvtColor(prevFrame, prevGray, cv.COLOR_RGBA2GRAY);
            cv.cvtColor(currentFrame, currentGray, cv.COLOR_RGBA2GRAY);
            
            // Create a mask for feature detection inside the quadrilateral
            prevMask = new cv.Mat.zeros(prevGray.rows, prevGray.cols, cv.CV_8UC1);
            const roiCorners = new cv.MatVector();
            const roi = new cv.Mat(4, 1, cv.CV_32SC2);
            
            for (let i = 0; i < 4; i++) {
                roi.data32S[i * 2] = Math.round(prevCorners[i].x);
                roi.data32S[i * 2 + 1] = Math.round(prevCorners[i].y);
            }
            
            roiCorners.push_back(roi);
            cv.fillPoly(prevMask, roiCorners, new cv.Scalar(255));
            
            // Clean up ROI resources
            roi.delete();
            roiCorners.delete();
            
            // Detect good features to track inside the quadrilateral
            featurePoints = new cv.Mat();
            cv.goodFeaturesToTrack(
                prevGray,
                featurePoints,
                this.params.maxFeaturePoints,
                this.params.featureQualityLevel,
                this.params.featureMinDistance,
                prevMask
            );
            
            // Only proceed if we have enough feature points
            if (!featurePoints || featurePoints.rows < 8) {
                return result;
            }
            
            // Convert feature points to array format for optical flow
            const pointsToTrack = [];
            for (let i = 0; i < featurePoints.rows; i++) {
                const x = featurePoints.data32F[i * 2];
                const y = featurePoints.data32F[i * 2 + 1];
                pointsToTrack.push(x, y);
            }
            
            // Create OpenCV point arrays
            prevPoints = cv.matFromArray(featurePoints.rows, 1, cv.CV_32FC2, pointsToTrack);
            nextPoints = new cv.Mat();
            status = new cv.Mat();
            err = new cv.Mat();
            
            try {
                // Calculate optical flow
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
            } catch (error) {
                // Fallback with default parameters if custom parameters fail
                console.warn("Optical flow error with custom params, trying fallback:", error);
                
                // Clean up resources from failed attempt
                if (nextPoints) nextPoints.delete();
                if (status) status.delete();
                if (err) err.delete();
                
                // Create new matrices for second attempt
                nextPoints = new cv.Mat();
                status = new cv.Mat();
                err = new cv.Mat();
                
                // Try with minimal parameters
                cv.calcOpticalFlowPyrLK(
                    prevGray, 
                    currentGray, 
                    prevPoints, 
                    nextPoints, 
                    status, 
                    err
                );
            }
            
            // Build point pairs for homography calculation
            const prevPts = [];
            const nextPts = [];
            let validPointCount = 0;
            
            for (let i = 0; i < status.rows; i++) {
                if (status.data[i] === 1) { // Point was tracked successfully
                    validPointCount++;
                    
                    const prevX = prevPoints.data32F[i * 2];
                    const prevY = prevPoints.data32F[i * 2 + 1];
                    const nextX = nextPoints.data32F[i * 2];
                    const nextY = nextPoints.data32F[i * 2 + 1];
                    
                    // Validate point coordinates
                    if (!isNaN(prevX) && !isNaN(prevY) && !isNaN(nextX) && !isNaN(nextY) &&
                        isFinite(prevX) && isFinite(prevY) && isFinite(nextX) && isFinite(nextY)) {
                        prevPts.push(prevX, prevY);
                        nextPts.push(nextX, nextY);
                    }
                }
            }
            
            // Calculate tracking quality
            const trackingQuality = validPointCount / status.rows;
            result.trackingQuality = trackingQuality;
            
            // Only proceed with homography if we have enough matched points
            if (prevPts.length >= 16 && nextPts.length >= 16 && trackingQuality > 0.5) {
                // Create point matrices for homography
                prevPointsMat = cv.matFromArray(prevPts.length / 2, 1, cv.CV_32FC2, prevPts);
                nextPointsMat = cv.matFromArray(nextPts.length / 2, 1, cv.CV_32FC2, nextPts);
                
                // Calculate homography matrix with RANSAC
                homography = cv.findHomography(prevPointsMat, nextPointsMat, cv.RANSAC, this.params.ransacReprojThreshold);
                
                // Only proceed if we got a valid homography
                if (homography && !homography.empty()) {
                    // Set up corners of the original quadrilateral for transformation
                    cornerPoints = new cv.Mat(4, 1, cv.CV_32FC2);
                    
                    // Make sure we can safely access the cornerData
                    if (cornerPoints.data32F && cornerPoints.data32F.length >= 8) {
                        const cornerData = cornerPoints.data32F;
                        
                        // Set corners based on the original tracking rectangle
                        for (let i = 0; i < 4; i++) {
                            cornerData[i * 2] = prevCorners[i].x;
                            cornerData[i * 2 + 1] = prevCorners[i].y;
                        }
                        
                        // Transform corners using homography
                        transformedCorners = new cv.Mat();
                        cv.perspectiveTransform(cornerPoints, transformedCorners, homography);
                        
                        // Extract transformed corners
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
                            
                            if (validCorners && this.isValidQuadrilateral(corners)) {
                                result.corners = corners;
                                result.success = true;
                            }
                        }
                    }
                }
            }
            
            return result;
        } catch (error) {
            console.error("Error in optical flow tracking:", error);
            return result;
        } finally {
            // Clean up OpenCV resources
            if (prevGray) prevGray.delete();
            if (currentGray) currentGray.delete();
            if (prevMask) prevMask.delete();
            if (featurePoints) featurePoints.delete();
            if (prevPoints) prevPoints.delete();
            if (nextPoints) nextPoints.delete();
            if (status && !result.flowStatus) status.delete();
            if (err) err.delete();
            if (prevPointsMat) prevPointsMat.delete();
            if (nextPointsMat) nextPointsMat.delete();
            if (homography) homography.delete();
            if (cornerPoints) cornerPoints.delete();
            if (transformedCorners) transformedCorners.delete();
        }
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
    
    // Helper method to check if a point is inside a polygon using ray casting algorithm
    isPointInPolygon(corners, x, y) {
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
    renderResults(frame, trackingResult, canvas, drawKeypoints) {
        // Resources to clean up
        let displayFrame = null;
        let contours = null;
        let contour = null;
        
        try {
            if (drawKeypoints) {
                // Create a clone of the frame for drawing
                displayFrame = frame.clone();
                
                // Draw keypoints if available
                if (trackingResult.keypoints) {
                    this.drawKeypoints(displayFrame, trackingResult);
                }
            } else {
                displayFrame = frame.clone();
            }
            
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
                    }
                } catch (e) {
                    console.error("Error drawing contour:", e);
                }
            }
            
            // Display the processed frame
            cv.imshow(canvas, displayFrame);
        } catch (e) {
            console.error("Error in visualization:", e);
        } finally {
            // Clean up resources
            if (displayFrame) displayFrame.delete();
            if (contours) contours.delete();
            if (contour) contour.delete();
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
    new ImageTracker();
});