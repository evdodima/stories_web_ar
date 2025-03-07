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

        this.drawKeypoints = false;
        this.maxDimension = 1280; // Maximum allowed dimension while preserving aspect ratio
        
        // Tracking variables
        this.lastCorners = null;
        
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
    
    async waitForOpenCV() {
        window.cv = await cv;
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
            cv.GaussianBlur(this.referenceImageGray, this.referenceImageGray, new cv.Size(3, 3), 0);
            cv.equalizeHist(this.referenceImageGray, this.referenceImageGray);
            
            // Extract features using ORB
            this.detector = new cv.BRISK(50, 3, 1.0);
                        
            const referenceKeypoints = new cv.KeyPointVector();
            this.referenceDescriptors = new cv.Mat();
            
            this.detector.detect(this.referenceImageGray, referenceKeypoints);
            this.detector.compute(this.referenceImageGray, referenceKeypoints, this.referenceDescriptors);
            
            this.referenceKeypoints = referenceKeypoints;
            const maxRefFeatures = 500;  // Adjust this number based on your needs
            let refKeypointsArray = [];
            for (let i = 0; i < this.referenceKeypoints.size(); i++) {
                refKeypointsArray.push(this.referenceKeypoints.get(i));
            }
            refKeypointsArray.sort((a, b) => b.response - a.response);  // Sort by strength
            if (refKeypointsArray.length > maxRefFeatures) {
                refKeypointsArray = refKeypointsArray.slice(0, maxRefFeatures);
            }
            const selectedRefKeypoints = new cv.KeyPointVector();
            for (let kp of refKeypointsArray) {
                selectedRefKeypoints.push_back(kp);
            }
            this.referenceDescriptors = new cv.Mat();
            this.detector.compute(this.referenceImageGray, selectedRefKeypoints, this.referenceDescriptors);
            this.referenceKeypoints = selectedRefKeypoints;
            
            // Update status
            this.updateStatus(`Reference image loaded. Found ${this.referenceKeypoints.size()} features.`);
            
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
    
    initKalmanFilter() {
        try {
            // Reset filter variables
            this.lastCorners = null;
            this.cornerState = null;
            this.predictionQuality = 0;
    
            // Initialize Kalman filter: 16 states (x, y, vx, vy for 4 corners), 8 measurements (x, y for 4 corners)
            this.kalmanFilter = new cv.KalmanFilter(16, 8, 0, cv.CV_32F);
    
            // Transition matrix: constant velocity model (assuming dt = 1 frame)
            const transitionMatrix = this.kalmanFilter.transitionMatrix;
            for (let i = 0; i < 4; i++) {
                const offset = 4 * i;
                // x' = x + vx
                transitionMatrix.floatPtr(offset, offset)[0] = 1;     // x to x
                transitionMatrix.floatPtr(offset, offset + 2)[0] = 1; // vx to x
                // y' = y + vy
                transitionMatrix.floatPtr(offset + 1, offset + 1)[0] = 1; // y to y
                transitionMatrix.floatPtr(offset + 1, offset + 3)[0] = 1; // vy to y
                // vx' = vx, vy' = vy
                transitionMatrix.floatPtr(offset + 2, offset + 2)[0] = 1; // vx to vx
                transitionMatrix.floatPtr(offset + 3, offset + 3)[0] = 1; // vy to vy
            }
    
            // Measurement matrix: observe positions only (8x16)
            const measurementMatrix = this.kalmanFilter.measurementMatrix;
            for (let i = 0; i < 4; i++) {
                measurementMatrix.floatPtr(2 * i, 4 * i)[0] = 1;         // x_i
                measurementMatrix.floatPtr(2 * i + 1, 4 * i + 1)[0] = 1; // y_i
            }
    
            // Process noise covariance: noise on velocities (e.g., acceleration noise)
            // Increased from 25 to 100 for more adaptive velocity changes
            const processNoiseCov = this.kalmanFilter.processNoiseCov;
            for (let i = 0; i < 4; i++) {
                processNoiseCov.floatPtr(4 * i + 2, 4 * i + 2)[0] = 100; // vx variance (10 pixels/frame)
                processNoiseCov.floatPtr(4 * i + 3, 4 * i + 3)[0] = 100; // vy variance (10 pixels/frame)
                
                // Add small process noise to positions for smoother transitions
                processNoiseCov.floatPtr(4 * i, 4 * i)[0] = 1; // x variance
                processNoiseCov.floatPtr(4 * i + 1, 4 * i + 1)[0] = 1; // y variance
            }
    
            // Measurement noise covariance: based on detection accuracy
            // Reduced from 4 to 2 to trust measurements more
            const measurementNoiseCov = this.kalmanFilter.measurementNoiseCov;
            for (let i = 0; i < 8; i++) {
                measurementNoiseCov.floatPtr(i, i)[0] = 2; // variance of 1.4 pixels
            }
    
            // Initial error covariance: high uncertainty
            const errorCovPost = this.kalmanFilter.errorCovPost;
            for (let i = 0; i < 16; i++) {
                errorCovPost.floatPtr(i, i)[0] = 100;
            }
    
            console.log("Enhanced Kalman filter initialized with velocity model");
        } catch (e) {
            console.error("Error initializing Kalman filter:", e);
            this.kalmanFilter = null;
        }
    }
    
    stopTracking() {
        this.isTracking = false;
        this.stopCamera();
    
        if (this.kalmanFilter) {
            this.kalmanFilter.delete();
            this.kalmanFilter = null;
        }
        if (this.cornerState) {
            this.cornerState.delete();
            this.cornerState = null;
        }
        this.lastCorners = null;
    
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
   
                if (frame.cols > this.maxDimension || frame.rows > this.maxDimension) {
                    let scaleFactor = Math.min(this.maxDimension / frame.cols, this.maxDimension / frame.rows);
                    let newSize = new cv.Size(
                        Math.round(frame.cols * scaleFactor),
                        Math.round(frame.rows * scaleFactor)
                    );
                    let resizedFrame = new cv.Mat();
                    cv.resize(frame, resizedFrame, newSize, 0, 0, cv.INTER_AREA);
                    
                    // Optionally update the canvas dimensions to match the new frame size
                    this.canvas.width = newSize.width;
                    this.canvas.height = newSize.height;
                    
                    frame.delete();
                    frame = resizedFrame;
                    console.log('Frame scaled to', newSize.width, 'x', newSize.height);
                }
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
            // cv.GaussianBlur(frameGray, frameGray, new cv.Size(3, 3), 0);
            cv.equalizeHist(frameGray, frameGray);
            
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
                    
                    // Match features using KNN
                    matcher = new cv.BFMatcher(cv.NORM_HAMMING);
                    let knnMatches = new cv.DMatchVectorVector();
                    
                    // Try to match descriptors with k=2 for Lowe's ratio test
                    const k = 2;
                    try {
                        matcher.knnMatch(this.referenceDescriptors, frameDescriptors, knnMatches, k);
                    } catch (e) {
                        console.error("Error in KNN matching:", e);
                        // Fallback to regular matching if KNN fails
                        matches = new cv.DMatchVector();
                        matcher.match(this.referenceDescriptors, frameDescriptors, matches);
                        
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
                        return; // Skip the KNN ratio test code below
                    }
                    
                    // Using Lowe's ratio test from KNN matches
                    matches = new cv.DMatchVector(); // For visualization
                    goodMatches = new cv.DMatchVector();
                    
                    // Apply Lowe's ratio test
                    const ratioThreshold = 0.8;
                    
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
                            homography = cv.findHomography(refPointsMat, framePointsMat, cv.RANSAC, 5.0);
                            
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
                                                    
                                                    // Apply Kalman filter to smooth the corners
                                                    if (this.kalmanFilter) {
                                                        const corners = [];
                                                        for (let i = 0; i < 4; i++) {
                                                            corners.push(transformedCorners.data32F[i * 2]); // x
                                                            corners.push(transformedCorners.data32F[i * 2 + 1]); // y
                                                        }
                                                        
                                                        // Apply Kalman filtering to these corners
                                                        const filteredCorners = this.applyKalmanFilter(corners);
                                                        
                                                        if (filteredCorners) {
                                                            // Create new contour with filtered corners
                                                            let filteredContour = new cv.Mat();
                                                            filteredContour.create(4, 1, cv.CV_32SC2);
                                                            
                                                            const filteredPoints = [
                                                                new cv.Point(filteredCorners[0], filteredCorners[1]),
                                                                new cv.Point(filteredCorners[2], filteredCorners[3]),
                                                                new cv.Point(filteredCorners[4], filteredCorners[5]),
                                                                new cv.Point(filteredCorners[6], filteredCorners[7])
                                                            ];
                                                            
                                                            const flatFilteredPoints = filteredPoints.flatMap(p => [p.x, p.y]);
                                                            
                                                            filteredContour.data32S.set(flatFilteredPoints);
                                                            
                                                            // Create new contours with just the filtered contour
                                                            const filteredContours = new cv.MatVector();
                                                            filteredContours.push_back(filteredContour);
                                                            
                                                            // Draw contour with Kalman filtered corners
                                                            cv.drawContours(frame, filteredContours, 0, [0, 255, 0, 255], 3);
                                                            
                                                            // Clean up
                                                            filteredContours.delete();
                                                            
                                                            // Clean up
                                                            filteredContour.delete();
                                                        } else {
                                                            // If Kalman filter isn't ready yet, use unfiltered corners
                                                            cv.drawContours(frame, contours, 0, [0, 255, 0, 255], 3);
                                                        }
                                                    } else {
                                                        // If Kalman filter not available, use unfiltered contour
                                                        cv.drawContours(frame, contours, 0, [0, 255, 0, 255], 3);
                                                    }
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
                    if (this.drawKeypoints) {
                        // Create a clone of the frame for drawing keypoints
                        let allKeypointsFrame = frame.clone();
                        
                        // Draw keypoints manually for each category
                        
                        // All keypoints in blue (smaller)
                        for (let i = 0; i < frameKeypoints.size(); i++) {
                            try {
                                const kp = frameKeypoints.get(i);
                                if (kp && kp.pt) {
                                    cv.circle(allKeypointsFrame, kp.pt, 1, [255, 0, 0, 255], -1);
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
                        
                        // Display the processed frame with keypoints
                        cv.imshow(this.canvas, allKeypointsFrame);
                        
                        // Clean up the cloned frame
                        allKeypointsFrame.delete();
                    } else {
                        // If keypoints drawing is turned off, display the original frame
                        cv.imshow(this.canvas, frame);
                    }
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

// Then update the applyKalmanFilter method:
applyKalmanFilter(corners) {
    if (!this.kalmanFilter || !corners || corners.length !== 8) {
        return null;
    }

    try {
        // Create measurement matrix
        const measurement = new cv.Mat(8, 1, cv.CV_32F);
        for (let i = 0; i < 4; i++) {
            measurement.floatPtr(2 * i, 0)[0] = corners[2 * i];     // x_i
            measurement.floatPtr(2 * i + 1, 0)[0] = corners[2 * i + 1]; // y_i
        }

        // If this is the first detection or we need to reset after just 3 frames of tracking loss
        if (!this.cornerState || this.framesSinceLastMeasurement > 3) {
            console.log("Initializing/Resetting Kalman filter");
            
            // Clean up old state if it exists
            if (this.cornerState) {
                this.cornerState.delete();
            }
            
            // Initialize state with positions and zero velocities
            this.cornerState = new cv.Mat(16, 1, cv.CV_32F);
            for (let i = 0; i < 4; i++) {
                this.cornerState.floatPtr(4 * i, 0)[0] = corners[2 * i];     // x
                this.cornerState.floatPtr(4 * i + 1, 0)[0] = corners[2 * i + 1]; // y
                this.cornerState.floatPtr(4 * i + 2, 0)[0] = 0;              // vx
                this.cornerState.floatPtr(4 * i + 3, 0)[0] = 0;              // vy
            }
            
            // Properly set the initial state by copying values directly
            for (let i = 0; i < 16; i++) {
                this.kalmanFilter.statePost.floatPtr(i, 0)[0] = this.cornerState.floatPtr(i, 0)[0];
            }
            
            // Reset error covariance to high uncertainty
            const errorCovPost = this.kalmanFilter.errorCovPost;
            for (let i = 0; i < 16; i++) {
                errorCovPost.floatPtr(i, i)[0] = 100;
            }
            
            this.lastCorners = [...corners];
            this.predictionQuality = 1.0;
            this.framesSinceLastMeasurement = 0;
            measurement.delete();
            return corners; // Return unfiltered corners initially
        }

        // Predict next state
        const prediction = this.kalmanFilter.predict();

        // Check if the measurement is too far from prediction (potential outlier)
        let isOutlier = false;
        let maxDistance = 0;
        // Reduced maxJump to be more sensitive to changes
        const maxJump = 300; // Maximum allowed jump in pixels (reduced from 50)
        
        for (let i = 0; i < 4; i++) {
            const predX = prediction.floatPtr(4 * i, 0)[0];
            const predY = prediction.floatPtr(4 * i + 1, 0)[0];
            const measX = corners[2 * i];
            const measY = corners[2 * i + 1];
            
            const distance = Math.sqrt(Math.pow(predX - measX, 2) + Math.pow(predY - measY, 2));
            maxDistance = Math.max(maxDistance, distance);
            
            if (distance > maxJump) {
                isOutlier = true;
                break;
            }
        }
        
        // Accept measurements more readily after just 2 frames of prediction
        if (this.framesSinceLastMeasurement > 2 && maxDistance < 100) {
            isOutlier = false;
            console.log("Accepting measurement after brief prediction-only period");
        }
        
        // If measurement is an outlier, use prediction with reduced confidence
        if (isOutlier) {
            console.log("Outlier detected, using prediction");
            
            // Reduce prediction quality very aggressively
            this.predictionQuality = Math.max(0.1, this.predictionQuality - 0.5);
            this.framesSinceLastMeasurement++;
            
            // Extract predicted positions
            const predictedCorners = [];
            for (let i = 0; i < 4; i++) {
                predictedCorners.push(prediction.floatPtr(4 * i, 0)[0]);     // x_i
                predictedCorners.push(prediction.floatPtr(4 * i + 1, 0)[0]); // y_i
            }
            
            // Dampen velocities immediately after just 1 frame
            if (this.framesSinceLastMeasurement > 1) {
                // Stronger damping factor to quickly reduce velocity
                for (let i = 0; i < 4; i++) {
                    const dampingFactor = Math.max(0, 1 - (this.framesSinceLastMeasurement - 1) * 0.5);
                    this.kalmanFilter.statePost.floatPtr(4 * i + 2, 0)[0] *= dampingFactor; // vx
                    this.kalmanFilter.statePost.floatPtr(4 * i + 3, 0)[0] *= dampingFactor; // vy
                }
                console.log(`Damping velocities after ${this.framesSinceLastMeasurement} frames without measurement`);
            }
            
            // Freeze position after just 3 frames
            if (this.framesSinceLastMeasurement > 2) {
                for (let i = 0; i < 4; i++) {
                    this.kalmanFilter.statePost.floatPtr(4 * i + 2, 0)[0] = 0; // vx = 0
                    this.kalmanFilter.statePost.floatPtr(4 * i + 3, 0)[0] = 0; // vy = 0
                }
                console.log("Freezing position after brief tracking loss");
            }
            
            this.lastCorners = [...predictedCorners];
            measurement.delete();
            return predictedCorners;
        }

        // We have a good measurement - reset the counter
        this.framesSinceLastMeasurement = 0;

        // If we're recovering from prediction-only tracking, even briefly
        if (this.predictionQuality < 0.8) {
            // Higher blend factor to trust new measurements more
            const blendFactor = 0.7; // How much to trust the new measurement (increased from 0.3)
            const blendedMeasurement = new cv.Mat(8, 1, cv.CV_32F);
            
            for (let i = 0; i < 8; i++) {
                const predValue = prediction.floatPtr(Math.floor(i/2)*4 + i%2, 0)[0];
                const measValue = measurement.floatPtr(i, 0)[0];
                blendedMeasurement.floatPtr(i, 0)[0] = 
                    predValue * (1 - blendFactor) + measValue * blendFactor;
            }
            
            // Use the blended measurement for correction
            const correctedState = this.kalmanFilter.correct(blendedMeasurement);
            blendedMeasurement.delete();
            
            // Rapidly increase prediction quality
            this.predictionQuality = Math.min(1.5, this.predictionQuality + 0.5);
            
            // Extract filtered positions
            const filteredCorners = [];
            for (let i = 0; i < 4; i++) {
                filteredCorners.push(correctedState.floatPtr(4 * i, 0)[0]);     // x_i
                filteredCorners.push(correctedState.floatPtr(4 * i + 1, 0)[0]); // y_i
            }
            
            this.lastCorners = [...filteredCorners];
            measurement.delete();
            return filteredCorners;
        }

        // Normal case - good measurement, good prediction quality
        const correctedState = this.kalmanFilter.correct(measurement);

        // Extract filtered positions
        const filteredCorners = [];
        for (let i = 0; i < 4; i++) {
            filteredCorners.push(correctedState.floatPtr(4 * i, 0)[0]);     // x_i
            filteredCorners.push(correctedState.floatPtr(4 * i + 1, 0)[0]); // y_i
        }

        // Update state and quality
        this.lastCorners = [...filteredCorners];
        this.predictionQuality = 1.5; // Strong prediction quality when we have good measurements

        measurement.delete();
        return filteredCorners;
    } catch (e) {
        console.error("Error in Kalman filter:", e);
        return corners; // Fallback to unfiltered corners
    }
}
    
    updateStatus(message) {
        this.statusMessage.textContent = message;
    }
}

// Initialize when page is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ImageTracker();
});