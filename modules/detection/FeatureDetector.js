/**
 * Handles feature detection and matching
 */
class FeatureDetector {
    constructor(state, profiler, vocabularyQuery = null) {
        console.log('[FeatureDetector] BRISK Config:', AppConfig.brisk);

        // BRISK with optimized parameters
        this.detector = new cv.BRISK(
            AppConfig.brisk.thresh,
            AppConfig.brisk.octaves,
            AppConfig.brisk.patternScale
        );
        this.state = state;
        this.profiler = profiler;
        this.vocabularyQuery = vocabularyQuery; // Vocabulary tree query for candidate selection
        this.maxCandidates = AppConfig.detection.maxCandidates;
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
            console.log('[FeatureDetector] No frame features extracted');
            return targets.map(target => ({
                targetId: target.id,
                targetLabel: target.label,
                success: false,
                reason: 'Failed to extract frame features'
            }));
        }

        console.log(`[FeatureDetector] Frame features: ${frameFeatures.keypoints.size()} keypoints`);

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

            console.log('[FeatureDetector] Vocabulary candidates:', candidates.map(c => ({
                id: c.target.id,
                score: c.score.toFixed(3)
            })));

            // Extract just the target objects and filter by minimum score
            targetsToMatch = candidates
                .filter(c => c.score > AppConfig.detection.minSimilarityThreshold)
                .map(c => c.target);

            console.log('[FeatureDetector] Checking targets:', targetsToMatch.map(t => t.id));
        }

        // Match frame features against selected targets only
        console.log(`[FeatureDetector] 🎯 MATCHING AGAINST ${targetsToMatch.length} TARGETS`);
        const results = [];
        for (const target of targetsToMatch) {
            console.log(`[FeatureDetector] ━━━━ Processing target: ${target.id} (${target.label}) ━━━━`);

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

        // Log detection summary
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        console.log('[FeatureDetector] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[FeatureDetector] 📊 DETECTION CYCLE COMPLETE:', {
            totalTargets: targets.length,
            targetsChecked: targetsToMatch.length,
            detected: successCount,
            failed: failCount,
            successRate: `${((successCount / results.length) * 100).toFixed(1)}%`
        });
        if (successCount > 0) {
            const detectedTargets = results.filter(r => r.success).map(r => ({
                id: r.targetId,
                matches: r.goodMatchesCount,
                score: r.score ? r.score.toFixed(3) : '0'
            }));
            console.log('[FeatureDetector] ✅ DETECTED TARGETS:', detectedTargets);
        }
        console.log('[FeatureDetector] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

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

            // Preprocessing pipeline for better feature quality (same as database)
            if (AppConfig.preprocessing.useCLAHE) {
                this.profiler?.startTimer('detect_preprocessing');

                let processingMat = frameGray;

                // Optional Gaussian blur to reduce noise
                if (AppConfig.preprocessing.useBlur) {
                    const blurred = new cv.Mat();
                    const kernelSize = AppConfig.preprocessing.blurKernelSize || 3;
                    const sigma = AppConfig.preprocessing.blurSigma || 0.5;
                    cv.GaussianBlur(processingMat, blurred, new cv.Size(kernelSize, kernelSize), sigma);
                    processingMat = blurred;
                }

                // Apply CLAHE for contrast enhancement
                const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
                const enhanced = new cv.Mat();
                clahe.apply(processingMat, enhanced);

                // Clean up intermediate results
                if (AppConfig.preprocessing.useBlur) {
                    processingMat.delete(); // Delete blurred mat
                }
                frameGray.delete(); // Delete original
                frameGray = enhanced; // Use enhanced version
                clahe.delete();

                this.profiler?.endTimer('detect_preprocessing');
            }

            frameKeypoints = new cv.KeyPointVector();
            frameDescriptors = new cv.Mat();

            this.profiler?.startTimer('detect_keypoints');
            this.detector.detect(frameGray, frameKeypoints);
            this.profiler?.endTimer('detect_keypoints');

            // Diagnostic logging for low feature detection
            if (frameKeypoints.size() < 50) {
                console.warn('[FeatureDetector] Low feature count detected:', {
                    count: frameKeypoints.size(),
                    frameSize: `${frame.cols}x${frame.rows}`,
                    frameType: frame.type(),
                    grayMean: cv.mean(frameGray)[0].toFixed(2),
                    briskParams: {
                        thresh: AppConfig.brisk.thresh,
                        octaves: AppConfig.brisk.octaves
                    }
                });
            }

            if (frameKeypoints.size() > 0) {
                this.profiler?.startTimer('detect_limit_features');
                const maxFeatures = this.state?.maxFeatures || AppConfig.brisk.maxFeaturesPerFrame;
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

                console.log('[FeatureDetector] ❌ PRE-MATCH CHECK FAILED:', {
                    frameKeypoints: frameFeatures.keypoints.size(),
                    refKeypoints: referenceData.keypoints.size(),
                    frameDescriptors: frameFeatures.descriptors ? frameFeatures.descriptors.rows : 0,
                    refDescriptors: referenceData.descriptors ? referenceData.descriptors.rows : 0,
                    frameDescCols: frameFeatures.descriptors ? frameFeatures.descriptors.cols : 0,
                    refDescCols: referenceData.descriptors ? referenceData.descriptors.cols : 0
                });
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

                const ratioThreshold = AppConfig.detection.ratioThreshold;

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

                // Log match statistics
                console.log('[FeatureDetector] 📊 MATCH STATISTICS:', {
                    totalMatches: matches.size(),
                    goodMatches: goodMatches.size(),
                    ratioTestPassRate: matches.size() > 0
                        ? `${((goodMatches.size() / matches.size()) * 100).toFixed(1)}%`
                        : '0%',
                    ratioThreshold: ratioThreshold
                });

                // Calculate distance statistics for good matches
                if (goodMatches.size() > 0) {
                    const distances = [];
                    for (let i = 0; i < goodMatches.size(); i++) {
                        const match = goodMatches.get(i);
                        if (match && Number.isFinite(match.distance)) {
                            distances.push(match.distance);
                        }
                    }

                    if (distances.length > 0) {
                        distances.sort((a, b) => a - b);
                        const minDist = distances[0];
                        const maxDist = distances[distances.length - 1];
                        const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
                        const medianDist = distances[Math.floor(distances.length / 2)];

                        console.log('[FeatureDetector] 📏 DISTANCE STATS:', {
                            min: minDist.toFixed(2),
                            max: maxDist.toFixed(2),
                            avg: avgDist.toFixed(2),
                            median: medianDist.toFixed(2)
                        });
                    }
                }

                knnMatches.delete();
            } catch (error) {
                console.error('[FeatureDetector] ❌ ERROR in KNN matching:', error);

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
                        const threshold = Math.min(100, AppConfig.detection.distanceThresholdMultiplier * distances[0]);

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

            console.log('[FeatureDetector] 🎯 MATCH COUNTS:', {
                totalMatches: result.matchesCount,
                goodMatches: result.goodMatchesCount,
                minRequiredForHomography: AppConfig.detection.minMatchesForHomography
            });

            if (goodMatches && goodMatches.size() >= AppConfig.detection.minMatchesForHomography) {
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
                    const numPointPairs = referencePoints.length / 2;
                    console.log('[FeatureDetector] 🔷 HOMOGRAPHY INPUT:', {
                        pointPairs: numPointPairs,
                        refPoints: referencePoints.length / 2,
                        framePoints: framePoints.length / 2
                    });

                    refPointsMat = cv.matFromArray(referencePoints.length / 2, 1, cv.CV_32FC2, referencePoints);
                    framePointsMat = cv.matFromArray(framePoints.length / 2, 1, cv.CV_32FC2, framePoints);

                    homography = cv.findHomography(refPointsMat, framePointsMat, cv.RANSAC, 4.0);

                    if (homography && !homography.empty()) {
                        console.log('[FeatureDetector] ✅ HOMOGRAPHY COMPUTED:', {
                            matrixSize: `${homography.rows}x${homography.cols}`,
                            isEmpty: homography.empty()
                        });
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
                                console.log('[FeatureDetector] ✅ CORNERS EXTRACTED:', {
                                    topLeft: `(${corners[0].x.toFixed(1)}, ${corners[0].y.toFixed(1)})`,
                                    topRight: `(${corners[1].x.toFixed(1)}, ${corners[1].y.toFixed(1)})`,
                                    bottomRight: `(${corners[2].x.toFixed(1)}, ${corners[2].y.toFixed(1)})`,
                                    bottomLeft: `(${corners[3].x.toFixed(1)}, ${corners[3].y.toFixed(1)})`
                                });
                                result.corners = corners;
                                result.success = true;
                                result.homography = homography;
                            } else {
                                console.log('[FeatureDetector] ❌ CORNER EXTRACTION FAILED: Invalid corner coordinates');
                            }
                        }
                    } else {
                        console.log('[FeatureDetector] ❌ HOMOGRAPHY FAILED: Empty or invalid matrix');
                    }
                } else {
                    console.log('[FeatureDetector] ❌ HOMOGRAPHY SKIPPED:', {
                        reason: 'Insufficient point pairs',
                        refPoints: referencePoints.length / 2,
                        framePoints: framePoints.length / 2,
                        minRequired: 8
                    });
                }
                this.profiler?.endTimer('detect_homography');
            } else {
                console.log('[FeatureDetector] ⚠️  HOMOGRAPHY SKIPPED:', {
                    reason: 'Insufficient good matches',
                    goodMatches: goodMatches ? goodMatches.size() : 0,
                    minRequired: 12
                });
            }

            if (referenceData.keypoints.size() > 0) {
                result.score = result.goodMatchesCount / referenceData.keypoints.size();
            }

            if (!result.success) {
                result.reason = result.reason || 'Insufficient matches';
            }

            // Log final detection result summary
            console.log(`[FeatureDetector] ${result.success ? '✅ DETECTION SUCCESS' : '❌ DETECTION FAILED'}:`, {
                success: result.success,
                totalMatches: result.matchesCount,
                goodMatches: result.goodMatchesCount,
                score: result.score ? result.score.toFixed(3) : '0.000',
                hasCorners: !!result.corners,
                reason: result.reason || 'Success'
            });

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

