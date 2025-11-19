/**
 * Simple and robust Lucas-Kanade optical flow tracker
 */
class OpticalFlowTracker {
    constructor(state) {
        this.state = state;

        // Optical flow parameters
        this.params = {
            winSize: new cv.Size(AppConfig.opticalFlow.winSize.width, AppConfig.opticalFlow.winSize.height),
            maxLevel: AppConfig.opticalFlow.maxLevel,
            criteria: new cv.TermCriteria(
                cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT,
                AppConfig.opticalFlow.criteria.maxIterations,
                AppConfig.opticalFlow.criteria.epsilon
            ),
            featureQualityLevel: AppConfig.opticalFlow.featureQualityLevel,
            featureMinDistance: AppConfig.opticalFlow.featureMinDistance,
            ransacReprojThreshold: AppConfig.opticalFlow.ransacReprojThreshold,
            fbErrorThreshold: AppConfig.tracking.fbErrorThreshold,
            minInliers: AppConfig.tracking.minInliers,
            maxFlowMagnitude: AppConfig.tracking.maxFlowMagnitude,
            spatialGridSize: AppConfig.tracking.spatialGridSize
        };
    }

    /**
     * Reset tracking state for a target
     */
    resetTrackingState(targetId) {
        // No state to reset in simplified version
    }

    /**
     * Track target using optical flow
     * @param {cv.Mat} prevFrame - Previous frame
     * @param {cv.Mat} currentFrame - Current frame
     * @param {Array<cv.Point>} prevCorners - Previous corner positions
     * @param {string} targetId - Target identifier
     * @returns {Object} Tracking result with success flag and corners
     */
    track(prevFrame, currentFrame, prevCorners, targetId = 'default') {
        const result = {
            success: false,
            corners: null,
            flowStatus: null,
            prevFeaturePoints: null,
            nextFeaturePoints: null
        };

        if (!prevFrame || !currentFrame || !prevCorners || prevCorners.length !== 4) {
            return result;
        }

        // Convert to grayscale
        let prevGray = new cv.Mat();
        let currentGray = new cv.Mat();
        cv.cvtColor(prevFrame, prevGray, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(currentFrame, currentGray, cv.COLOR_RGBA2GRAY);

        // Create mask for ROI
        let prevMask = new cv.Mat.zeros(prevGray.rows, prevGray.cols, cv.CV_8UC1);
        let roiCorners = new cv.MatVector();
        let roi = new cv.Mat(4, 1, cv.CV_32SC2);
        for (let i = 0; i < 4; i++) {
            roi.data32S[i * 2] = Math.round(prevCorners[i].x);
            roi.data32S[i * 2 + 1] = Math.round(prevCorners[i].y);
        }
        roiCorners.push_back(roi);
        cv.fillPoly(prevMask, roiCorners, new cv.Scalar(255));
        roi.delete();
        roiCorners.delete();

        // Detect features to track
        let featurePoints = new cv.Mat();
        cv.goodFeaturesToTrack(
            prevGray,
            featurePoints,
            AppConfig.opticalFlow.maxFlowFeatures * 2,
            this.params.featureQualityLevel,
            this.params.featureMinDistance,
            prevMask
        );

        if (!featurePoints || featurePoints.rows < 8) {
            prevGray.delete();
            currentGray.delete();
            prevMask.delete();
            if (featurePoints) featurePoints.delete();
            return result;
        }

        // Apply spatial filtering
        let filteredFeatures = this.filterFeaturesWithSpatialDistribution(
            featurePoints,
            prevCorners,
            this.params.spatialGridSize
        );

        if (filteredFeatures !== featurePoints) {
            featurePoints.delete();
        }
        featurePoints = filteredFeatures;

        if (!featurePoints || featurePoints.rows < 8) {
            prevGray.delete();
            currentGray.delete();
            prevMask.delete();
            if (featurePoints) featurePoints.delete();
            return result;
        }

        // Store for visualization
        let pointsArray = [];
        for (let i = 0; i < featurePoints.rows; i++) {
            pointsArray.push(featurePoints.data32F[i * 2], featurePoints.data32F[i * 2 + 1]);
        }
        result.prevFeaturePoints = this.pointsArrayToPoints(pointsArray);

        // Optical flow
        let prevPoints = cv.matFromArray(featurePoints.rows, 1, cv.CV_32FC2, pointsArray);
        let nextPoints = new cv.Mat();
        let status = new cv.Mat();
        let err = new cv.Mat();

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

        // Backward flow for error checking
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

        // Filter by forward-backward error
        let prevFiltered = [];
        let nextFiltered = [];
        let nextVisual = [];

        for (let i = 0; i < status.rows; i++) {
            if (status.data[i] === 1 && backStatus.data[i] === 1) {
                let dx = prevPoints.data32F[i*2] - backPoints.data32F[i*2];
                let dy = prevPoints.data32F[i*2+1] - backPoints.data32F[i*2+1];
                let fbError = Math.sqrt(dx*dx + dy*dy);

                let flowDx = nextPoints.data32F[i*2] - prevPoints.data32F[i*2];
                let flowDy = nextPoints.data32F[i*2+1] - prevPoints.data32F[i*2+1];
                let flowMag = Math.sqrt(flowDx*flowDx + flowDy*flowDy);

                if (fbError <= this.params.fbErrorThreshold && flowMag < this.params.maxFlowMagnitude) {
                    prevFiltered.push(prevPoints.data32F[i*2], prevPoints.data32F[i*2+1]);
                    nextFiltered.push(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]);
                }
            }
            if (status.data[i] === 1) {
                nextVisual.push(new cv.Point(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]));
            }
        }
        result.nextFeaturePoints = nextVisual;
        result.flowStatus = new Uint8Array(status.data.slice());

        // Check if we have enough inliers
        if (prevFiltered.length < this.params.minInliers) {
            prevGray.delete();
            currentGray.delete();
            prevMask.delete();
            featurePoints.delete();
            prevPoints.delete();
            nextPoints.delete();
            status.delete();
            err.delete();
            backPoints.delete();
            backStatus.delete();
            backErr.delete();
            return result;
        }

        // Compute homography
        let prevMat = cv.matFromArray(prevFiltered.length/2, 1, cv.CV_32FC2, prevFiltered);
        let nextMat = cv.matFromArray(nextFiltered.length/2, 1, cv.CV_32FC2, nextFiltered);
        let inlierMask = new cv.Mat();
        let homography = cv.findHomography(
            prevMat,
            nextMat,
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

        // Transform corners if homography is valid
        if (homography && !homography.empty() && ransacInliers >= this.params.minInliers) {
            let cornerPoints = new cv.Mat(4, 1, cv.CV_32FC2);
            for (let i = 0; i < 4; i++) {
                cornerPoints.data32F[i*2] = prevCorners[i].x;
                cornerPoints.data32F[i*2+1] = prevCorners[i].y;
            }

            let transformedCorners = new cv.Mat();
            cv.perspectiveTransform(cornerPoints, transformedCorners, homography);

            // Extract corners
            if (transformedCorners && transformedCorners.data32F && transformedCorners.data32F.length >= 8) {
                let corners = [];
                let valid = true;

                for (let i = 0; i < 4; i++) {
                    let x = transformedCorners.data32F[i * 2];
                    let y = transformedCorners.data32F[i * 2 + 1];
                    if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
                        valid = false;
                        break;
                    }
                    corners.push(new cv.Point(x, y));
                }

                // Basic geometry validation
                if (valid && this.isValidQuadrilateral(corners)) {
                    result.corners = corners;
                    result.success = true;
                }
            }

            cornerPoints.delete();
            transformedCorners.delete();
            homography.delete();
        }

        // Cleanup
        prevGray.delete();
        currentGray.delete();
        prevMask.delete();
        featurePoints.delete();
        prevPoints.delete();
        nextPoints.delete();
        status.delete();
        err.delete();
        backPoints.delete();
        backStatus.delete();
        backErr.delete();
        prevMat.delete();
        nextMat.delete();
        inlierMask.delete();

        return result;
    }

    /**
     * Filter features for spatial distribution across grid
     */
    filterFeaturesWithSpatialDistribution(featurePoints, corners, gridSize = 4) {
        if (!featurePoints || featurePoints.rows === 0) {
            return featurePoints;
        }

        const xs = corners.map(c => c.x);
        const ys = corners.map(c => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const cellWidth = (maxX - minX) / gridSize;
        const cellHeight = (maxY - minY) / gridSize;
        const grid = new Map();

        for (let i = 0; i < featurePoints.rows; i++) {
            const x = featurePoints.data32F[i * 2];
            const y = featurePoints.data32F[i * 2 + 1];

            if (this.isPointInPolygon(corners, x, y)) {
                const cellX = Math.floor((x - minX) / cellWidth);
                const cellY = Math.floor((y - minY) / cellHeight);
                const cellKey = `${cellX},${cellY}`;

                if (!grid.has(cellKey)) {
                    grid.set(cellKey, []);
                }
                grid.get(cellKey).push({ x, y, index: i });
            }
        }

        const selectedFeatures = [];
        const maxFeaturesPerCell = Math.ceil(AppConfig.opticalFlow.maxFlowFeatures / (gridSize * gridSize));

        for (const cellFeatures of grid.values()) {
            if (cellFeatures.length > 0) {
                const count = Math.min(cellFeatures.length, maxFeaturesPerCell);
                for (let i = 0; i < count; i++) {
                    selectedFeatures.push(cellFeatures[i]);
                }
            }
        }

        if (selectedFeatures.length < AppConfig.opticalFlow.maxFlowFeatures) {
            for (const cellFeatures of grid.values()) {
                for (let i = maxFeaturesPerCell; i < cellFeatures.length; i++) {
                    if (selectedFeatures.length >= AppConfig.opticalFlow.maxFlowFeatures) {
                        break;
                    }
                    selectedFeatures.push(cellFeatures[i]);
                }
                if (selectedFeatures.length >= AppConfig.opticalFlow.maxFlowFeatures) {
                    break;
                }
            }
        }

        if (selectedFeatures.length === 0) {
            return featurePoints;
        }

        const filteredData = [];
        for (const feature of selectedFeatures) {
            filteredData.push(feature.x, feature.y);
        }

        return cv.matFromArray(selectedFeatures.length, 1, cv.CV_32FC2, filteredData);
    }

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

    isValidQuadrilateral(corners) {
        if (corners.length !== 4) return false;

        // Calculate edges
        const edges = [];
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            const dx = corners[next].x - corners[i].x;
            const dy = corners[next].y - corners[i].y;
            edges.push(Math.sqrt(dx * dx + dy * dy));
        }

        // Calculate area
        let area = 0;
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            area += corners[i].x * corners[next].y - corners[next].x * corners[i].y;
        }
        area = Math.abs(area) / 2;

        // Check minimum area
        if (area < AppConfig.geometry.minAreaThreshold) return false;

        // Check convexity
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
                return false;
            }
        }

        return true;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.OpticalFlowTracker = OpticalFlowTracker;
}
