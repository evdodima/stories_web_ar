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
            reason: null,
            corners: null,
            keypoints: [],
            matchKeypoints: [],
            goodMatchKeypoints: [],
            matchesCount: 0,
            goodMatchesCount: 0,
            score: 0,
            homography: null
        };

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
            frameGray = new cv.Mat();
            cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);

            frameKeypoints = new cv.KeyPointVector();
            frameDescriptors = new cv.Mat();

            this.detector.detect(frameGray, frameKeypoints);

            if (frameKeypoints.size() > 0) {
                const maxFeatures = this.state ? this.state.maxFeatures : 500;
                const keypointsArray = [];

                for (let i = 0; i < frameKeypoints.size(); i++) {
                    keypointsArray.push(frameKeypoints.get(i));
                }

                keypointsArray.sort((a, b) => b.response - a.response);

                const limited = keypointsArray.slice(0, Math.min(maxFeatures, keypointsArray.length));

                frameKeypoints.delete();
                frameKeypoints = new cv.KeyPointVector();
                for (const kp of limited) {
                    frameKeypoints.push_back(kp);
                }

                this.detector.compute(frameGray, frameKeypoints, frameDescriptors);
            }

            result.keypoints = this.keypointsToPoints(frameKeypoints);

            if (frameKeypoints.size() > 10 &&
                referenceData.keypoints.size() > 10 &&
                frameDescriptors && !frameDescriptors.empty() &&
                referenceData.descriptors && !referenceData.descriptors.empty() &&
                frameDescriptors.rows > 0 && referenceData.descriptors.rows > 0 &&
                frameDescriptors.cols === referenceData.descriptors.cols) {

                matcher = new cv.BFMatcher(cv.NORM_HAMMING);
                let knnMatches = new cv.DMatchVectorVector();

                const matchPoints = [];
                const goodMatchPoints = [];

                try {
                    matcher.knnMatch(referenceData.descriptors, frameDescriptors, knnMatches, 2);

                    matches = new cv.DMatchVector();
                    goodMatches = new cv.DMatchVector();

                    const ratioThreshold = 0.7;

                    for (let i = 0; i < knnMatches.size(); i++) {
                        try {
                            const matchPair = knnMatches.get(i);
                            if (!matchPair || matchPair.size() < 1) continue;

                            const firstMatch = matchPair.get(0);
                            if (firstMatch) {
                                matches.push_back(firstMatch);
                                this.pushMatchPoint(frameKeypoints, firstMatch.trainIdx, matchPoints);
                            }

                            if (matchPair.size() >= 2) {
                                const secondMatch = matchPair.get(1);
                                if (this.passesRatio(firstMatch, secondMatch, ratioThreshold)) {
                                    goodMatches.push_back(firstMatch);
                                    this.pushMatchPoint(frameKeypoints, firstMatch.trainIdx, goodMatchPoints);
                                }
                            }
                        } catch (err) {
                            // Skip problematic match entries
                        }
                    }

                    knnMatches.delete();
                } catch (error) {
                    console.error('Error in KNN matching:', error);

                    matches = new cv.DMatchVector();
                    matcher.match(referenceData.descriptors, frameDescriptors, matches);

                    goodMatches = new cv.DMatchVector();
                    if (matches.size() > 0) {
                        const distances = [];
                        for (let i = 0; i < matches.size(); i++) {
                            try {
                                const match = matches.get(i);
                                if (match && Number.isFinite(match.distance)) {
                                    distances.push(match.distance);
                                }
                            } catch (err) {}
                        }

                        if (distances.length > 0) {
                            distances.sort((a, b) => a - b);
                            const threshold = Math.min(100, 3 * distances[0]);

                            for (let i = 0; i < matches.size(); i++) {
                                try {
                                    const match = matches.get(i);
                                    if (match && Number.isFinite(match.distance) && match.distance <= threshold) {
                                        goodMatches.push_back(match);
                                        this.pushMatchPoint(frameKeypoints, match.trainIdx, goodMatchPoints);
                                    } else if (match) {
                                        this.pushMatchPoint(frameKeypoints, match.trainIdx, matchPoints);
                                    }
                                } catch (err) {}
                            }
                        }
                    }
                }

                result.matchKeypoints = matchPoints;
                result.goodMatchKeypoints = goodMatchPoints;
                result.matchesCount = matches ? matches.size() : 0;
                result.goodMatchesCount = goodMatches ? goodMatches.size() : 0;

                if (goodMatches && goodMatches.size() >= 12) {
                    const referencePoints = [];
                    const framePoints = [];

                    for (let i = 0; i < goodMatches.size(); i++) {
                        try {
                            const match = goodMatches.get(i);
                            if (!match) continue;

                            const refIndex = match.queryIdx;
                            const frameIndex = match.trainIdx;

                            if (refIndex < 0 || refIndex >= referenceData.keypoints.size()) continue;
                            if (frameIndex < 0 || frameIndex >= frameKeypoints.size()) continue;

                            const refKeypoint = referenceData.keypoints.get(refIndex);
                            const frameKeypoint = frameKeypoints.get(frameIndex);

                            if (!refKeypoint?.pt || !frameKeypoint?.pt) continue;

                            const { x: rx, y: ry } = refKeypoint.pt;
                            const { x: fx, y: fy } = frameKeypoint.pt;

                            if (!Number.isFinite(rx) || !Number.isFinite(ry) ||
                                !Number.isFinite(fx) || !Number.isFinite(fy)) {
                                continue;
                            }

                            referencePoints.push(rx, ry);
                            framePoints.push(fx, fy);
                        } catch (err) {}
                    }

                    if (referencePoints.length >= 16 && framePoints.length >= 16) {
                        refPointsMat = cv.matFromArray(referencePoints.length / 2, 1, cv.CV_32FC2, referencePoints);
                        framePointsMat = cv.matFromArray(framePoints.length / 2, 1, cv.CV_32FC2, framePoints);

                        homography = cv.findHomography(refPointsMat, framePointsMat, cv.RANSAC, 5.0);

                        if (homography && !homography.empty()) {
                            cornerPoints = new cv.Mat(4, 1, cv.CV_32FC2);

                            if (cornerPoints.data32F && cornerPoints.data32F.length >= 8) {
                                const cornerData = cornerPoints.data32F;

                                cornerData[0] = 0;
                                cornerData[1] = 0;
                                cornerData[2] = referenceData.image.cols;
                                cornerData[3] = 0;
                                cornerData[4] = referenceData.image.cols;
                                cornerData[5] = referenceData.image.rows;
                                cornerData[6] = 0;
                                cornerData[7] = referenceData.image.rows;

                                transformedCorners = new cv.Mat();
                                cv.perspectiveTransform(cornerPoints, transformedCorners, homography);

                                const corners = this.extractCorners(transformedCorners);
                                if (corners) {
                                    result.corners = corners;
                                    result.success = true;
                                    result.homography = homography;
                                }
                            }
                        }
                    }
                }

                if (referenceData.keypoints.size() > 0) {
                    result.score = result.goodMatchesCount / referenceData.keypoints.size();
                }
            }

            if (!result.success) {
                result.reason = result.reason || 'Insufficient matches';
            }

            return result;
        } catch (error) {
            console.error('Error in feature detection and matching:', error);
            return { success: false, reason: error.message };
        } finally {
            if (frameGray) frameGray.delete();
            if (frameDescriptors) frameDescriptors.delete();
            if (matcher) matcher.delete();
            if (matches) matches.delete();
            if (goodMatches) goodMatches.delete();
            if (homography) homography.delete();
            if (refPointsMat) refPointsMat.delete();
            if (framePointsMat) framePointsMat.delete();
            if (cornerPoints) cornerPoints.delete();
            if (transformedCorners) transformedCorners.delete();
            if (frameKeypoints) frameKeypoints.delete();
        }
    }

    keypointsToPoints(vector) {
        if (!vector) return [];
        const points = [];
        for (let i = 0; i < vector.size(); i++) {
            try {
                const kp = vector.get(i);
                if (kp?.pt && Number.isFinite(kp.pt.x) && Number.isFinite(kp.pt.y)) {
                    points.push({ x: kp.pt.x, y: kp.pt.y });
                }
            } catch (err) {}
        }
        return points;
    }

    passesRatio(first, second, ratio) {
        if (!first || !second) return false;
        if (!Number.isFinite(first.distance) || !Number.isFinite(second.distance)) return false;
        return first.distance < ratio * second.distance;
    }

    pushMatchPoint(frameKeypoints, index, bucket) {
        try {
            if (!frameKeypoints || index < 0 || index >= frameKeypoints.size()) return;
            const kp = frameKeypoints.get(index);
            if (kp?.pt && Number.isFinite(kp.pt.x) && Number.isFinite(kp.pt.y)) {
                bucket.push({ x: kp.pt.x, y: kp.pt.y });
            }
        } catch (err) {}
    }

    extractCorners(transformedCorners) {
        if (!transformedCorners || !transformedCorners.data32F || transformedCorners.data32F.length < 8) {
            return null;
        }

        const corners = [];
        for (let i = 0; i < 4; i++) {
            const x = transformedCorners.data32F[i * 2];
            const y = transformedCorners.data32F[i * 2 + 1];
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return null;
            }
            corners.push({ x, y });
        }
        return corners;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.FeatureDetector = FeatureDetector;
}

