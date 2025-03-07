// ImageTrackerSDK - Modular implementation with callbacks
// Main components:
// - TrackerCore: Main API facade
// - OpenCVLoader: Handles loading and initializing OpenCV
// - CameraManager: Handles camera access and video streaming
// - FeatureDetector: Handles feature detection and matching
// - KalmanFilter: Handles pose smoothing
// - RendererModule: Handles rendering

/**
 * OpenCVLoader - Handles loading and initializing OpenCV
 */
class OpenCVLoader {
    constructor(onReady, onError) {
        this.onReady = onReady;
        this.onError = onError;
        this.isReady = false;
    }

    async init() {
        try {
            // Wait for OpenCV to be loaded
            window.cv = await cv;

            // Check if OpenCV is loaded with all required features
            if (typeof cv === 'undefined' || 
                typeof cv.BFMatcher !== 'function' || 
                typeof cv.ORB !== 'function' || 
                typeof cv.DMatchVector !== 'function') {
                
                setTimeout(this.init.bind(this), 500);
                return;
            }

            this.isReady = true;
            if (this.onReady) this.onReady();
        } catch (error) {
            if (this.onError) this.onError(`OpenCV loading error: ${error.message}`);
        }
    }
}

/**
 * CameraManager - Handles camera access and video streaming
 */
class CameraManager {
    constructor(options = {}) {
        this.videoElement = options.videoElement;
        this.onCameraStarted = options.onCameraStarted;
        this.onCameraError = options.onCameraError;
        this.stream = null;
        this.displaySize = { width: 0, height: 0 };
        this.videoSize = { width: 0, height: 0 };
        this.scaleRatio = { x: 1, y: 1 };

        // Default camera settings - aim for highest resolution
        this.cameraSettings = options.cameraSettings || {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'environment'
        };
    }

    async startCamera() {
        try {
            const constraints = {
                video: this.cameraSettings,
                audio: false
            };
            
            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            this.videoElement.play();
            
            // Wait for video to be ready with dimensions
            return new Promise((resolve) => {
                const checkVideo = () => {
                    if (this.videoElement.readyState >= 2 && 
                        this.videoElement.videoWidth > 0 && 
                        this.videoElement.videoHeight > 0) {
                        
                        // Store actual video dimensions
                        this.videoSize = {
                            width: this.videoElement.videoWidth,
                            height: this.videoElement.videoHeight
                        };
                        
                        // Get display dimensions
                        this.displaySize = {
                            width: this.videoElement.clientWidth,
                            height: this.videoElement.clientHeight
                        };
                        
                        // Calculate scale ratios for coordinate conversion
                        this.updateScaleRatio();
                        
                        if (this.onCameraStarted) this.onCameraStarted({
                            videoSize: this.videoSize,
                            displaySize: this.displaySize,
                            scaleRatio: this.scaleRatio
                        });
                        
                        resolve({
                            videoSize: this.videoSize,
                            displaySize: this.displaySize,
                            scaleRatio: this.scaleRatio
                        });
                    } else {
                        setTimeout(checkVideo, 100);
                    }
                };
                
                checkVideo();
                
                this.videoElement.addEventListener('loadeddata', () => {
                    if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                        // Store actual video dimensions
                        this.videoSize = {
                            width: this.videoElement.videoWidth,
                            height: this.videoElement.videoHeight
                        };
                        
                        // Get display dimensions
                        this.displaySize = {
                            width: this.videoElement.clientWidth,
                            height: this.videoElement.clientHeight
                        };
                        
                        // Calculate scale ratios for coordinate conversion
                        this.updateScaleRatio();
                        
                        if (this.onCameraStarted) this.onCameraStarted({
                            videoSize: this.videoSize,
                            displaySize: this.displaySize,
                            scaleRatio: this.scaleRatio
                        });
                        
                        resolve({
                            videoSize: this.videoSize,
                            displaySize: this.displaySize,
                            scaleRatio: this.scaleRatio
                        });
                    }
                });
                
                // Add resize listener to update scaling ratios when window size changes
                window.addEventListener('resize', this.handleResize.bind(this));
            });
        } catch (error) {
            if (this.onCameraError) this.onCameraError(error);
            throw error;
        }
    }

    handleResize() {
        // Update display dimensions
        this.displaySize = {
            width: this.videoElement.clientWidth,
            height: this.videoElement.clientHeight
        };
        
        // Recalculate scale ratios
        this.updateScaleRatio();
    }
    
    updateScaleRatio() {
        // Calculate aspect ratios
        const videoAspect = this.videoSize.width / this.videoSize.height;
        const displayAspect = this.displaySize.width / this.displaySize.height;
        
        // The object-fit: cover in CSS means:
        // - If video is wider than display (videoAspect > displayAspect), 
        //   video is scaled to match display height and cropped on sides
        // - If video is taller than display (videoAspect < displayAspect),
        //   video is scaled to match display width and cropped on top/bottom
        
        let scaledVideoWidth, scaledVideoHeight;
        
        if (videoAspect > displayAspect) {
            // Video is wider than display - match height
            scaledVideoHeight = this.displaySize.height;
            scaledVideoWidth = scaledVideoHeight * videoAspect;
        } else {
            // Video is taller than display - match width
            scaledVideoWidth = this.displaySize.width;
            scaledVideoHeight = scaledVideoWidth / videoAspect;
        }
        
        // Calculate x and y offset for centering
        const xOffset = (this.displaySize.width - scaledVideoWidth) / 2;
        const yOffset = (this.displaySize.height - scaledVideoHeight) / 2;
        
        // Calculate scale ratios (from source video to display)
        this.scaleRatio = {
            x: scaledVideoWidth / this.videoSize.width,
            y: scaledVideoHeight / this.videoSize.height,
            xOffset: xOffset,
            yOffset: yOffset
        };
    }
    
    // Convert video coordinates to display coordinates
    videoToDisplayCoords(x, y) {
        // Scale coordinates based on ratio and add offset
        const displayX = (x * this.scaleRatio.x) + this.scaleRatio.xOffset;
        const displayY = (y * this.scaleRatio.y) + this.scaleRatio.yOffset;
        return { x: displayX, y: displayY };
    }
    
    // Convert display coordinates to video coordinates
    displayToVideoCoords(x, y) {
        // Remove offset and scale coordinates based on inverse ratio
        const videoX = (x - this.scaleRatio.xOffset) / this.scaleRatio.x;
        const videoY = (y - this.scaleRatio.yOffset) / this.scaleRatio.y;
        return { x: videoX, y: videoY };
    }

    stopCamera() {
        if (this.stream) {
            const tracks = this.stream.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
            this.stream = null;
        }
        
        // Remove resize listener
        window.removeEventListener('resize', this.handleResize.bind(this));
    }

    captureFrame() {
        if (!this.videoElement || 
            !this.videoElement.videoWidth || 
            !this.videoElement.videoHeight) {
            return null;
        }

        // Create a canvas to capture the video frame
        const captureCanvas = document.createElement('canvas');
        const captureContext = captureCanvas.getContext('2d');
        
        // Set dimensions to match video
        captureCanvas.width = this.videoElement.videoWidth;
        captureCanvas.height = this.videoElement.videoHeight;
        
        // Draw the current video frame to the canvas
        captureContext.drawImage(this.videoElement, 0, 0, captureCanvas.width, captureCanvas.height);
        
        return captureCanvas;
    }
}

/**
 * FeatureDetector - Handles feature detection and matching
 */
class FeatureDetector {
    constructor(options = {}) {
        this.maxFeatures = options.maxFeatures || 1000;
        this.detector = null;
        this.referenceImage = null;
        this.referenceImageGray = null;
        this.referenceKeypoints = null;
        this.referenceDescriptors = null;
        this.initialized = false;
    }

    initialize() {
        if (!window.cv) {
            throw new Error("OpenCV is not loaded");
        }

        // Initialize BRISK detector with parameters
        this.detector = new cv.BRISK(50, 3, 1.0);
        this.initialized = true;
    }

    loadReferenceImage(imageElement) {
        if (!this.initialized) {
            this.initialize();
        }

        try {
            // Convert to OpenCV format
            this.referenceImage = cv.imread(imageElement);
            
            // Convert to grayscale for feature detection
            this.referenceImageGray = new cv.Mat();
            cv.cvtColor(this.referenceImage, this.referenceImageGray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(this.referenceImageGray, this.referenceImageGray, new cv.Size(3, 3), 0);
            cv.equalizeHist(this.referenceImageGray, this.referenceImageGray);
            
            // Extract features using BRISK
            const referenceKeypoints = new cv.KeyPointVector();
            this.referenceDescriptors = new cv.Mat();
            
            this.detector.detect(this.referenceImageGray, referenceKeypoints);
            this.detector.compute(this.referenceImageGray, referenceKeypoints, this.referenceDescriptors);
            
            // Limit number of features by strength
            let refKeypointsArray = [];
            for (let i = 0; i < referenceKeypoints.size(); i++) {
                refKeypointsArray.push(referenceKeypoints.get(i));
            }
            refKeypointsArray.sort((a, b) => b.response - a.response);  
            
            if (refKeypointsArray.length > this.maxFeatures) {
                refKeypointsArray = refKeypointsArray.slice(0, this.maxFeatures);
            }
            
            const selectedRefKeypoints = new cv.KeyPointVector();
            for (let kp of refKeypointsArray) {
                selectedRefKeypoints.push_back(kp);
            }
            
            this.referenceDescriptors = new cv.Mat();
            this.detector.compute(this.referenceImageGray, selectedRefKeypoints, this.referenceDescriptors);
            this.referenceKeypoints = selectedRefKeypoints;
            
            return {
                success: true,
                featureCount: this.referenceKeypoints.size()
            };
        } catch (error) {
            console.error("Error loading reference image:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    processFrame(frameCanvas, options = {}) {
        if (!this.initialized || !this.referenceKeypoints || !this.referenceDescriptors) {
            return {
                success: false,
                error: "Detector not initialized or reference image not loaded"
            };
        }

        const drawKeypoints = options.drawKeypoints || false;
        const maxDimension = options.maxDimension || 1280;

        // We'll store OpenCV resources here for proper cleanup
        let frame = null;
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
        let knnMatches = null;
        let contours = null;
        let contour = null;
        
        try {
            // Check if canvas is valid
            if (!frameCanvas || !frameCanvas.width || !frameCanvas.height) {
                return {
                    success: false,
                    error: "Invalid frame canvas provided"
                };
            }
            
            // Read the image data from the canvas into an OpenCV matrix
            try {
                frame = cv.imread(frameCanvas);
            } catch (e) {
                return {
                    success: false,
                    error: "Failed to read frame from canvas: " + e.message
                };
            }
            
            // Verify frame was created correctly
            if (!frame || frame.empty() || frame.rows <= 0 || frame.cols <= 0) {
                if (frame) frame.delete();
                return {
                    success: false,
                    error: "Empty or invalid frame captured"
                };
            }
            
            // Resize frame if it's too large - using a simpler, more stable approach
            if (frame.cols > maxDimension || frame.rows > maxDimension) {
                try {
                    // Calculate a simple scale factor - avoid complex math that might cause issues
                    let scaleFactor = 1.0;
                    if (frame.cols >= frame.rows && frame.cols > maxDimension) {
                        scaleFactor = maxDimension / frame.cols;
                    } else if (frame.rows > frame.cols && frame.rows > maxDimension) {
                        scaleFactor = maxDimension / frame.rows;
                    }
                    
                    // Only resize if we actually need to (scale factor < 1)
                    if (scaleFactor < 1.0) {
                        // Calculate new dimensions with integer math to avoid floating point issues
                        const newWidth = Math.max(32, Math.floor(frame.cols * scaleFactor));
                        const newHeight = Math.max(32, Math.floor(frame.rows * scaleFactor));
                        
                        // Create a new size object
                        const newSize = new cv.Size(newWidth, newHeight);
                        const resizedFrame = new cv.Mat();
                        
                        // Use a simpler interpolation method
                        cv.resize(frame, resizedFrame, newSize, 0, 0, cv.INTER_LINEAR);
                        
                        // Only replace if resize worked
                        if (!resizedFrame.empty() && resizedFrame.rows > 0 && resizedFrame.cols > 0) {
                            const temp = frame;
                            frame = resizedFrame;
                            temp.delete();
                        } else {
                            resizedFrame.delete();
                        }
                    }
                } catch (e) {
                    console.error("Error resizing frame:", e);
                    // Continue with original frame - don't try further operations on this frame
                }
            }
            
            // Convert to grayscale
            try {
                frameGray = new cv.Mat();
                cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);
                cv.equalizeHist(frameGray, frameGray);
            } catch (e) {
                return {
                    success: false,
                    error: "Failed to convert frame to grayscale: " + e.message,
                    processedFrame: frame.clone()
                };
            }
            
            // Detect features with error handling
            try {
                frameKeypoints = new cv.KeyPointVector();
                frameDescriptors = new cv.Mat();
                
                this.detector.detect(frameGray, frameKeypoints);
                
                // Only compute descriptors if keypoints were found
                if (frameKeypoints.size() > 0) {
                    this.detector.compute(frameGray, frameKeypoints, frameDescriptors);
                }
            } catch (e) {
                return {
                    success: false,
                    error: "Failed to detect features: " + e.message,
                    processedFrame: frame.clone()
                };
            }
            
            // Only proceed if we have enough features to match
            if (frameKeypoints.size() <= 10 || 
                !frameDescriptors || frameDescriptors.empty() || 
                frameDescriptors.rows <= 0 || 
                frameDescriptors.cols !== this.referenceDescriptors.cols) {
                
                // Return processed frame for visualization but no tracking results
                return {
                    success: false,
                    error: "Not enough features detected for matching",
                    processedFrame: frame.clone()
                };
            }
            
            // Match features using KNN with extensive error handling
            try {
                matcher = new cv.BFMatcher(cv.NORM_HAMMING);
                knnMatches = new cv.DMatchVectorVector();
                
                // Try to match descriptors with k=2 for Lowe's ratio test
                const k = 2;
                let matchingSuccess = true;
                
                try {
                    matcher.knnMatch(this.referenceDescriptors, frameDescriptors, knnMatches, k);
                } catch (e) {
                    matchingSuccess = false;
                    console.warn("KNN matching failed, falling back to regular matching:", e);
                    
                    // Fallback to regular matching if KNN fails
                    matches = new cv.DMatchVector();
                    try {
                        matcher.match(this.referenceDescriptors, frameDescriptors, matches);
                    } catch (matchErr) {
                        console.error("Even regular matching failed:", matchErr);
                        return {
                            success: false,
                            error: "Feature matching failed",
                            processedFrame: frame.clone()
                        };
                    }
                    
                    // Create a fallback goodMatches based on distance threshold
                    goodMatches = new cv.DMatchVector();
                    
                    if (matches && matches.size() > 0) {
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
                
                if (matchingSuccess && knnMatches) {
                    // Using Lowe's ratio test from KNN matches
                    matches = new cv.DMatchVector(); 
                    goodMatches = new cv.DMatchVector();
                    
                    // Apply Lowe's ratio test
                    const ratioThreshold = 0.7;
                    
                    for (let i = 0; i < knnMatches.size(); i++) {
                        try {
                            const matchPair = knnMatches.get(i);
                            if (!matchPair) continue;
                            
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
                    try {
                        if (knnMatches) {
                            knnMatches.delete();
                            knnMatches = null;
                        }
                    } catch (e) {
                        console.warn("Failed to clean up knnMatches:", e);
                    }
                }
            } catch (e) {
                console.error("Error in feature matching process:", e);
                return {
                    success: false,
                    error: "Feature matching process failed: " + e.message,
                    processedFrame: frame.clone()
                };
            }
            
            // Check if we have enough good matches for homography
            if (!goodMatches || goodMatches.size() < 10) {
                // Draw keypoints if requested and return
                if (drawKeypoints) {
                    try {
                        this._drawKeypoints(frame, frameKeypoints, matches, goodMatches);
                    } catch (e) {
                        console.warn("Failed to draw keypoints:", e);
                    }
                }
                
                return {
                    success: false,
                    error: "Not enough good matches for tracking",
                    processedFrame: frame.clone(), 
                    matchCount: goodMatches ? goodMatches.size() : 0
                };
            }
            
            // Extract point pairs from matches - this part is critical for memory issues
            try {
                const referencePoints = [];
                const framePoints = [];
                
                // Use a safer limit to avoid memory issues
                const matchLimit = Math.min(goodMatches.size(), 100);
                
                for (let i = 0; i < matchLimit; i++) {
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
                if (referencePoints.length < 16 || framePoints.length < 16) {
                    // Draw keypoints if requested and return
                    if (drawKeypoints) {
                        try {
                            this._drawKeypoints(frame, frameKeypoints, matches, goodMatches);
                        } catch (e) {
                            console.warn("Failed to draw keypoints:", e);
                        }
                    }
                    
                    return {
                        success: false,
                        error: "Not enough valid point pairs for homography",
                        processedFrame: frame.clone()
                    };
                }
                
                // Create point matrices for homography calculation
                try {
                    refPointsMat = cv.matFromArray(referencePoints.length / 2, 1, cv.CV_32FC2, referencePoints);
                    framePointsMat = cv.matFromArray(framePoints.length / 2, 1, cv.CV_32FC2, framePoints);
                } catch (e) {
                    console.error("Error creating point matrices:", e);
                    return {
                        success: false,
                        error: "Failed to create point matrices: " + e.message,
                        processedFrame: frame.clone()
                    };
                }
                
                // Calculate homography matrix
                try {
                    homography = cv.findHomography(refPointsMat, framePointsMat, cv.RANSAC, 5.0);
                } catch (e) {
                    console.error("Error finding homography:", e);
                    return {
                        success: false,
                        error: "Failed to find homography: " + e.message,
                        processedFrame: frame.clone()
                    };
                }
                
                // Only proceed if we got a valid homography
                if (!homography || homography.empty()) {
                    // Draw keypoints if requested and return
                    if (drawKeypoints) {
                        try {
                            this._drawKeypoints(frame, frameKeypoints, matches, goodMatches);
                        } catch (e) {
                            console.warn("Failed to draw keypoints:", e);
                        }
                    }
                    
                    return {
                        success: false,
                        error: "Failed to find valid homography",
                        processedFrame: frame.clone()
                    };
                }
                
                // Set up corners of reference image for transformation
                try {
                    cornerPoints = new cv.Mat(4, 1, cv.CV_32FC2);
                    
                    // Make sure we can safely access the cornerData
                    if (!cornerPoints.data32F || cornerPoints.data32F.length < 8) {
                        return {
                            success: false,
                            error: "Failed to create corner points",
                            processedFrame: frame.clone()
                        };
                    }
                    
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
                } catch (e) {
                    console.error("Error setting up corner points:", e);
                    return {
                        success: false,
                        error: "Failed to set up corner points: " + e.message,
                        processedFrame: frame.clone()
                    };
                }
                
                // Transform corners using homography
                try {
                    transformedCorners = new cv.Mat();
                    cv.perspectiveTransform(cornerPoints, transformedCorners, homography);
                } catch (e) {
                    console.error("Error transforming corners:", e);
                    return {
                        success: false,
                        error: "Failed to transform corners: " + e.message,
                        processedFrame: frame.clone()
                    };
                }
                
                // Make sure transformed corners data is accessible
                if (!transformedCorners || !transformedCorners.data32F || 
                    transformedCorners.data32F.length < 8) {
                    return {
                        success: false,
                        error: "Failed to access transformed corners data",
                        processedFrame: frame.clone()
                    };
                }
                
                // Validate transformed corner coordinates
                let validContour = true;
                const contourPoints = [];
                const cornerArray = [];
                
                try {
                    for (let i = 0; i < 4; i++) {
                        const x = transformedCorners.data32F[i * 2];
                        const y = transformedCorners.data32F[i * 2 + 1];
                        
                        if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
                            validContour = false;
                            break;
                        }
                        
                        // Check if corners are within a reasonable range
                        const maxCoord = 10000; // Arbitrary large but reasonable number
                        if (Math.abs(x) > maxCoord || Math.abs(y) > maxCoord) {
                            validContour = false;
                            break;
                        }
                        
                        contourPoints.push(new cv.Point(x, y));
                        cornerArray.push(x, y);
                    }
                } catch (e) {
                    console.error("Error validating corner coordinates:", e);
                    validContour = false;
                }
                
                // Draw contour if coordinates are valid
                if (validContour) {
                    try {
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
                                
                                // Draw contour with a more visible style
                                // First draw a thicker green outline
                                cv.drawContours(frame, contours, 0, [0, 255, 0, 255], 4);
                                
                                // Then draw corner points as larger circles
                                for (let i = 0; i < contourPoints.length; i++) {
                                    const point = contourPoints[i];
                                    // Draw larger circle at each corner
                                    cv.circle(frame, point, 8, [255, 0, 0, 255], -1); // Filled red circle
                                    cv.circle(frame, point, 8, [255, 255, 255, 255], 2); // White outline
                                }
                            }
                        } catch (e) {
                            console.error("Error drawing contour:", e);
                        }
                        
                        // Draw keypoints if requested
                        if (drawKeypoints) {
                            try {
                                this._drawKeypoints(frame, frameKeypoints, matches, goodMatches);
                            } catch (e) {
                                console.warn("Failed to draw keypoints:", e);
                            }
                        }
                        
                        // Clean up contour resources
                        try {
                            if (contours) {
                                contours.delete();
                                contours = null;
                            }
                            if (contour) {
                                contour.delete();
                                contour = null;
                            }
                        } catch (e) {
                            console.warn("Failed to clean up contour resources:", e);
                        }
                        
                        return {
                            success: true,
                            corners: cornerArray,
                            homography: homography,
                            processedFrame: frame.clone()
                        };
                    } catch (e) {
                        console.error("Error drawing contour section:", e);
                        return {
                            success: false,
                            error: "Error in contour drawing: " + e.message,
                            processedFrame: frame.clone()
                        };
                    }
                }
                
                return {
                    success: false,
                    error: "Invalid contour points detected",
                    processedFrame: frame.clone()
                };
            } catch (e) {
                console.error("Critical error in point processing:", e);
                return {
                    success: false,
                    error: "Critical error in point processing: " + e.message,
                    processedFrame: frame ? frame.clone() : null
                };
            }
            
        } catch (error) {
            console.error("Error in feature detection:", error);
            return {
                success: false,
                error: error.message,
                processedFrame: frame ? frame.clone() : null
            };
        } finally {
            // Clean up OpenCV resources
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
                if (knnMatches) knnMatches.delete();
                if (contours) contours.delete();
                if (contour) contour.delete();
            } catch (e) {
                console.error("Error during cleanup:", e);
            }
        }
    }
    
    _drawKeypoints(frame, frameKeypoints, matches, goodMatches) {
        try {
            // Draw all keypoints in blue (smaller)
            for (let i = 0; i < frameKeypoints.size(); i++) {
                try {
                    const kp = frameKeypoints.get(i);
                    if (kp && kp.pt) {
                        cv.circle(frame, kp.pt, 1, [255, 0, 0, 255], -1);
                    }
                } catch (e) {}
            }
            
            // Draw matched keypoints in yellow (medium)
            if (matches && matches.size() > 0) {
                for (let i = 0; i < matches.size(); i++) {
                    try {
                        const match = matches.get(i);
                        if (match && match.trainIdx >= 0 && match.trainIdx < frameKeypoints.size()) {
                            const kp = frameKeypoints.get(match.trainIdx);
                            if (kp && kp.pt) {
                                cv.circle(frame, kp.pt, 2, [255, 255, 0, 255], -1);
                            }
                        }
                    } catch (e) {}
                }
            }
            
            // Draw good matches in green (larger)
            if (goodMatches && goodMatches.size() > 0) {
                for (let i = 0; i < goodMatches.size(); i++) {
                    try {
                        const match = goodMatches.get(i);
                        if (match && match.trainIdx >= 0 && match.trainIdx < frameKeypoints.size()) {
                            const kp = frameKeypoints.get(match.trainIdx);
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

    cleanup() {
        if (this.referenceImage) {
            this.referenceImage.delete();
            this.referenceImage = null;
        }
        
        if (this.referenceImageGray) {
            this.referenceImageGray.delete();
            this.referenceImageGray = null;
        }
        
        if (this.referenceKeypoints) {
            this.referenceKeypoints.delete();
            this.referenceKeypoints = null;
        }
        
        if (this.referenceDescriptors) {
            this.referenceDescriptors.delete();
            this.referenceDescriptors = null;
        }
        
        if (this.detector) {
            this.detector.delete();
            this.detector = null;
        }
        
        this.initialized = false;
    }
}

/**
 * KalmanFilterTracker - Handles pose smoothing with Kalman filter
 */
class KalmanFilterTracker {
    constructor() {
        this.kalmanFilter = null;
        this.cornerState = null;
        this.lastCorners = null;
        this.predictionQuality = 0;
        this.framesSinceLastMeasurement = 0;
    }

    init() {
        try {
            // Reset filter variables
            this.lastCorners = null;
            this.cornerState = null;
            this.predictionQuality = 0;
            this.framesSinceLastMeasurement = 0;
    
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
            const processNoiseCov = this.kalmanFilter.processNoiseCov;
            for (let i = 0; i < 4; i++) {
                processNoiseCov.floatPtr(4 * i + 2, 4 * i + 2)[0] = 100; // vx variance
                processNoiseCov.floatPtr(4 * i + 3, 4 * i + 3)[0] = 100; // vy variance
                
                // Add small process noise to positions for smoother transitions
                processNoiseCov.floatPtr(4 * i, 4 * i)[0] = 1; // x variance
                processNoiseCov.floatPtr(4 * i + 1, 4 * i + 1)[0] = 1; // y variance
            }
    
            // Measurement noise covariance: based on detection accuracy
            const measurementNoiseCov = this.kalmanFilter.measurementNoiseCov;
            for (let i = 0; i < 8; i++) {
                measurementNoiseCov.floatPtr(i, i)[0] = 2; // variance of 1.4 pixels
            }
    
            // Initial error covariance: high uncertainty
            const errorCovPost = this.kalmanFilter.errorCovPost;
            for (let i = 0; i < 16; i++) {
                errorCovPost.floatPtr(i, i)[0] = 100;
            }
            
            return true;
        } catch (e) {
            console.error("Error initializing Kalman filter:", e);
            this.kalmanFilter = null;
            return false;
        }
    }

    filterCorners(corners) {
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
            const maxJump = 30000; // Maximum allowed jump in pixels
            
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
            }
            
            // If measurement is an outlier, use prediction with reduced confidence
            if (isOutlier) {
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
                }
                
                // Freeze position after just 3 frames
                if (this.framesSinceLastMeasurement > 2) {
                    for (let i = 0; i < 4; i++) {
                        this.kalmanFilter.statePost.floatPtr(4 * i + 2, 0)[0] = 0; // vx = 0
                        this.kalmanFilter.statePost.floatPtr(4 * i + 3, 0)[0] = 0; // vy = 0
                    }
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
                const blendFactor = 0.7; // How much to trust the new measurement
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

    cleanup() {
        if (this.kalmanFilter) {
            this.kalmanFilter.delete();
            this.kalmanFilter = null;
        }
        
        if (this.cornerState) {
            this.cornerState.delete();
            this.cornerState = null;
        }
        
        this.lastCorners = null;
        this.predictionQuality = 0;
        this.framesSinceLastMeasurement = 0;
    }
}

/**
 * RendererModule - Handles rendering output to canvas
 */
class RendererModule {
    constructor(options = {}) {
        this.canvas = options.canvas;
        this.context = this.canvas ? this.canvas.getContext('2d') : null;
        this.cameraManager = options.cameraManager || null;
        this.displaySize = { width: 0, height: 0 };
    }

    setCanvas(canvas) {
        this.canvas = canvas;
        this.context = canvas ? canvas.getContext('2d') : null;
        this.updateDisplaySize();
    }
    
    setCameraManager(cameraManager) {
        this.cameraManager = cameraManager;
    }
    
    updateDisplaySize() {
        if (!this.canvas) return;
        
        this.displaySize = {
            width: this.canvas.clientWidth,
            height: this.canvas.clientHeight
        };
        
        // Ensure canvas buffer size matches display size for proper rendering
        if (this.canvas.width !== this.displaySize.width ||
            this.canvas.height !== this.displaySize.height) {
            this.canvas.width = this.displaySize.width;
            this.canvas.height = this.displaySize.height;
        }
    }

    updateCanvas(imageData) {
        if (!this.canvas || !this.context) {
            return false;
        }

        try {
            // First verify that the image data is valid
            if (!imageData || imageData.empty() || imageData.rows <= 0 || imageData.cols <= 0) {
                console.warn("Invalid image data provided to updateCanvas");
                return false;
            }
            
            // Update display size in case window has been resized
            this.updateDisplaySize();
            
            // Method 1: Direct rendering to canvas (simpler, more reliable)
            try {
                // Create a clone to avoid modifying the original data
                const imageDataClone = imageData.clone();
                cv.imshow(this.canvas, imageDataClone);
                imageDataClone.delete();
                return true;
            } catch (directError) {
                console.warn("Direct canvas update failed, trying alternative method:", directError);
                
                // Method 2: Use 2D context drawImage as fallback
                try {
                    // Create a temporary canvas for the OpenCV output
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = imageData.cols;
                    tempCanvas.height = imageData.rows;
                    
                    // Render OpenCV output to temp canvas
                    const imageDataClone = imageData.clone();
                    cv.imshow(tempCanvas, imageDataClone);
                    imageDataClone.delete();
                    
                    // Clear the main canvas
                    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
                    
                    // Simple scaling method
                    const sourceWidth = tempCanvas.width;
                    const sourceHeight = tempCanvas.height;
                    const targetWidth = this.canvas.width;
                    const targetHeight = this.canvas.height;
                    
                    // Calculate aspect ratios
                    const sourceAspect = sourceWidth / sourceHeight;
                    const targetAspect = targetWidth / targetHeight;
                    
                    // Calculate dimensions to maintain aspect ratio
                    let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
                    
                    if (sourceAspect > targetAspect) {
                        // Source is wider - fit to width
                        drawWidth = targetWidth;
                        drawHeight = targetWidth / sourceAspect;
                        offsetY = (targetHeight - drawHeight) / 2;
                    } else {
                        // Source is taller - fit to height
                        drawHeight = targetHeight;
                        drawWidth = targetHeight * sourceAspect;
                        offsetX = (targetWidth - drawWidth) / 2;
                    }
                    
                    // Draw the image with calculated dimensions
                    this.context.drawImage(
                        tempCanvas,
                        0, 0, sourceWidth, sourceHeight,
                        offsetX, offsetY, drawWidth, drawHeight
                    );
                    
                    return true;
                } catch (fallbackError) {
                    console.error("All canvas update methods failed:", fallbackError);
                    return false;
                }
            }
        } catch (error) {
            console.error("Error updating canvas:", error);
            return false;
        }
    }
    
    drawWithAspectFill(sourceCanvas) {
        if (!this.cameraManager || !this.context) return;
        
        const videoAspect = this.cameraManager.videoSize.width / this.cameraManager.videoSize.height;
        const displayAspect = this.displaySize.width / this.displaySize.height;
        
        let destWidth, destHeight, destX = 0, destY = 0;
        
        if (videoAspect > displayAspect) {
            // Video is wider - match height and crop sides
            destHeight = this.displaySize.height;
            destWidth = destHeight * videoAspect;
            destX = (this.displaySize.width - destWidth) / 2;
        } else {
            // Video is taller - match width and crop top/bottom
            destWidth = this.displaySize.width;
            destHeight = destWidth / videoAspect;
            destY = (this.displaySize.height - destHeight) / 2;
        }
        
        // Draw source canvas with aspect fill
        this.context.drawImage(
            sourceCanvas,
            0, 0, sourceCanvas.width, sourceCanvas.height,
            destX, destY, destWidth, destHeight
        );
    }
    
    // Helper to convert processing coordinates to display coordinates
    processingToDisplayCoords(x, y) {
        if (!this.cameraManager) return { x, y };
        
        return this.cameraManager.videoToDisplayCoords(x, y);
    }
}

/**
 * TrackerCore - Main API facade for image tracking
 */
class ImageTracker {
    constructor(options = {}) {
        // DOM elements
        this.videoElement = options.videoElement || document.getElementById('video');
        this.canvasElement = options.canvasElement || document.getElementById('output');
        
        // Configuration
        this.config = {
            maxDimension: options.maxDimension || 640,
            drawKeypoints: options.drawKeypoints || false,
            maxFPS: options.maxFPS || 30,
            ...options
        };
        
        // State
        this.isInitialized = false;
        this.isTracking = false;
        this.isProcessing = false;
        this.lastProcessingTime = 0;
        
        // Callbacks
        this.callbacks = {
            onInitialized: options.onInitialized || null,
            onError: options.onError || null,
            onReferenceImageLoaded: options.onReferenceImageLoaded || null,
            onTrackingStarted: options.onTrackingStarted || null,
            onTrackingStopped: options.onTrackingStopped || null,
            onPoseUpdated: options.onPoseUpdated || null,
            onTrackingLost: options.onTrackingLost || null,
            onTrackingFound: options.onTrackingFound || null
        };
        
        // Submodules
        this.opencvLoader = new OpenCVLoader(
            this._handleOpenCVReady.bind(this), 
            this._handleError.bind(this)
        );
        
        this.cameraManager = new CameraManager({
            videoElement: this.videoElement,
            onCameraStarted: this._handleCameraStarted.bind(this),
            onCameraError: this._handleError.bind(this)
        });
        
        this.featureDetector = new FeatureDetector({
            maxFeatures: options.maxFeatures || 1000
        });
        
        this.kalmanFilter = new KalmanFilterTracker();
        
        this.renderer = new RendererModule({
            canvas: this.canvasElement,
            cameraManager: this.cameraManager
        });
        
        // Start OpenCV initialization
        this.opencvLoader.init();
        
        // Tracking state
        this.wasTracking = false;
    }

    /**
     * Initialize the tracker
     */
    async init() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Wait for OpenCV to be ready
            if (!window.cv) {
                throw new Error("OpenCV is not loaded");
            }
            
            // Initialize feature detector
            this.featureDetector.initialize();
            
            // Initialize Kalman filter
            this.kalmanFilter.init();
            
            // Set initialized flag
            this.isInitialized = true;
            
            // Call initialized callback
            if (this.callbacks.onInitialized) {
                this.callbacks.onInitialized();
            }
            
            return true;
        } catch (error) {
            this._handleError(error);
            return false;
        }
    }

    /**
     * Load a reference image for tracking
     * @param {HTMLImageElement|File} source - Image element or File object
     */
    async loadReferenceImage(source) {
        try {
            if (!this.isInitialized) {
                await this.init();
            }
            
            let imageElement;
            
            if (source instanceof File) {
                // Handle File object
                const imageUrl = URL.createObjectURL(source);
                imageElement = new Image();
                
                // Wait for image to load
                await new Promise((resolve) => {
                    imageElement.onload = resolve;
                    imageElement.src = imageUrl;
                });
            } else if (source instanceof HTMLImageElement) {
                // Use image element directly
                imageElement = source;
            } else {
                throw new Error("Invalid source: must be File or HTMLImageElement");
            }
            
            // Load reference image in feature detector
            const result = this.featureDetector.loadReferenceImage(imageElement);
            
            // Clean up URL object if created
            if (source instanceof File) {
                URL.revokeObjectURL(imageElement.src);
            }
            
            if (!result.success) {
                throw new Error(`Failed to load reference image: ${result.error}`);
            }
            
            // Call callback
            if (this.callbacks.onReferenceImageLoaded) {
                this.callbacks.onReferenceImageLoaded({
                    featureCount: result.featureCount,
                    width: imageElement.width,
                    height: imageElement.height
                });
            }
            
            return result;
        } catch (error) {
            this._handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Start tracking
     */
    async startTracking() {
        if (this.isTracking) {
            return true;
        }
        
        try {
            if (!this.isInitialized) {
                await this.init();
            }
            
            // Start camera
            await this.cameraManager.startCamera();
            
            // Set tracking state
            this.isTracking = true;
            this.wasTracking = false;
            
            // Call callback
            if (this.callbacks.onTrackingStarted) {
                this.callbacks.onTrackingStarted();
            }
            
            // Start processing video frames
            this._processVideo();
            
            return true;
        } catch (error) {
            this._handleError(error);
            return false;
        }
    }

    /**
     * Stop tracking
     */
    stopTracking() {
        if (!this.isTracking) {
            return;
        }
        
        // Stop camera
        this.cameraManager.stopCamera();
        
        // Clean up Kalman filter
        this.kalmanFilter.cleanup();
        
        // Reset tracking state
        this.isTracking = false;
        this.wasTracking = false;
        
        // Call callback
        if (this.callbacks.onTrackingStopped) {
            this.callbacks.onTrackingStopped();
        }
    }

    /**
     * Set configuration options
     * @param {Object} options - Configuration options
     */
    setConfig(options) {
        this.config = {
            ...this.config,
            ...options
        };
    }

    /**
     * Register a callback
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (typeof callback !== 'function') {
            return;
        }
        
        switch (event) {
            case 'initialized':
                this.callbacks.onInitialized = callback;
                break;
            case 'error':
                this.callbacks.onError = callback;
                break;
            case 'referenceImageLoaded':
                this.callbacks.onReferenceImageLoaded = callback;
                break;
            case 'trackingStarted':
                this.callbacks.onTrackingStarted = callback;
                break;
            case 'trackingStopped':
                this.callbacks.onTrackingStopped = callback;
                break;
            case 'poseUpdated':
                this.callbacks.onPoseUpdated = callback;
                break;
            case 'trackingLost':
                this.callbacks.onTrackingLost = callback;
                break;
            case 'trackingFound':
                this.callbacks.onTrackingFound = callback;
                break;
        }
    }

    /**
     * Internal method to process video frames
     */
    _processVideo() {
        // If not tracking, exit immediately
        if (!this.isTracking) return;
        
        // Schedule next frame with requestAnimationFrame
        requestAnimationFrame(this._processVideo.bind(this));
        
        // Limit processing rate based on maxFPS
        const now = performance.now();
        const elapsed = now - this.lastProcessingTime;
        const frameTime = 1000 / this.config.maxFPS;
        
        if (elapsed < frameTime) {
            return; // Skip this frame to maintain frame rate cap
        }
        
        this.lastProcessingTime = now;
        
        // Skip if already processing a frame
        if (this.isProcessing) {
            return;
        }
        
        // Set processing flag to prevent concurrent processing
        this.isProcessing = true;
        
        try {
            // Capture frame from camera
            const frameCanvas = this.cameraManager.captureFrame();
            
            if (!frameCanvas) {
                this.isProcessing = false;
                return;
            }
            
            // Add defensive check for canvas
            if (!frameCanvas.width || !frameCanvas.height) {
                console.warn("Invalid frame canvas dimensions");
                this.isProcessing = false;
                return;
            }
            
            // Wrap feature detection in a try/catch to be extra safe
            let result = null;
            try {
                // Process frame with feature detector
                result = this.featureDetector.processFrame(frameCanvas, {
                    drawKeypoints: this.config.drawKeypoints,
                    maxDimension: this.config.maxDimension
                });
            } catch (detectionError) {
                console.error("Critical error in feature detection:", detectionError);
                this.isProcessing = false;
                return;
            }
            
            // Ensure we have a valid result
            if (!result) {
                console.warn("No result returned from feature detector");
                this.isProcessing = false;
                return;
            }
            
            // Update canvas with processed frame if available
            if (result.processedFrame) {
                try {
                    const canvasUpdateSuccess = this.renderer.updateCanvas(result.processedFrame);
                    if (!canvasUpdateSuccess) {
                        console.warn("Canvas update was not successful");
                    }
                } catch (canvasError) {
                    console.error("Error updating canvas:", canvasError);
                }
            }
            
            // Handle tracking result
            if (result.success) {
                try {
                    // Apply Kalman filter to corners if available
                    const smoothedCorners = this.kalmanFilter.filterCorners(result.corners);
                    const corners = smoothedCorners || result.corners;
                    
                    // Transform corners from video coordinates to display coordinates
                    const transformedCorners = [];
                    
                    if (corners && corners.length === 8) {
                        for (let i = 0; i < 4; i++) {
                            const videoX = corners[i * 2];
                            const videoY = corners[i * 2 + 1];
                            
                            // Convert to display coordinates
                            if (this.cameraManager) {
                                const displayCoords = this.cameraManager.videoToDisplayCoords(videoX, videoY);
                                transformedCorners.push(displayCoords.x, displayCoords.y);
                            } else {
                                transformedCorners.push(videoX, videoY);
                            }
                        }
                    }
                    
                    // Notify pose updated
                    if (this.callbacks.onPoseUpdated) {
                        this.callbacks.onPoseUpdated({
                            // Original corners in video coordinates
                            corners: corners,
                            // Transformed corners in display coordinates
                            displayCorners: transformedCorners.length === 8 ? transformedCorners : corners,
                            homography: result.homography,
                            timestamp: now
                        });
                    }
                    
                    // Check if tracking was just regained
                    if (!this.wasTracking && this.callbacks.onTrackingFound) {
                        this.callbacks.onTrackingFound();
                    }
                    
                    this.wasTracking = true;
                } catch (trackingError) {
                    console.error("Error processing tracking result:", trackingError);
                    this.wasTracking = false;
                }
            } else {
                // Check if tracking was just lost
                if (this.wasTracking && this.callbacks.onTrackingLost) {
                    this.callbacks.onTrackingLost();
                }
                
                this.wasTracking = false;
            }
        } catch (error) {
            console.error('Error in processVideo:', error);
        } finally {
            // Reset processing flag to allow next frame
            this.isProcessing = false;
        }
    }

    /**
     * Internal method to handle OpenCV ready event
     */
    _handleOpenCVReady() {
        this.init();
    }

    /**
     * Internal method to handle camera started event
     * @param {Object} data - Camera and display dimensions with scale ratios
     */
    _handleCameraStarted(data) {
        if (this.canvasElement) {
            // Ensure canvas is set to display size, not video size
            this.canvasElement.width = data.displaySize.width;
            this.canvasElement.height = data.displaySize.height;
            
            // Make sure renderer has latest camera manager reference
            this.renderer.setCameraManager(this.cameraManager);
            this.renderer.updateDisplaySize();
            
            console.log("Camera started:", data);
            console.log(`Video: ${data.videoSize.width}x${data.videoSize.height}, Display: ${data.displaySize.width}x${data.displaySize.height}`);
            console.log(`Scale ratio: x=${data.scaleRatio.x}, y=${data.scaleRatio.y}, offsets: (${data.scaleRatio.xOffset}, ${data.scaleRatio.yOffset})`);
        }
    }

    /**
     * Internal method to handle errors
     * @param {Error|string} error - Error object or message
     */
    _handleError(error) {
        const errorMessage = typeof error === 'string' ? error : error.message;
        console.error('ImageTracker error:', errorMessage);
        
        if (this.callbacks.onError) {
            this.callbacks.onError(errorMessage);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stopTracking();
        this.featureDetector.cleanup();
        this.kalmanFilter.cleanup();
    }
}

// Initialize when page is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Handle window resize
    const handleResize = () => {
        // Update canvas size when window is resized
        const outputCanvas = document.getElementById('output');
        if (outputCanvas) {
            outputCanvas.width = window.innerWidth;
            outputCanvas.height = window.innerHeight;
        }
    };
    
    // Set initial size and attach resize listener
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const tracker = new ImageTracker({
        videoElement: document.getElementById('video'),
        canvasElement: document.getElementById('output'),
        maxFPS: 30,
        maxDimension: 640, // Use a more conservative value to avoid memory issues
        drawKeypoints: false,
        
        // Register callbacks
        onInitialized: () => {
            console.log('Tracker initialized');
            
            // Set up UI elements
            const startButton = document.getElementById('startTracking');
            const stopButton = document.getElementById('stopTracking');
            const fileInput = document.getElementById('referenceImage');
            const statusMessage = document.getElementById('statusMessage');
            
            // Update status function
            const updateStatus = (message) => {
                if (statusMessage) {
                    statusMessage.textContent = message;
                }
            };
            
            // Set up button listeners
            if (startButton) {
                startButton.addEventListener('click', () => {
                    tracker.startTracking();
                });
            }
            
            if (stopButton) {
                stopButton.addEventListener('click', () => {
                    tracker.stopTracking();
                });
                
                // Disable stop button initially
                stopButton.disabled = true;
            }
            
            if (fileInput) {
                fileInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        updateStatus('Loading reference image...');
                        tracker.loadReferenceImage(file);
                    }
                });
            }
            
            updateStatus('OpenCV loaded. Please upload a reference image.');
        },
        
        onError: (error) => {
            const statusMessage = document.getElementById('statusMessage');
            if (statusMessage) {
                statusMessage.textContent = `Error: ${error}`;
            }
        },
        
        onReferenceImageLoaded: (info) => {
            const startButton = document.getElementById('startTracking');
            const statusMessage = document.getElementById('statusMessage');
            
            if (statusMessage) {
                statusMessage.textContent = `Reference image loaded. Found ${info.featureCount} features.`;
            }
            
            if (startButton) {
                startButton.disabled = false;
            }
        },
        
        onTrackingStarted: () => {
            const startButton = document.getElementById('startTracking');
            const stopButton = document.getElementById('stopTracking');
            const fileInput = document.getElementById('referenceImage');
            const statusMessage = document.getElementById('statusMessage');
            
            if (startButton) startButton.disabled = true;
            if (stopButton) stopButton.disabled = false;
            if (fileInput) fileInput.disabled = true;
            if (statusMessage) statusMessage.textContent = 'Tracking started...';
        },
        
        onTrackingStopped: () => {
            const startButton = document.getElementById('startTracking');
            const stopButton = document.getElementById('stopTracking');
            const fileInput = document.getElementById('referenceImage');
            const statusMessage = document.getElementById('statusMessage');
            
            if (startButton) startButton.disabled = false;
            if (stopButton) stopButton.disabled = true;
            if (fileInput) fileInput.disabled = false;
            if (statusMessage) statusMessage.textContent = 'Tracking stopped.';
        },
        
        onTrackingFound: () => {
            const statusMessage = document.getElementById('statusMessage');
            if (statusMessage) statusMessage.textContent = 'Target found!';
        },
        
        onTrackingLost: () => {
            const statusMessage = document.getElementById('statusMessage');
            if (statusMessage) statusMessage.textContent = 'Target lost. Searching...';
        }
    });
});