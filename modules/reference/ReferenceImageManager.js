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
        const { maxFeatures = 500, briskThreshold = 50, autoStart = false } = options;

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

// Make available globally
if (typeof window !== 'undefined') {
    window.ReferenceImageManager = ReferenceImageManager;
}

