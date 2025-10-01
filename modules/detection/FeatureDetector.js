/**
 * Handles feature detection and matching
 */
class FeatureDetector {
    constructor(state) {
        this.detector = new cv.BRISK(50, 3, 1.0);
        this.state = state;
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

// Make available globally
if (typeof window !== 'undefined') {
    window.FeatureDetector = FeatureDetector;
}

