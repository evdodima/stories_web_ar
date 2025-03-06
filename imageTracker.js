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
        this.pyramidLevels = 5; // Number of scale pyramid levels
        this.pyramidScale = 0.75; // Scale factor between pyramid levels
        this.pyramidKeypoints = []; // Array to store keypoints at different scales
        this.pyramidDescriptors = []; // Array to store descriptors at different scales
        
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
            typeof cv.AKAZE !== 'function' || 
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
        
        // Clean up previous resources if they exist
        this.cleanupResources();
        
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
            
            // Extract features using AKAZE for better detection
            this.detector = new cv.AKAZE();
            
            // AKAZE has different parameters from ORB
            try {
                // Some versions of OpenCV.js might not expose these methods
                if (typeof this.detector.setThreshold === 'function') {
                    this.detector.setThreshold(0.001); // Detector threshold
                }
                
                if (typeof this.detector.setDescriptorSize === 'function') {
                    this.detector.setDescriptorSize(0); // Default descriptor size
                }
                
                if (typeof this.detector.setDescriptorChannels === 'function') {
                    this.detector.setDescriptorChannels(3); // Number of channels in the descriptor
                }
            } catch (e) {
                console.log("Extended AKAZE configuration not available:", e.message);
            }
            
            // Store for the original scale
            const referenceKeypoints = new cv.KeyPointVector();
            this.referenceDescriptors = new cv.Mat();
            
            console.log("Detecting keypoints in reference image...");
            this.detector.detect(this.referenceImageGray, referenceKeypoints);
            console.log(`Found ${referenceKeypoints.size()} keypoints in reference image`);
            
            console.log("Computing descriptors for reference image...");
            this.detector.compute(this.referenceImageGray, referenceKeypoints, this.referenceDescriptors);
            
            if (this.referenceDescriptors.empty() || this.referenceDescriptors.rows === 0) {
                console.error("Failed to compute descriptors for reference image");
            } else {
                console.log(`Computed ${this.referenceDescriptors.rows} descriptors for reference image`);
            }
            
            this.referenceKeypoints = referenceKeypoints;
            
            // Create scale pyramid for the reference image
            this.createScalePyramid();
            
            // Count total features across all pyramid levels
            let totalFeatures = this.referenceKeypoints.size();
            for (let i = 0; i < this.pyramidKeypoints.length; i++) {
                totalFeatures += this.pyramidKeypoints[i].size();
            }
            
            // Update status
            this.updateStatus(`Reference image loaded. Found ${totalFeatures} features across ${this.pyramidLevels} scale levels.`);
            
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
    
    cleanupResources() {
        // Clean up pyramid resources
        for (let i = 0; i < this.pyramidKeypoints.length; i++) {
            if (this.pyramidKeypoints[i]) this.pyramidKeypoints[i].delete();
            if (this.pyramidDescriptors[i]) this.pyramidDescriptors[i].delete();
        }
        
        this.pyramidKeypoints = [];
        this.pyramidDescriptors = [];
        
        // Clean up other resources
        if (this.referenceImage) this.referenceImage.delete();
        if (this.referenceImageGray) this.referenceImageGray.delete();
        if (this.referenceKeypoints) this.referenceKeypoints.delete();
        if (this.referenceDescriptors) this.referenceDescriptors.delete();
        
        this.referenceImage = null;
        this.referenceImageGray = null;
        this.referenceKeypoints = null;
        this.referenceDescriptors = null;
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
                // Detect keypoints with better settings
                // console.log("Detecting keypoints in frame...");
                
                // Configure detector for better performance (if APIs available)
                try {
                    // AKAZE parameter settings for frame processing
                    if (typeof this.detector.setThreshold === 'function') {
                        this.detector.setThreshold(0.001); // Using a consistent threshold for frames too
                    }
                    
                    if (typeof this.detector.setDescriptorSize === 'function') {
                        this.detector.setDescriptorSize(0); // Default descriptor size
                    }
                    
                    if (typeof this.detector.setDescriptorChannels === 'function') {
                        this.detector.setDescriptorChannels(3); // Number of channels in the descriptor
                    }
                } catch (e) {
                    console.log("Extended AKAZE configuration not available for frame:", e.message);
                }
                
                // Detect keypoints
                this.detector.detect(frameGray, frameKeypoints);
                // console.log(`Found ${frameKeypoints.size()} keypoints in frame`);
                
                // Only compute descriptors if keypoints were found
                if (frameKeypoints.size() > 0) {
                    // console.log("Computing descriptors for frame...");
                    this.detector.compute(frameGray, frameKeypoints, frameDescriptors);
                    
                    if (frameDescriptors.empty() || frameDescriptors.rows === 0) {
                        console.error("Failed to compute descriptors for frame");
                    } else {
                        // console.log(`Computed ${frameDescriptors.rows} descriptors for frame`);
                    }
                } else {
                    console.warn("No keypoints found in frame, skipping descriptor computation");
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
                // Check if we have enough features from either base scale or pyramid scales
                let totalRefKeypoints = 0;
                if (this.referenceKeypoints) {
                    totalRefKeypoints += this.referenceKeypoints.size();
                }
                for (let i = 0; i < this.pyramidKeypoints.length; i++) {
                    if (this.pyramidKeypoints[i]) {
                        totalRefKeypoints += this.pyramidKeypoints[i].size();
                    }
                }
                
                if (frameKeypoints.size() > 10 && 
                    totalRefKeypoints > 10 && 
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
                    
                    // Display keypoints count for debugging
                    // console.log(`Frame keypoints: ${frameKeypoints.size()}`);
                    // console.log(`Reference keypoints: ${this.referenceKeypoints.size()}`);
                    for (let i = 0; i < this.pyramidKeypoints.length; i++) {
                        if (this.pyramidKeypoints[i]) {
                            // console.log(`Pyramid level ${i} keypoints: ${this.pyramidKeypoints[i].size()}`);
                        }
                    }
                    
                    // Match features using scale pyramid
                    // AKAZE uses NORM_HAMMING for binary descriptors or NORM_L2 for floating point descriptors
                    // Default AKAZE descriptor type is AKAZE.DESCRIPTOR_MLDB which is binary (Hamming distance)
                    matcher = new cv.BFMatcher(cv.NORM_HAMMING);
                    
                    // Process with scale pyramid to get matches from multiple scales
                    matches = this.processWithScalePyramid(frameGray, frameKeypoints, frameDescriptors, matcher);
                    
                    // Filter good matches
                    goodMatches = new cv.DMatchVector();
                    
                    if (matches.size() > 0) {
                        // We now have matches with Lowe's ratio test applied already
                        // Just copy them to goodMatches
                        for (let i = 0; i < matches.size(); i++) {
                            try {
                                const match = matches.get(i);
                                if (match && typeof match.distance === 'number' && 
                                    !isNaN(match.distance) && isFinite(match.distance)) {
                                    goodMatches.push_back(match);
                                }
                            } catch (e) {
                                // Skip invalid matches
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
                                // Get keypoint from either original or pyramid scale
                                const refKeypoint = this.getKeypointByIndex(match.queryIdx);
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
                
                // Display processed frame on canvas
                try {
                    cv.imshow(this.canvas, frame);
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
    
    createScalePyramid() {
        console.log("Creating scale pyramid...");
        
        // Clean up any previous pyramid data
        for (let i = 0; i < this.pyramidKeypoints.length; i++) {
            if (this.pyramidKeypoints[i]) this.pyramidKeypoints[i].delete();
            if (this.pyramidDescriptors[i]) this.pyramidDescriptors[i].delete();
        }
        
        this.pyramidKeypoints = [];
        this.pyramidDescriptors = [];
        
        // Make sure we have valid reference image
        if (!this.referenceImage || !this.referenceImageGray) {
            console.error("Reference image not available for pyramid creation");
            return;
        }
        
        console.log(`Reference image dimensions: ${this.referenceImage.cols}x${this.referenceImage.rows}`);
        
        // We'll use different scales: one larger and one smaller than the original
        const scales = [1.5, 0.75];  // Simpler approach with just two additional scales
        
        for (let i = 0; i < scales.length; i++) {
            const currentScale = scales[i];
            const newWidth = Math.round(this.referenceImage.cols * currentScale);
            const newHeight = Math.round(this.referenceImage.rows * currentScale);
            
            // Skip if image becomes too small
            if (newWidth < 32 || newHeight < 32) {
                console.log(`Skipping pyramid scale ${currentScale}: image too small (${newWidth}x${newHeight})`);
                continue;
            }
            
            try {
                console.log(`Creating pyramid level with scale=${currentScale}, size=${newWidth}x${newHeight}`);
                
                // Create scaled image
                const scaledImage = new cv.Mat();
                const dstSize = new cv.Size(newWidth, newHeight);
                cv.resize(this.referenceImageGray, scaledImage, dstSize, 0, 0, cv.INTER_AREA);
                
                // Extract features from this scale
                const scaledKeypoints = new cv.KeyPointVector();
                const scaledDescriptors = new cv.Mat();
                
                // Configure detector for different scales (if APIs available)
                try {
                    // AKAZE parameter settings for different scale levels
                    if (typeof this.detector.setThreshold === 'function') {
                        if (currentScale < 1.0) {
                            // For smaller scales, use lower threshold to detect more features
                            this.detector.setThreshold(0.0008); 
                        } else {
                            // For larger scales, use default parameters
                            this.detector.setThreshold(0.001);
                        }
                    }
                    
                    if (typeof this.detector.setDescriptorSize === 'function') {
                        this.detector.setDescriptorSize(0); // Default descriptor size
                    }
                    
                    if (typeof this.detector.setDescriptorChannels === 'function') {
                        this.detector.setDescriptorChannels(3); // Number of channels in the descriptor
                    }
                } catch (e) {
                    console.log(`Extended AKAZE configuration not available for scale ${currentScale}:`, e.message);
                }
                
                // Detect keypoints
                this.detector.detect(scaledImage, scaledKeypoints);
                console.log(`  Found ${scaledKeypoints.size()} keypoints`);
                
                // Only compute descriptors if keypoints were found
                if (scaledKeypoints.size() > 0) {
                    this.detector.compute(scaledImage, scaledKeypoints, scaledDescriptors);
                    
                    // Verify descriptors were computed
                    if (scaledDescriptors.empty()) {
                        console.error(`  Failed to compute descriptors for scale ${currentScale}`);
                        scaledKeypoints.delete();
                        scaledDescriptors.delete();
                    } else {
                        console.log(`  Computed ${scaledDescriptors.rows} descriptors`);
                        
                        // Adjust keypoint coordinates to match original image scale
                        this.adjustKeypointScale(scaledKeypoints, 1.0 / currentScale);
                        
                        // Add to pyramid arrays
                        this.pyramidKeypoints.push(scaledKeypoints);
                        this.pyramidDescriptors.push(scaledDescriptors);
                        
                        console.log(`  Added scale ${currentScale} to pyramid with ${scaledKeypoints.size()} keypoints`);
                    }
                } else {
                    // No keypoints found at this scale, clean up
                    console.log(`  No keypoints found at scale ${currentScale}`);
                    scaledKeypoints.delete();
                    scaledDescriptors.delete();
                }
                
                // Clean up scaled image
                scaledImage.delete();
                
            } catch (e) {
                console.error(`Error creating pyramid level at scale ${currentScale}:`, e);
            }
        }
        
        console.log(`Scale pyramid created with ${this.pyramidKeypoints.length} additional levels`);
    }
    
    adjustKeypointScale(keypoints, scaleFactor) {
        // Adjust keypoint coordinates to match the original image scale
        for (let i = 0; i < keypoints.size(); i++) {
            const kp = keypoints.get(i);
            kp.pt.x = kp.pt.x * scaleFactor;
            kp.pt.y = kp.pt.y * scaleFactor;
            kp.size = kp.size * scaleFactor;  // Also adjust feature size
        }
    }
    
    processWithScalePyramid(frameGray, frameKeypoints, frameDescriptors, matcher) {
        // Array to collect all matches
        const allMatches = new cv.DMatchVector();
        
        try {
            // Temporarily disable advanced matching for debugging
            const useAdvancedMatching = false;
            
            // Match with original scale first
            if (this.referenceDescriptors && !this.referenceDescriptors.empty() &&
                frameDescriptors && !frameDescriptors.empty() &&
                frameDescriptors.cols === this.referenceDescriptors.cols) {
                
                // Simple matching without ratio test to get all possible matches
                const matches = new cv.DMatchVector();
                try {
                    matcher.match(this.referenceDescriptors, frameDescriptors, matches);
                    console.log(`Base scale: found ${matches.size()} matches`);
                    
                    // Add all matches from original scale
                    for (let i = 0; i < matches.size(); i++) {
                        try {
                            const match = matches.get(i);
                            if (match) {
                                allMatches.push_back(match);
                            }
                        } catch (e) {
                            console.error("Error adding original match:", e);
                        }
                    }
                } catch (e) {
                    console.error("Error matching original scale:", e);
                } finally {
                    matches.delete();
                }
            } else {
                console.log("Skipping base scale matching - invalid descriptors");
                if (this.referenceDescriptors) {
                    console.log(`Reference descriptors: ${this.referenceDescriptors.rows}x${this.referenceDescriptors.cols}`);
                }
                if (frameDescriptors) {
                    console.log(`Frame descriptors: ${frameDescriptors.rows}x${frameDescriptors.cols}`);
                }
            }
            
            // Match with each pyramid level
            for (let i = 0; i < this.pyramidKeypoints.length; i++) {
                const pyramidDescriptors = this.pyramidDescriptors[i];
                if (!pyramidDescriptors) {
                    console.log(`Pyramid level ${i}: no descriptors available`);
                    continue;
                }
                
                // Only match if descriptors are valid
                if (!pyramidDescriptors.empty() &&
                    frameDescriptors && !frameDescriptors.empty() &&
                    frameDescriptors.cols === pyramidDescriptors.cols) {
                    
                    // Simple matching without ratio test
                    const matches = new cv.DMatchVector();
                    try {
                        matcher.match(pyramidDescriptors, frameDescriptors, matches);
                        console.log(`Pyramid level ${i}: found ${matches.size()} matches`);
                        
                        // Add matches from this pyramid level
                        for (let j = 0; j < matches.size(); j++) {
                            try {
                                // Get the match
                                const match = matches.get(j);
                                if (!match) continue;
                                
                                // Make sure the index is within bounds
                                if (match.queryIdx >= 0 && match.queryIdx < this.pyramidKeypoints[i].size() &&
                                    match.trainIdx >= 0 && match.trainIdx < frameKeypoints.size()) {
                                    
                                    // Use a special index scheme to identify pyramid level matches:
                                    // - Original keypoints: regular index
                                    // - Pyramid keypoints: -1000 - (level * 1000 + index)
                                    const pyramidIndex = -1000 - (i * 1000 + match.queryIdx);
                                    
                                    // Instead of creating a new match, modify the existing match
                                    // and then copy it
                                    const originalQueryIdx = match.queryIdx;
                                    match.queryIdx = pyramidIndex;
                                    
                                    // Push back a copy of the modified match
                                    allMatches.push_back(match);
                                    
                                    // Restore the original queryIdx
                                    match.queryIdx = originalQueryIdx;
                                }
                            } catch (e) {
                                console.error(`Error processing pyramid match at level ${i}:`, e);
                            }
                        }
                    } catch (e) {
                        console.error(`Error matching pyramid level ${i}:`, e);
                    } finally {
                        matches.delete();
                    }
                } else {
                    console.log(`Pyramid level ${i}: descriptor mismatch or empty`);
                    if (pyramidDescriptors) {
                        console.log(`Pyramid descriptors ${i}: ${pyramidDescriptors.rows}x${pyramidDescriptors.cols}`);
                    }
                }
            }
        } catch (e) {
            console.error("Error in processWithScalePyramid:", e);
        }
        
        // console.log(`Total matches found: ${allMatches.size()}`);
        return allMatches;
    }
    
    // Helper method for simple matching without ratio test
    simpleMatch(queryDescriptors, trainDescriptors, matcher, outputMatches) {
        const matches = new cv.DMatchVector();
        try {
            matcher.match(queryDescriptors, trainDescriptors, matches);
            
            // Add matches to output vector
            for (let i = 0; i < matches.size(); i++) {
                try {
                    const match = matches.get(i);
                    if (match) {
                        outputMatches.push_back(match);
                    }
                } catch (e) {
                    console.error("Error adding match:", e);
                }
            }
        } catch (e) {
            console.error("Error in simple matching:", e);
        } finally {
            matches.delete();
        }
    }
    
    // Helper method for simple matching at pyramid levels
    simplePyramidMatch(pyramidDescriptors, frameKeypoints, frameDescriptors, matcher, outputMatches, pyramidLevel) {
        const matches = new cv.DMatchVector();
        try {
            matcher.match(pyramidDescriptors, frameDescriptors, matches);
            
            // Add matches from this pyramid level
            for (let j = 0; j < matches.size(); j++) {
                try {
                    // Get the match
                    const match = matches.get(j);
                    if (!match) continue;
                    
                    // Use a special index scheme to identify pyramid level matches
                    const pyramidIndex = -1000 - (pyramidLevel * 1000 + match.queryIdx);
                    
                    // Make sure the index is within bounds
                    if (match.queryIdx >= 0 && match.queryIdx < this.pyramidKeypoints[pyramidLevel].size() &&
                        match.trainIdx >= 0 && match.trainIdx < frameKeypoints.size()) {
                        
                        // Modify and copy the match
                        const originalQueryIdx = match.queryIdx;
                        match.queryIdx = pyramidIndex;
                        outputMatches.push_back(match);
                        match.queryIdx = originalQueryIdx;
                    }
                } catch (e) {
                    console.error(`Error processing match at pyramid level ${pyramidLevel}:`, e);
                }
            }
        } catch (e) {
            console.error(`Error matching pyramid level ${pyramidLevel}:`, e);
        } finally {
            matches.delete();
        }
    }
    
    getKeypointByIndex(index) {
        try {
            // If index is positive, it's from the original scale
            if (index >= 0) {
                if (this.referenceKeypoints && index < this.referenceKeypoints.size()) {
                    return this.referenceKeypoints.get(index);
                }
                return null;
            }
            
            // Otherwise, it's from a pyramid level
            // Decode the special index scheme:
            // -1000 - (level * 1000 + index)
            const decodedIndex = -1000 - index;
            const level = Math.floor(decodedIndex / 1000);
            const idx = decodedIndex % 1000;
            
            // Verify the level is valid
            if (level >= 0 && level < this.pyramidKeypoints.length) {
                const keypointVector = this.pyramidKeypoints[level];
                if (keypointVector && idx < keypointVector.size()) {
                    return keypointVector.get(idx);
                }
            }
            
            // Invalid index
            return null;
        } catch (e) {
            console.error("Error retrieving keypoint:", e);
            return null;
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