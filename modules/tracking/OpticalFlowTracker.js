/**
 * Handles optical flow tracking between frames
 * Implements state-of-the-art Lucas-Kanade sparse optical flow with:
 * - Temporal smoothing via Kalman filtering
 * - Motion prediction and adaptive parameters
 * - Enhanced geometric validation
 * - Smart re-detection triggers
 */
class OpticalFlowTracker {
    constructor(state) {
        this.state = state;

        // Base parameters for optical flow
        this.params = {
            winSize: new cv.Size(AppConfig.opticalFlow.winSize.width, AppConfig.opticalFlow.winSize.height),
            maxLevel: AppConfig.opticalFlow.maxLevel,
            criteria: new cv.TermCriteria(
                cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT,
                AppConfig.opticalFlow.criteria.maxIterations,
                AppConfig.opticalFlow.criteria.epsilon
            ),
            minEigThreshold: AppConfig.opticalFlow.minEigThreshold,
            featureQualityLevel: AppConfig.opticalFlow.featureQualityLevel,
            featureMinDistance: AppConfig.opticalFlow.featureMinDistance,
            ransacReprojThreshold: AppConfig.opticalFlow.ransacReprojThreshold,

            // Adaptive thresholds
            fbErrorThreshold: AppConfig.tracking.fbErrorThreshold,
            fbErrorThresholdMax: AppConfig.tracking.fbErrorThresholdMax,
            minInliers: AppConfig.tracking.minInliers,
            minInliersStrict: AppConfig.tracking.minInliersStrict,
            trackingQualityThreshold: 0.6, // Not in config - internal threshold

            // Geometric constraints
            maxScaleChange: AppConfig.geometry.maxScaleChange,
            maxRotationChange: AppConfig.geometry.maxRotationChange,
            maxAspectRatioChange: AppConfig.geometry.maxAspectRatioChange,

            // Re-detection triggers
            qualityDegradationFrames: AppConfig.quality.qualityDegradationFrames,
            minQualityForContinuation: AppConfig.quality.minQualityForContinuation,

            // Feature management
            featureRefreshInterval: AppConfig.tracking.featureRefreshInterval,
            spatialGridSize: AppConfig.tracking.spatialGridSize
        };

        // Per-target tracking state (maps targetId -> state)
        this.trackingStates = new Map();
    }

    /**
     * Get or create tracking state for a target
     */
    getTrackingState(targetId) {
        if (!this.trackingStates.has(targetId)) {
            this.trackingStates.set(targetId, {
                // Kalman filter state for each corner (4 corners, 2D positions)
                kalmanFilters: this.initializeKalmanFilters(),

                // Motion model
                prevHomography: null,
                homographyHistory: [], // Last N homographies for smoothing
                velocityEstimate: null, // Estimated velocity vector

                // Quality tracking
                qualityHistory: [], // Last N quality scores
                consecutivePoorFrames: 0,
                framesSinceDetection: 0,

                // Geometry tracking
                prevScale: 1.0,
                prevRotation: 0.0,
                prevAspectRatio: 1.0,

                // Feature management
                featureAge: null, // Age of each feature point
                lastFeatureRefresh: 0
            });
        }
        return this.trackingStates.get(targetId);
    }

    /**
     * Initialize Kalman filters for corner smoothing
     * Each corner has its own 2D Kalman filter
     */
    initializeKalmanFilters() {
        const filters = [];
        for (let i = 0; i < 4; i++) {
            // Simple 2D position + velocity model
            filters.push({
                // State: [x, y, vx, vy]
                x: [0, 0, 0, 0],
                // State covariance
                P: [
                    [1, 0, 0, 0],
                    [0, 1, 0, 0],
                    [0, 0, 1, 0],
                    [0, 0, 0, 1]
                ],
                // Process noise - higher means more trust in motion model
                Q: 0.5,
                // Measurement noise - lower means more trust in measurements
                R: 0.1,
                initialized: false
            });
        }
        return filters;
    }

    /**
     * Reset tracking state for a target
     */
    resetTrackingState(targetId) {
        this.trackingStates.delete(targetId);
    }

    /**
     * Track a target between frames with state-of-the-art robustness
     * @param {cv.Mat} prevFrame - Previous frame
     * @param {cv.Mat} currentFrame - Current frame
     * @param {Array<cv.Point>} prevCorners - Previous corner positions
     * @param {string} targetId - Target identifier for maintaining state
     * @returns {Object} Tracking result with success flag, corners, quality metrics
     */
    track(prevFrame, currentFrame, prevCorners, targetId = 'default') {
        const result = {
            success: false,
            corners: null,
            flowStatus: null,
            trackingQuality: 0,
            featurePoints: null,
            prevFeaturePoints: null,
            nextFeaturePoints: null,
            shouldRedetect: false, // Flag to trigger re-detection
            qualityMetrics: {
                inlierRatio: 0,
                fbErrorMean: 0,
                geometricScore: 0,
                overallScore: 0
            }
        };

        if (!prevFrame || !currentFrame || !prevCorners || prevCorners.length !== 4) {
            return result;
        }

        // Get tracking state for this target
        const trackState = this.getTrackingState(targetId);
        trackState.framesSinceDetection++;

        let prevGray = new cv.Mat();
        let currentGray = new cv.Mat();
        cv.cvtColor(prevFrame, prevGray, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(currentFrame, currentGray, cv.COLOR_RGBA2GRAY);

        // Create a mask for feature detection inside the quadrilateral
        let prevMask = new cv.Mat.zeros(prevGray.rows, prevGray.cols, cv.CV_8UC1);
        let roiCorners = new cv.MatVector();
        let roi = new cv.Mat(4, 1, cv.CV_32SC2);
        for (let i = 0; i < 4; i++) {
            roi.data32S[i * 2] = Math.round(prevCorners[i].x);
            roi.data32S[i * 2 + 1] = Math.round(prevCorners[i].y);
        }
        roiCorners.push_back(roi);
        cv.fillPoly(prevMask, roiCorners, new cv.Scalar(255));
        roi.delete(); roiCorners.delete();

        // Detect good features inside the quadrilateral
        // Use much fewer features for optical flow (speed over accuracy)
        const maxFlowFeatures = AppConfig.opticalFlow.maxFlowFeatures;
        let featurePoints = new cv.Mat();
        cv.goodFeaturesToTrack(
            prevGray,
            featurePoints,
            maxFlowFeatures,
            this.params.featureQualityLevel,
            this.params.featureMinDistance,
            prevMask
        );

        if (!featurePoints || featurePoints.rows < 8) {
            // Not enough points – return empty result
            prevGray.delete(); currentGray.delete(); prevMask.delete();
            featurePoints.delete();
            return result;
        }

        // Convert feature points to an array and store for visualization
        let pointsToTrack = [];
        for (let i = 0; i < featurePoints.rows; i++) {
            pointsToTrack.push(featurePoints.data32F[i * 2], featurePoints.data32F[i * 2 + 1]);
        }
        result.prevFeaturePoints = this.pointsArrayToPoints(pointsToTrack);

        // Create matrices for tracking
        let prevPoints = cv.matFromArray(featurePoints.rows, 1, cv.CV_32FC2, pointsToTrack);
        let nextPoints = new cv.Mat();
        let status = new cv.Mat();
        let err = new cv.Mat();

        // Forward optical flow: previous -> current
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

        // Backward optical flow: current -> previous
        let backPoints = new cv.Mat();
        let backStatus = new cv.Mat();
        let backErr = new cv.Mat();
        cv.calcOpticalFlowPyrLK(
            currentGray,
            prevGray,
            nextPoints,
            backPoints,
            backStatus,
            backErr,
            this.params.winSize,
            this.params.maxLevel,
            this.params.criteria
        );

        // Adaptive forward-backward error threshold based on quality history
        const avgQuality = trackState.qualityHistory.length > 0
            ? trackState.qualityHistory.reduce((a, b) => a + b, 0) / trackState.qualityHistory.length
            : 0.5;
        let fbThreshold = this.params.fbErrorThreshold;
        if (avgQuality > 0.8) {
            // If tracking has been good, allow slightly more tolerance
            fbThreshold = this.params.fbErrorThresholdMax;
        }

        // Filter points by forward-backward error with quality scoring
        let prevPtsFiltered = [];
        let nextPtsFiltered = [];
        let fbErrors = [];
        let validCount = 0;
        let nextVisualPoints = [];

        for (let i = 0; i < status.rows; i++) {
            let forwardTracked = status.data[i] === 1;
            let backwardTracked = backStatus.data[i] === 1;
            if (forwardTracked && backwardTracked) {
                let dx = prevPoints.data32F[i*2] - backPoints.data32F[i*2];
                let dy = prevPoints.data32F[i*2+1] - backPoints.data32F[i*2+1];
                let fbError = Math.sqrt(dx*dx + dy*dy);

                // Additional check: flow magnitude (reject outliers with extreme motion)
                let flowDx = nextPoints.data32F[i*2] - prevPoints.data32F[i*2];
                let flowDy = nextPoints.data32F[i*2+1] - prevPoints.data32F[i*2+1];
                let flowMagnitude = Math.sqrt(flowDx*flowDx + flowDy*flowDy);

                // Reject if FB error is high or flow is unreasonably large
                if (fbError <= fbThreshold && flowMagnitude < AppConfig.tracking.maxFlowMagnitude) {
                    prevPtsFiltered.push(prevPoints.data32F[i*2], prevPoints.data32F[i*2+1]);
                    nextPtsFiltered.push(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]);
                    fbErrors.push(fbError);
                    validCount++;
                }
            }
            // Save all next points for visualization
            if (status.data[i] === 1) {
                nextVisualPoints.push(new cv.Point(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]));
            }
        }
        result.nextFeaturePoints = nextVisualPoints;
        result.flowStatus = new Uint8Array(status.data.slice());

        // Calculate tracking quality metrics
        const inlierRatio = validCount / status.rows;
        const fbErrorMean = fbErrors.length > 0
            ? fbErrors.reduce((a, b) => a + b, 0) / fbErrors.length
            : 999;

        result.trackingQuality = inlierRatio;
        result.qualityMetrics.inlierRatio = inlierRatio;
        result.qualityMetrics.fbErrorMean = fbErrorMean;

        // Adaptive minimum inlier count based on tracking history
        const minInliers = trackState.consecutivePoorFrames > 0
            ? this.params.minInliersStrict
            : this.params.minInliers;

        // Check if we have enough good points
        if (inlierRatio < this.params.trackingQualityThreshold ||
            prevPtsFiltered.length < minInliers) {
            trackState.consecutivePoorFrames++;

            // Trigger re-detection if quality has been poor for several frames
            if (trackState.consecutivePoorFrames >= this.params.qualityDegradationFrames) {
                result.shouldRedetect = true;
            }

            // Clean up and return
            prevGray.delete(); currentGray.delete(); prevMask.delete();
            featurePoints.delete(); prevPoints.delete(); nextPoints.delete();
            status.delete(); err.delete();
            backPoints.delete(); backStatus.delete(); backErr.delete();
            return result;
        }

        // Reset poor frame counter on good tracking
        trackState.consecutivePoorFrames = 0;

        // Compute homography based on filtered points using RANSAC
        let prevPointsMat = cv.matFromArray(prevPtsFiltered.length/2, 1, cv.CV_32FC2, prevPtsFiltered);
        let nextPointsMat = cv.matFromArray(nextPtsFiltered.length/2, 1, cv.CV_32FC2, nextPtsFiltered);
        let inlierMask = new cv.Mat();
        let homography = cv.findHomography(
            prevPointsMat,
            nextPointsMat,
            cv.RANSAC,
            this.params.ransacReprojThreshold,
            inlierMask,
            AppConfig.opticalFlow.maxRansacIterations,
            AppConfig.opticalFlow.ransacConfidence
        );

        // Count RANSAC inliers
        let ransacInliers = 0;
        if (inlierMask && !inlierMask.empty()) {
            for (let i = 0; i < inlierMask.rows; i++) {
                if (inlierMask.data[i] === 1) ransacInliers++;
            }
        }

        // If homography is valid, transform and validate corners
        if (homography && !homography.empty() && ransacInliers >= this.params.minInliers) {
            let cornerPoints = new cv.Mat(4, 1, cv.CV_32FC2);
            for (let i = 0; i < 4; i++) {
                cornerPoints.data32F[i*2] = prevCorners[i].x;
                cornerPoints.data32F[i*2+1] = prevCorners[i].y;
            }
            let transformedCorners = new cv.Mat();
            cv.perspectiveTransform(cornerPoints, transformedCorners, homography);

            // Validate and extract transformed corners
            if (transformedCorners && transformedCorners.data32F && transformedCorners.data32F.length >= 8) {
                let corners = [];
                let validCorners = true;
                for (let i = 0; i < 4; i++) {
                    let x = transformedCorners.data32F[i * 2];
                    let y = transformedCorners.data32F[i * 2 + 1];
                    if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
                        validCorners = false;
                        break;
                    }
                    corners.push(new cv.Point(x, y));
                }

                // Validate quadrilateral geometry
                if (validCorners) {
                    const geometricValidation = this.validateGeometry(
                        prevCorners,
                        corners,
                        trackState
                    );

                    result.qualityMetrics.geometricScore = geometricValidation.score;

                    if (geometricValidation.valid) {
                        // For AR, use raw corners - no smoothing for immediate response
                        const smoothedCorners = corners;

                        // Update tracking state
                        this.updateGeometricState(prevCorners, smoothedCorners, trackState);

                        // Store homography history for temporal smoothing
                        trackState.homographyHistory.push(homography);
                        if (trackState.homographyHistory.length > 5) {
                            const oldest = trackState.homographyHistory.shift();
                            if (oldest) oldest.delete();
                        }
                        trackState.prevHomography = homography;

                        // Update quality history
                        const overallQuality = (
                            inlierRatio * AppConfig.quality.weights.inlierRatio +
                            (1 - fbErrorMean / 10) * AppConfig.quality.weights.fbError +
                            geometricValidation.score * AppConfig.quality.weights.geometric
                        );
                        result.qualityMetrics.overallScore = overallQuality;

                        trackState.qualityHistory.push(overallQuality);
                        if (trackState.qualityHistory.length > 10) {
                            trackState.qualityHistory.shift();
                        }

                        // Check if we should trigger re-detection for quality maintenance
                        if (trackState.framesSinceDetection > this.params.featureRefreshInterval &&
                            overallQuality < 0.8) {
                            result.shouldRedetect = true;
                        }

                        result.corners = smoothedCorners;
                        result.success = true;
                    } else {
                        // Geometric validation failed
                        trackState.consecutivePoorFrames++;
                        if (trackState.consecutivePoorFrames >= this.params.qualityDegradationFrames) {
                            result.shouldRedetect = true;
                        }
                    }
                }
            }
            cornerPoints.delete();
            transformedCorners.delete();
        } else {
            // Homography estimation failed
            trackState.consecutivePoorFrames++;
            if (trackState.consecutivePoorFrames >= this.params.qualityDegradationFrames) {
                result.shouldRedetect = true;
            }
        }

        // Clean up all resources
        prevGray.delete(); currentGray.delete(); prevMask.delete();
        featurePoints.delete(); prevPoints.delete(); nextPoints.delete();
        status.delete(); err.delete(); backPoints.delete();
        backStatus.delete(); backErr.delete(); prevPointsMat.delete(); nextPointsMat.delete();
        inlierMask.delete();
        if (homography && result.success === false) {
            // Only delete if we're not storing it in history
            homography.delete();
        }

        return result;
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

    // Generate cv.Point objects from flat point array
    pointsArrayToPoints(pointsArray) {
        const points = [];
        if (!pointsArray || pointsArray.length < 2) return points;

        for (let i = 0; i < pointsArray.length; i += 2) {
            if (i + 1 < pointsArray.length) {
                points.push(new cv.Point(pointsArray[i], pointsArray[i + 1]));
            }
        }

        return points;
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

    /**
     * Apply rotational smoothing using exponential moving average
     * This reduces jitter while maintaining position responsiveness
     */
    applyRotationalSmoothing(corners, prevCorners, trackState) {
        if (!prevCorners || prevCorners.length !== 4) {
            return corners;
        }

        // Calculate center points
        const getCenter = (pts) => {
            const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
            const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
            return { x: cx, y: cy };
        };

        const currentCenter = getCenter(corners);
        const prevCenter = getCenter(prevCorners);

        // Calculate current and previous rotation angles (from top edge)
        const getCurrentAngle = (pts, center) => {
            const topMidX = (pts[0].x + pts[1].x) / 2;
            const topMidY = (pts[0].y + pts[1].y) / 2;
            return Math.atan2(topMidY - center.y, topMidX - center.x);
        };

        const currentAngle = getCurrentAngle(corners, currentCenter);
        const prevAngle = getCurrentAngle(prevCorners, prevCenter);

        // Calculate angle change
        let angleDiff = currentAngle - prevAngle;

        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Apply exponential moving average to rotation
        const alpha = AppConfig.quality.smoothingAlpha;
        const smoothedAngleDiff = angleDiff * alpha;
        const smoothedAngle = prevAngle + smoothedAngleDiff;

        // Rotate corners around center using smoothed angle
        const rotatePoint = (point, center, angle) => {
            const dx = point.x - center.x;
            const dy = point.y - center.y;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            return new cv.Point(
                center.x + dx * cosA - dy * sinA,
                center.y + dx * sinA + dy * cosA
            );
        };

        // Reconstruct corners with smoothed rotation
        const smoothedCorners = [];
        const angleCorrection = smoothedAngle - currentAngle;

        for (let i = 0; i < 4; i++) {
            smoothedCorners.push(rotatePoint(corners[i], currentCenter, angleCorrection));
        }

        return smoothedCorners;
    }

    /**
     * Apply Kalman filtering to smooth corner positions
     */
    applyKalmanSmoothing(corners, kalmanFilters) {
        const smoothedCorners = [];

        for (let i = 0; i < 4; i++) {
            const filter = kalmanFilters[i];
            const measurement = [corners[i].x, corners[i].y];

            if (!filter.initialized) {
                // Initialize filter with first measurement
                filter.x = [measurement[0], measurement[1], 0, 0];
                filter.initialized = true;
                smoothedCorners.push(new cv.Point(measurement[0], measurement[1]));
            } else {
                // Prediction step
                const dt = 1.0; // Assume constant frame rate
                // State transition: x = x + vx*dt, y = y + vy*dt
                const predicted_x = filter.x[0] + filter.x[2] * dt;
                const predicted_y = filter.x[1] + filter.x[3] * dt;

                // Update covariance (simplified)
                const Q = filter.Q;
                filter.P[0][0] += Q; filter.P[1][1] += Q;
                filter.P[2][2] += Q; filter.P[3][3] += Q;

                // Update step
                const R = filter.R;
                // Kalman gain (simplified for position only)
                const K_x = filter.P[0][0] / (filter.P[0][0] + R);
                const K_y = filter.P[1][1] / (filter.P[1][1] + R);

                // Update state
                filter.x[0] = predicted_x + K_x * (measurement[0] - predicted_x);
                filter.x[1] = predicted_y + K_y * (measurement[1] - predicted_y);

                // Update velocity based on change
                filter.x[2] = (filter.x[0] - predicted_x) / dt;
                filter.x[3] = (filter.x[1] - predicted_y) / dt;

                // Update covariance
                filter.P[0][0] *= (1 - K_x);
                filter.P[1][1] *= (1 - K_y);

                smoothedCorners.push(new cv.Point(filter.x[0], filter.x[1]));
            }
        }

        return smoothedCorners;
    }

    /**
     * Validate geometry changes between frames
     */
    validateGeometry(prevCorners, currentCorners, trackState) {
        const result = { valid: true, score: 1.0, reasons: [] };

        // Calculate current geometric properties
        const currentScale = this.calculateScale(currentCorners);
        const currentRotation = this.calculateRotation(currentCorners);
        const currentAspectRatio = this.calculateAspectRatio(currentCorners);

        // Check scale change
        const scaleChange = Math.abs(currentScale / trackState.prevScale - 1.0);
        if (scaleChange > this.params.maxScaleChange) {
            result.valid = false;
            result.reasons.push(`Scale change too large: ${scaleChange.toFixed(2)}`);
        }
        const scaleScore = Math.max(0, 1 - scaleChange / this.params.maxScaleChange);

        // Check rotation change
        let rotationChange = Math.abs(currentRotation - trackState.prevRotation);
        // Normalize to [-pi, pi]
        while (rotationChange > Math.PI) rotationChange -= 2 * Math.PI;
        rotationChange = Math.abs(rotationChange);

        if (rotationChange > this.params.maxRotationChange) {
            result.valid = false;
            result.reasons.push(`Rotation change too large: ${rotationChange.toFixed(2)}`);
        }
        const rotationScore = Math.max(0, 1 - rotationChange / this.params.maxRotationChange);

        // Check aspect ratio change
        const aspectChange = Math.abs(currentAspectRatio / trackState.prevAspectRatio - 1.0);
        if (aspectChange > this.params.maxAspectRatioChange) {
            result.valid = false;
            result.reasons.push(`Aspect ratio change too large: ${aspectChange.toFixed(2)}`);
        }
        const aspectScore = Math.max(0, 1 - aspectChange / this.params.maxAspectRatioChange);

        // Check if quadrilateral is convex and not too distorted
        if (!this.isValidQuadrilateral(currentCorners)) {
            result.valid = false;
            result.reasons.push('Invalid quadrilateral shape');
        }
        const shapeScore = this.isValidQuadrilateral(currentCorners) ? 1.0 : 0.0;

        // Overall geometric score (weighted average)
        result.score = scaleScore * 0.3 + rotationScore * 0.3 +
                       aspectScore * 0.2 + shapeScore * 0.2;

        return result;
    }

    /**
     * Update geometric state for next frame
     */
    updateGeometricState(prevCorners, currentCorners, trackState) {
        trackState.prevScale = this.calculateScale(currentCorners);
        trackState.prevRotation = this.calculateRotation(currentCorners);
        trackState.prevAspectRatio = this.calculateAspectRatio(currentCorners);
    }

    /**
     * Calculate scale of quadrilateral (average edge length)
     */
    calculateScale(corners) {
        let totalLength = 0;
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            const dx = corners[next].x - corners[i].x;
            const dy = corners[next].y - corners[i].y;
            totalLength += Math.sqrt(dx * dx + dy * dy);
        }
        return totalLength / 4;
    }

    /**
     * Calculate rotation angle of quadrilateral (from top edge)
     */
    calculateRotation(corners) {
        // Use first edge as reference
        const dx = corners[1].x - corners[0].x;
        const dy = corners[1].y - corners[0].y;
        return Math.atan2(dy, dx);
    }

    /**
     * Calculate aspect ratio of quadrilateral
     */
    calculateAspectRatio(corners) {
        // Calculate width (average of top and bottom edges)
        const topWidth = Math.sqrt(
            Math.pow(corners[1].x - corners[0].x, 2) +
            Math.pow(corners[1].y - corners[0].y, 2)
        );
        const bottomWidth = Math.sqrt(
            Math.pow(corners[2].x - corners[3].x, 2) +
            Math.pow(corners[2].y - corners[3].y, 2)
        );
        const width = (topWidth + bottomWidth) / 2;

        // Calculate height (average of left and right edges)
        const leftHeight = Math.sqrt(
            Math.pow(corners[3].x - corners[0].x, 2) +
            Math.pow(corners[3].y - corners[0].y, 2)
        );
        const rightHeight = Math.sqrt(
            Math.pow(corners[2].x - corners[1].x, 2) +
            Math.pow(corners[2].y - corners[1].y, 2)
        );
        const height = (leftHeight + rightHeight) / 2;

        return height > 0 ? width / height : 1.0;
    }

    /**
     * Check if the tracked quadrilateral is valid for a planar rectangle
     * Since we're tracking flat rectangular images, we can enforce strong
     * geometric constraints beyond basic convexity
     */
    isValidQuadrilateral(corners) {
        if (corners.length !== 4) return false;

        // Calculate edge vectors and lengths
        const edges = [];
        const edgeVectors = [];
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            const dx = corners[next].x - corners[i].x;
            const dy = corners[next].y - corners[i].y;
            const length = Math.sqrt(dx * dx + dy * dy);
            edges.push(length);
            edgeVectors.push({ dx, dy, length });
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
        if (area < AppConfig.geometry.minAreaThreshold) return false;

        // Check compactness (circle has value 1, lower values are less compact)
        const compactness = (4 * Math.PI * area) / (perimeter * perimeter);

        // Reject extremely distorted quadrilaterals
        if (compactness <= AppConfig.geometry.minCompactnessThreshold) return false;

        // Check convexity (all cross products should have same sign)
        let crossProductSign = null;
        for (let i = 0; i < 4; i++) {
            const p0 = corners[i];
            const p1 = corners[(i + 1) % 4];
            const p2 = corners[(i + 2) % 4];

            const v1x = p1.x - p0.x;
            const v1y = p1.y - p0.y;
            const v2x = p2.x - p1.x;
            const v2y = p2.y - p1.y;

            const cross = v1x * v2y - v1y * v2x;

            if (crossProductSign === null) {
                crossProductSign = cross > 0;
            } else if ((cross > 0) !== crossProductSign) {
                return false; // Non-convex
            }
        }

        // RECTANGULAR CONSTRAINTS: Check properties specific to rectangles

        // 1. Check opposite edges are roughly parallel
        // Edges 0-1 and 2-3 are opposite (top and bottom)
        // Edges 1-2 and 3-0 are opposite (right and left)
        const parallelThreshold = AppConfig.geometry.parallelThreshold;

        const angle01 = Math.atan2(edgeVectors[0].dy, edgeVectors[0].dx);
        const angle23 = Math.atan2(edgeVectors[2].dy, edgeVectors[2].dx);
        const angle12 = Math.atan2(edgeVectors[1].dy, edgeVectors[1].dx);
        const angle30 = Math.atan2(edgeVectors[3].dy, edgeVectors[3].dx);

        // Normalize angles to same direction (opposite edges point opposite ways)
        let angleDiff1 = Math.abs(angle01 - angle23);
        if (angleDiff1 > Math.PI) angleDiff1 = 2 * Math.PI - angleDiff1;
        angleDiff1 = Math.min(angleDiff1, Math.abs(angleDiff1 - Math.PI));

        let angleDiff2 = Math.abs(angle12 - angle30);
        if (angleDiff2 > Math.PI) angleDiff2 = 2 * Math.PI - angleDiff2;
        angleDiff2 = Math.min(angleDiff2, Math.abs(angleDiff2 - Math.PI));

        if (angleDiff1 > parallelThreshold || angleDiff2 > parallelThreshold) {
            return false; // Opposite edges not parallel enough
        }

        // 2. Check opposite edges have similar lengths (accounting for perspective)
        const maxLengthRatio = AppConfig.geometry.maxEdgeLengthRatio;

        const ratio1 = Math.max(edges[0], edges[2]) / Math.min(edges[0], edges[2]);
        const ratio2 = Math.max(edges[1], edges[3]) / Math.min(edges[1], edges[3]);

        if (ratio1 > maxLengthRatio || ratio2 > maxLengthRatio) {
            return false; // Opposite edges too different in length
        }

        // 3. Check corner angles are not too far from 90 degrees
        // For a rectangle, all angles should be close to 90° (accounting for perspective)
        const minAngle = AppConfig.geometry.minCornerAngle;
        const maxAngle = AppConfig.geometry.maxCornerAngle;

        for (let i = 0; i < 4; i++) {
            const prev = (i + 3) % 4;
            const next = (i + 1) % 4;

            // Vectors from corner i to adjacent corners
            const v1x = corners[prev].x - corners[i].x;
            const v1y = corners[prev].y - corners[i].y;
            const v2x = corners[next].x - corners[i].x;
            const v2y = corners[next].y - corners[i].y;

            // Calculate angle using dot product
            const dot = v1x * v2x + v1y * v2y;
            const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
            const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

            if (len1 === 0 || len2 === 0) return false;

            const cosAngle = dot / (len1 * len2);
            const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

            if (angle < minAngle || angle > maxAngle) {
                return false; // Corner angle too acute or obtuse
            }
        }

        // 4. Check for extreme aspect ratios (rectangles shouldn't be too thin)
        const width1 = (edges[0] + edges[2]) / 2;
        const width2 = (edges[1] + edges[3]) / 2;
        const aspectRatio = Math.max(width1, width2) / Math.min(width1, width2);

        if (aspectRatio > AppConfig.geometry.maxAspectRatio) {
            return false; // Aspect ratio too extreme (too thin/elongated)
        }

        return true;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.OpticalFlowTracker = OpticalFlowTracker;
}

