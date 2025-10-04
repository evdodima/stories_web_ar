/**
 * Handles feature detection and matching
 */
class FeatureDetector {
    constructor(state, profiler, vocabularyQuery = null) {
        this.detector = new cv.BRISK(50, 3, 1.0);
        this.state = state;
        this.profiler = profiler;
        this.vocabularyQuery = vocabularyQuery; // Vocabulary tree query for candidate selection
        this.maxCandidates = 3; // Maximum number of candidates to verify
        this.useVocabularyTree = true; // Enable/disable vocabulary tree optimization

        // Reuse matcher across all targets to avoid recreation overhead
        this.matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    }

    /**
     * Set vocabulary query (called after database loads)
     */
    setVocabularyQuery(vocabularyQuery) {
        this.vocabularyQuery = vocabularyQuery;
        console.log('Vocabulary query set in FeatureDetector:', !!vocabularyQuery);
    }

    detectMultipleTargets(frame, targets) {
        if (!frame || frame.empty()) {
            return [];
        }

        if (!targets || targets.length === 0) {
            return [];
        }

        // OPTIMIZATION: Detect keypoints once for the frame, not per-target
        this.profiler?.startTimer('detect_frame_features');
        const frameFeatures = this.extractFrameFeatures(frame);
        this.profiler?.endTimer('detect_frame_features');

        if (!frameFeatures) {
            return targets.map(target => ({
                targetId: target.id,
                targetLabel: target.label,
                success: false,
                reason: 'Failed to extract frame features'
            }));
        }

        // VOCABULARY TREE OPTIMIZATION: Select candidates using BoW similarity
        let targetsToMatch = targets;

        if (this.useVocabularyTree && this.vocabularyQuery && targets.length >= this.maxCandidates) {
            this.profiler?.startTimer('vocabulary_candidate_selection');
            const candidates = this.vocabularyQuery.queryCandidates(
                frameFeatures.descriptors,
                targets,
                this.maxCandidates
            );
            this.profiler?.endTimer('vocabulary_candidate_selection');

            // Extract just the target objects and filter by minimum score
            targetsToMatch = candidates
                .filter(c => c.score > 0.05) // Minimum similarity threshold
                .map(c => c.target);

        }

        // Match frame features against selected targets only
        const results = [];
        for (const target of targetsToMatch) {
            this.profiler?.startTimer(`detection_target_${target.id}`);
            const result = this.matchTarget(frameFeatures, target.referenceData);
            this.profiler?.endTimer(`detection_target_${target.id}`);
            results.push({
                targetId: target.id,
                targetLabel: target.label,
                ...result
            });
        }

        // Add "not checked" results for targets that were filtered out
        const checkedIds = new Set(targetsToMatch.map(t => t.id));
        for (const target of targets) {
            if (!checkedIds.has(target.id)) {
                results.push({
                    targetId: target.id,
                    targetLabel: target.label,
                    success: false,
                    reason: 'Filtered by vocabulary tree'
                });
            }
        }

        // Clean up frame features
        if (frameFeatures.keypoints) frameFeatures.keypoints.delete();
        if (frameFeatures.descriptors) frameFeatures.descriptors.delete();

        return results;
    }

    /**
     * Extract keypoints and descriptors from frame (done once per frame)
     */
    extractFrameFeatures(frame) {
        let frameGray = null;
        let frameKeypoints = null;
        let frameDescriptors = null;

        try {
            this.profiler?.startTimer('detect_gray_conversion');
            frameGray = new cv.Mat();
            cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);
            this.profiler?.endTimer('detect_gray_conversion');

            frameKeypoints = new cv.KeyPointVector();
            frameDescriptors = new cv.Mat();

            this.profiler?.startTimer('detect_keypoints');
            this.detector.detect(frameGray, frameKeypoints);
            this.profiler?.endTimer('detect_keypoints');

            if (frameKeypoints.size() > 0) {
                this.profiler?.startTimer('detect_limit_features');
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
                this.profiler?.endTimer('detect_limit_features');

                this.profiler?.startTimer('detect_compute_descriptors');
                this.detector.compute(frameGray, frameKeypoints, frameDescriptors);
                this.profiler?.endTimer('detect_compute_descriptors');
            }

            const keypointPoints = this.keypointsToPoints(frameKeypoints);

            return {
                keypoints: frameKeypoints,
                descriptors: frameDescriptors,
                keypointPoints: keypointPoints
            };
        } catch (error) {
            console.error('Error extracting frame features:', error);
            if (frameKeypoints) frameKeypoints.delete();
            if (frameDescriptors) frameDescriptors.delete();
            return null;
        } finally {
            if (frameGray) frameGray.delete();
        }
    }

    /**
     * Match pre-extracted frame features against a target
     */
    matchTarget(frameFeatures, referenceData) {
        if (!referenceData || !referenceData.keypoints || !referenceData.descriptors) {
            return { success: false, reason: 'Reference data not available' };
        }

        const result = {
            success: false,
            reason: null,
            corners: null,
            keypoints: frameFeatures.keypointPoints,
            matchKeypoints: [],
            goodMatchKeypoints: [],
            matchesCount: 0,
            goodMatchesCount: 0,
            score: 0,
            homography: null
        };

        let matcher = null;
        let matches = null;
        let goodMatches = null;
        let homography = null;
        let refPointsMat = null;
        let framePointsMat = null;
        let cornerPoints = null;
        let transformedCorners = null;

        try {
            if (frameFeatures.keypoints.size() <= 10 ||
                referenceData.keypoints.size() <= 10 ||
                !frameFeatures.descriptors || frameFeatures.descriptors.empty() ||
                !referenceData.descriptors || referenceData.descriptors.empty() ||
                frameFeatures.descriptors.rows <= 0 || referenceData.descriptors.rows <= 0 ||
                frameFeatures.descriptors.cols !== referenceData.descriptors.cols) {

                result.reason = 'Insufficient keypoints or descriptor mismatch';
                return result;
            }

            // Reuse the shared matcher instead of creating a new one
            matcher = this.matcher;

            let knnMatches = new cv.DMatchVectorVector();

            const matchPoints = [];
            const goodMatchPoints = [];

            try {
                this.profiler?.startTimer('detect_knn_match');
                matcher.knnMatch(referenceData.descriptors, frameFeatures.descriptors, knnMatches, 2);
                this.profiler?.endTimer('detect_knn_match');

                this.profiler?.startTimer('detect_filter_matches');
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
                            this.pushMatchPoint(frameFeatures.keypoints, firstMatch.trainIdx, matchPoints);
                        }

                        if (matchPair.size() >= 2) {
                            const secondMatch = matchPair.get(1);
                            if (this.passesRatio(firstMatch, secondMatch, ratioThreshold)) {
                                goodMatches.push_back(firstMatch);
                                this.pushMatchPoint(frameFeatures.keypoints, firstMatch.trainIdx, goodMatchPoints);
                            }
                        }
                    } catch (err) {
                        // Skip problematic match entries
                    }
                }
                this.profiler?.endTimer('detect_filter_matches');

                knnMatches.delete();
            } catch (error) {
                console.error('Error in KNN matching:', error);

                matches = new cv.DMatchVector();
                matcher.match(referenceData.descriptors, frameFeatures.descriptors, matches);

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
                                    this.pushMatchPoint(frameFeatures.keypoints, match.trainIdx, goodMatchPoints);
                                } else if (match) {
                                    this.pushMatchPoint(frameFeatures.keypoints, match.trainIdx, matchPoints);
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
                this.profiler?.startTimer('detect_homography');
                const referencePoints = [];
                const framePoints = [];

                for (let i = 0; i < goodMatches.size(); i++) {
                    try {
                        const match = goodMatches.get(i);
                        if (!match) continue;

                        const refIndex = match.queryIdx;
                        const frameIndex = match.trainIdx;

                        if (refIndex < 0 || refIndex >= referenceData.keypoints.size()) continue;
                        if (frameIndex < 0 || frameIndex >= frameFeatures.keypoints.size()) continue;

                        const refKeypoint = referenceData.keypoints.get(refIndex);
                        const frameKeypoint = frameFeatures.keypoints.get(frameIndex);

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
                this.profiler?.endTimer('detect_homography');
            }

            if (referenceData.keypoints.size() > 0) {
                result.score = result.goodMatchesCount / referenceData.keypoints.size();
            }

            if (!result.success) {
                result.reason = result.reason || 'Insufficient matches';
            }

            return result;
        } catch (error) {
            console.error('Error matching target:', error);
            return { success: false, reason: error.message };
        } finally {
            // Don't delete matcher - it's shared across all targets
            if (matches) matches.delete();
            if (goodMatches) goodMatches.delete();
            if (homography) homography.delete();
            if (refPointsMat) refPointsMat.delete();
            if (framePointsMat) framePointsMat.delete();
            if (cornerPoints) cornerPoints.delete();
            if (transformedCorners) transformedCorners.delete();
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

