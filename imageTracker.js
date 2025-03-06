class ImageTracker {
    constructor() {
        // DOM elements
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.startButton = document.getElementById('startTracking');
        this.stopButton = document.getElementById('stopTracking');
        this.fileInput = document.getElementById('referenceImage');
        this.statusMessage = document.getElementById('statusMessage');

        // OpenCV variables
        this.detector = null;
        this.referenceImage = null;
        this.referenceImageGray = null;
        this.referenceKeypoints = null;
        this.referenceDescriptors = null;
        
        // Three.js variables
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cube = null;
        
        // State variables
        this.isProcessing = false;
        this.isTracking = false;
        this.lastProcessingTime = 0;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.startCamera = this.startCamera.bind(this);
        this.stopCamera = this.stopCamera.bind(this);
        this.processVideo = this.processVideo.bind(this);
        this.loadReferenceImage = this.loadReferenceImage.bind(this);
        this.initThreeJS = this.initThreeJS.bind(this);
        this.updateThreeJS = this.updateThreeJS.bind(this);
        
        // Initialize when OpenCV is ready
        this.waitForOpenCV();
    }
    
    waitForOpenCV() {
        // Check if OpenCV is loaded and has all required features
        if (typeof cv === 'undefined' || 
            typeof cv.BFMatcher !== 'function' || 
            typeof cv.ORB !== 'function' || 
            typeof cv.DMatchVector !== 'function') {
            
            this.updateStatus('Loading OpenCV...');
            setTimeout(this.waitForOpenCV.bind(this), 500);
        } else {
            // OpenCV is fully loaded with all required features
            this.updateStatus('OpenCV loaded. Please upload a reference image.');
            this.init();
        }
    }
    
    init() {
        // Set up button listeners
        this.startButton.addEventListener('click', () => {
            if (this.referenceImage) {
                this.startTracking();
            } else {
                this.updateStatus('Please upload a reference image first.');
            }
        });
        
        this.stopButton.addEventListener('click', () => {
            this.stopTracking();
        });
        
        this.fileInput.addEventListener('change', this.loadReferenceImage);
        
        // Disable stop button initially
        this.stopButton.disabled = true;
        
        // Initialize Three.js
        this.initThreeJS();
    }
    
    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'environment'
                },
                audio: false
            };
            
            // Request camera access
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = stream;
            this.video.play();
            
            // Wait for video to be ready with dimensions
            return new Promise((resolve) => {
                const checkVideo = () => {
                    if (this.video.readyState >= 2 && // HAVE_CURRENT_DATA or better
                        this.video.videoWidth > 0 && 
                        this.video.videoHeight > 0) {
                        
                        // Set canvas dimensions to match video
                        this.canvas.width = this.video.videoWidth;
                        this.canvas.height = this.video.videoHeight;
                        
                        // Update Three.js renderer size
                        if (this.renderer) {
                            this.renderer.setSize(
                                Math.min(640, this.video.videoWidth),
                                Math.min(480, this.video.videoHeight)
                            );
                        }
                        
                        // We don't need VideoCapture with our new approach
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
        } catch (error) {
            this.updateStatus(`Error accessing camera: ${error.message}`);
            throw error;
        }
    }
    
    stopCamera() {
        if (this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.video.srcObject = null;
        }
    }
    
    async loadReferenceImage(event) {
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
            
            // Convert to OpenCV format
            this.referenceImage = cv.imread(img);
            
            // Convert to grayscale for feature detection
            this.referenceImageGray = new cv.Mat();
            cv.cvtColor(this.referenceImage, this.referenceImageGray, cv.COLOR_RGBA2GRAY);
            
            // Extract features using ORB
            this.detector = new cv.ORB(500);
            
            const referenceKeypoints = new cv.KeyPointVector();
            this.referenceDescriptors = new cv.Mat();
            
            this.detector.detect(this.referenceImageGray, referenceKeypoints);
            this.detector.compute(this.referenceImageGray, referenceKeypoints, this.referenceDescriptors);
            
            this.referenceKeypoints = referenceKeypoints;
            
            // Update status
            this.updateStatus(`Reference image loaded. Found ${referenceKeypoints.size()} features.`);
            
            // Enable start button
            this.startButton.disabled = false;
            
            // Clean up URL object
            URL.revokeObjectURL(imageUrl);
        } catch (error) {
            this.updateStatus(`Error loading reference image: ${error.message}`);
            console.error(error);
        }
    }
    
    async startTracking() {
        if (this.isTracking) return;
        
        this.updateStatus('Starting tracking...');
        
        try {
            // Start camera if not already started
            await this.startCamera();
            
            // Update UI
            this.startButton.disabled = true;
            this.stopButton.disabled = false;
            this.fileInput.disabled = true;
            
            // Set tracking state
            this.isTracking = true;
            
            // Ensure OpenCV is fully loaded with all features before starting processing
            if (typeof cv === 'undefined' || typeof cv.BFMatcher !== 'function' || 
                typeof cv.ORB !== 'function' || typeof cv.DMatchVector !== 'function') {
                
                this.updateStatus('Waiting for OpenCV to fully initialize...');
                
                // Check again in 500ms
                setTimeout(() => {
                    if (typeof cv !== 'undefined' && typeof cv.BFMatcher === 'function') {
                        this.updateStatus('Starting tracking...');
                        this.processVideo();
                    } else {
                        this.updateStatus('OpenCV not fully loaded. Please refresh the page.');
                        this.isTracking = false;
                    }
                }, 500);
            } else {
                // Start processing frames immediately if OpenCV is ready
                this.processVideo();
            }
        } catch (error) {
            this.updateStatus(`Error starting tracking: ${error.message}`);
            console.error(error);
        }
    }
    
    stopTracking() {
        // Update state
        this.isTracking = false;
        
        // Stop camera
        this.stopCamera();
        
        // Update UI
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.fileInput.disabled = false;
        
        this.updateStatus('Tracking stopped.');
    }
    
    processVideo() {
        // If not tracking, exit immediately
        if (!this.isTracking) return;
        
        // Schedule next frame with requestAnimationFrame before doing anything else
        // This ensures the callback is registered even if something fails
        requestAnimationFrame(this.processVideo);
        
        // Limit processing rate to ~30fps to avoid overwhelming the browser
        const now = performance.now();
        const elapsed = now - this.lastProcessingTime;
        
        if (elapsed < 30) {
            return; // Skip this frame to maintain frame rate cap
        }
        
        this.lastProcessingTime = now;
        
        // Skip if already processing a frame
        if (this.isProcessing) {
            return;
        }
        
        // Set processing flag to prevent concurrent processing
        this.isProcessing = true;
        
        // We'll store OpenCV resources here for proper cleanup
        let frame = null;
        let frameGray = null;
        let frameKeypoints = null;
        let frameDescriptors = null;
        
        try {
            // Make sure video and canvas elements exist
            if (!this.video || !this.canvas) {
                console.error("Video or canvas element not initialized");
                return;
            }
            
            // Make sure video dimensions are valid
            if (this.video.videoWidth <= 0 || this.video.videoHeight <= 0) {
                console.error("Invalid video dimensions");
                return;
            }
            
            // Wait for video readiness before capturing
            if (!this.video.videoWidth || !this.video.videoHeight || 
                this.video.videoWidth <= 0 || this.video.videoHeight <= 0) {
                console.warn("Video dimensions not ready yet");
                return;
            }
            
            try {
                // Create a canvas to capture the video frame
                const captureCanvas = document.createElement('canvas');
                const captureContext = captureCanvas.getContext('2d');
                
                // Set dimensions to match video
                captureCanvas.width = this.video.videoWidth;
                captureCanvas.height = this.video.videoHeight;
                
                // Draw the current video frame to the canvas
                captureContext.drawImage(this.video, 0, 0, captureCanvas.width, captureCanvas.height);
                
                // Read the image data from the canvas into an OpenCV matrix
                frame = cv.imread(captureCanvas);
            } catch (e) {
                console.error("Error capturing video frame:", e);
                return;
            }
            
            // Skip processing if frame is empty
            if (frame.empty()) {
                console.warn("Empty frame captured");
                return;
            }
            
            // Try grayscale conversion with error handling
            frameGray = new cv.Mat();
            try {
                cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);
            } catch (e) {
                console.error("Error converting to grayscale:", e);
                return;
            }
            
            // Detect features with error handling
            frameKeypoints = new cv.KeyPointVector();
            frameDescriptors = new cv.Mat();
            
            try {
                // Detect keypoints
                this.detector.detect(frameGray, frameKeypoints);
                
                // Only compute descriptors if keypoints were found
                if (frameKeypoints.size() > 0) {
                    this.detector.compute(frameGray, frameKeypoints, frameDescriptors);
                }
            } catch (e) {
                console.error("Error detecting features:", e);
                return;
            }
            
            // Additional OpenCV resources we'll need to clean up
            let matcher = null;
            let matches = null;
            let goodMatches = null;
            let homography = null;
            let refPointsMat = null;
            let framePointsMat = null;
            let cornerPoints = null;
            let transformedCorners = null;
            let contours = null;
            let contour = null;
            
            try {
                // Only proceed if we have enough features to match
                if (frameKeypoints.size() > 10 && 
                    this.referenceKeypoints && this.referenceKeypoints.size() > 10 && 
                    frameDescriptors && !frameDescriptors.empty() && 
                    this.referenceDescriptors && !this.referenceDescriptors.empty() &&
                    frameDescriptors.rows > 0 && this.referenceDescriptors.rows > 0 &&
                    frameDescriptors.cols === this.referenceDescriptors.cols) {
                    
                    // Check if BFMatcher is available
                    if (typeof cv.BFMatcher !== 'function') {
                        console.error('BFMatcher not available in OpenCV');
                        this.cube.visible = false;
                        this.renderer.render(this.scene, this.camera);
                        return;
                    }
                    
                    // Match features
                    matcher = new cv.BFMatcher(cv.NORM_HAMMING);
                    matches = new cv.DMatchVector();
                    
                    // Try to match descriptors
                    matcher.match(this.referenceDescriptors, frameDescriptors, matches);
                    
                    // Filter good matches
                    goodMatches = new cv.DMatchVector();
                    
                    if (matches.size() > 0) {
                        // Get distances for good match filtering
                        const distances = [];
                        
                        for (let i = 0; i < matches.size(); i++) {
                            try {
                                const match = matches.get(i);
                                if (match && typeof match.distance === 'number' && 
                                    !isNaN(match.distance) && isFinite(match.distance)) {
                                    distances.push(match.distance);
                                }
                            } catch (e) {
                                // Skip invalid matches
                            }
                        }
                        
                        // Only proceed if we have valid distances
                        if (distances.length > 0) {
                            // Sort distances to find best matches
                            distances.sort((a, b) => a - b);
                            const threshold = Math.min(100, 3 * distances[0]);
                            
                            // Filter by distance threshold
                            for (let i = 0; i < matches.size(); i++) {
                                try {
                                    const match = matches.get(i);
                                    if (match && typeof match.distance === 'number' && 
                                        match.distance <= threshold) {
                                        goodMatches.push_back(match);
                                    }
                                } catch (e) {
                                    // Skip problematic matches
                                }
                            }
                        }
                    }
                    
                    // Only proceed with homography if we have enough good matches
                    if (goodMatches && goodMatches.size() >= 10) {
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
                                if (match.queryIdx < 0 || match.queryIdx >= this.referenceKeypoints.size() ||
                                    match.trainIdx < 0 || match.trainIdx >= frameKeypoints.size()) {
                                    continue;
                                }
                                
                                // Get keypoints
                                const refKeypoint = this.referenceKeypoints.get(match.queryIdx);
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
                            homography = cv.findHomography(refPointsMat, framePointsMat, cv.RANSAC);
                            
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
                                    cornerData[2] = this.referenceImage.cols;
                                    cornerData[3] = 0;
                                    cornerData[4] = this.referenceImage.cols;
                                    cornerData[5] = this.referenceImage.rows;
                                    cornerData[6] = 0;
                                    cornerData[7] = this.referenceImage.rows;
                                    
                                    // Transform corners using homography
                                    transformedCorners = new cv.Mat();
                                    cv.perspectiveTransform(cornerPoints, transformedCorners, homography);
                                    
                                    // Make sure transformed corners data is accessible
                                    if (transformedCorners && transformedCorners.data32F && 
                                        transformedCorners.data32F.length >= 8) {
                                        
                                        // Validate transformed corner coordinates
                                        let validContour = true;
                                        const contourPoints = [];
                                        
                                        for (let i = 0; i < 4; i++) {
                                            const x = transformedCorners.data32F[i * 2];
                                            const y = transformedCorners.data32F[i * 2 + 1];
                                            
                                            if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
                                                validContour = false;
                                                break;
                                            }
                                            
                                            contourPoints.push(new cv.Point(x, y));
                                        }
                                        
                                        // Draw contour and update 3D model if coordinates are valid
                                        if (validContour) {
                                            contours = new cv.MatVector();
                                            contour = new cv.Mat();
                                            
                                            // Create contour for visualization
                                            contour.create(4, 1, cv.CV_32SC2);
                                            
                                            // Safely set contour data
                                            try {
                                                const flatPoints = contourPoints.flatMap(p => [p.x, p.y]);
                                                if (contour.data32S && contour.data32S.length >= flatPoints.length) {
                                                    contour.data32S.set(flatPoints);
                                                    contours.push_back(contour);
                                                    
                                                    // Draw contour on frame
                                                    cv.drawContours(frame, contours, 0, [0, 255, 0, 255], 3);
                                                    
                                                    // We no longer update 3D model
                                                    // Just drawing the green rectangle is enough
                                                }
                                            } catch (e) {
                                                console.error("Error drawing contour:", e);
                                            }
                                        } else {
                                            console.log("Invalid contour points detected");
                                        }
                                    } else {
                                        console.log("Invalid transformed corners");
                                    }
                                } else {
                                    console.log("Invalid corner points");
                                }
                            } else {
                                console.log("Invalid homography matrix");
                            }
                        } else {
                            console.log("Not enough valid point pairs");
                        }
                    } else {
                        console.log("Not enough good matches");
                    }
                } else {
                    console.log("Basic requirements for matching not met");
                }
                
                // Visualize keypoints based on status
                try {
                    // Create copies of the frame for each type of keypoint visualization
                    let allKeypointsFrame = frame.clone();
                    
                    // Draw keypoints manually for each category
                    
                    // All keypoints in white (smaller)
                    for (let i = 0; i < frameKeypoints.size(); i++) {
                        try {
                            const kp = frameKeypoints.get(i);
                            if (kp && kp.pt) {
                                cv.circle(allKeypointsFrame, kp.pt, 1, [255, 255, 255, 255], -1);
                            }
                        } catch (e) {}
                    }
                    
                    // If we have matches, draw matched keypoints in yellow (medium)
                    if (matches && matches.size() > 0) {
                        for (let i = 0; i < matches.size(); i++) {
                            try {
                                const match = matches.get(i);
                                if (match && match.trainIdx >= 0 && match.trainIdx < frameKeypoints.size()) {
                                    const kp = frameKeypoints.get(match.trainIdx);
                                    if (kp && kp.pt) {
                                        cv.circle(allKeypointsFrame, kp.pt, 2, [255, 255, 0, 255], -1);
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
                                if (match && match.trainIdx >= 0 && match.trainIdx < frameKeypoints.size()) {
                                    const kp = frameKeypoints.get(match.trainIdx);
                                    if (kp && kp.pt) {
                                        cv.circle(allKeypointsFrame, kp.pt, 2, [0, 255, 0, 255], -1);
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                    
                    // Display processed frame on canvas
                    cv.imshow(this.canvas, allKeypointsFrame);
                    
                    // Clean up the cloned frame
                    allKeypointsFrame.delete();
                } catch (e) {
                    console.error("Error displaying frame:", e);
                }
            } catch (e) {
                // Handle any unexpected errors in the main processing
                console.error("Error in main processing loop:", e);
            } finally {
                // Always clean up ALL OpenCV resources to prevent memory leaks
                try {
                    if (frame) frame.delete();
                    if (frameGray) frameGray.delete();
                    if (frameKeypoints) frameKeypoints.delete();
                    if (frameDescriptors) frameDescriptors.delete();
                    if (matcher) matcher.delete();
                    if (matches) matches.delete();
                    if (goodMatches) goodMatches.delete();
                    if (homography) homography.delete();
                    if (refPointsMat) refPointsMat.delete();
                    if (framePointsMat) framePointsMat.delete();
                    if (cornerPoints) cornerPoints.delete();
                    if (transformedCorners) transformedCorners.delete();
                    if (contours) contours.delete();
                    if (contour) contour.delete();
                } catch (e) {
                    console.error("Error cleaning up resources:", e);
                }
                
                // Reset processing flag to allow next frame
                this.isProcessing = false;
            }
        } catch (error) {
            // Handle errors in the outer try block
            console.error('Error in processVideo:', error);
            this.isProcessing = false;
        }
    }
    
    initThreeJS() {
        // Since we're not using Three.js anymore, just create empty scene
        // to avoid errors in other parts of the code that reference the scene
        this.scene = {};
        this.camera = {};
        this.cube = { visible: false };
        this.renderer = {
            render: () => {},
            setSize: () => {}
        };
    }
    
    updateThreeJS(corners) {
        // This method is now a no-op since we don't need 3D rendering
        // We're only keeping the green rectangle outline drawn with OpenCV
        return;
    }
    
    updateStatus(message) {
        this.statusMessage.textContent = message;
    }
}

// Initialize when page is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ImageTracker();
});