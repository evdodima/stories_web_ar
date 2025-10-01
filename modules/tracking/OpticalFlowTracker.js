/**
 * Handles optical flow tracking between frames
 * Implements Lucas-Kanade sparse optical flow for efficient tracking
 */
class OpticalFlowTracker {
    constructor(state) {
        this.state = state;

        // Parameters for optical flow
        this.params = {
            winSize: new cv.Size(30, 30), // Smaller window for better performance
            maxLevel: 5, // Reduced pyramid levels for stability
            criteria: new cv.TermCriteria(
                cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT,
                10,
                0.03
            ),
            minEigThreshold: 0.001,
            featureQualityLevel: 0.01, // Quality level for feature detection
            featureMinDistance: 10, // Minimum distance between features
            ransacReprojThreshold: 3.0 // RANSAC reprojection threshold for homography
        };
    }

    track(prevFrame, currentFrame, prevCorners) {
        const result = {
            success: false,
            corners: null,
            flowStatus: null,
            trackingQuality: 0,
            featurePoints: null,
            prevFeaturePoints: null,
            nextFeaturePoints: null
        };

        if (!prevFrame || !currentFrame || !prevCorners || prevCorners.length !== 4) {
            return result;
        }

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
        let featurePoints = new cv.Mat();
        cv.goodFeaturesToTrack(
            prevGray,
            featurePoints,
            this.state ? this.state.maxFeatures : 100,
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

        // Filter points by forward-backward error
        let fbThreshold = 1.0; // This threshold can be tuned
        let prevPtsFiltered = [];
        let nextPtsFiltered = [];
        let validCount = 0;
        let nextVisualPoints = [];

        for (let i = 0; i < status.rows; i++) {
            let forwardTracked = status.data[i] === 1;
            let backwardTracked = backStatus.data[i] === 1;
            if (forwardTracked && backwardTracked) {
                let dx = prevPoints.data32F[i*2] - backPoints.data32F[i*2];
                let dy = prevPoints.data32F[i*2+1] - backPoints.data32F[i*2+1];
                let fbError = Math.sqrt(dx*dx + dy*dy);
                if (fbError <= fbThreshold) {
                    prevPtsFiltered.push(prevPoints.data32F[i*2], prevPoints.data32F[i*2+1]);
                    nextPtsFiltered.push(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]);
                    validCount++;
                }
            }
            // Save all next points for visualization
            nextVisualPoints.push(new cv.Point(nextPoints.data32F[i*2], nextPoints.data32F[i*2+1]));
        }
        result.nextFeaturePoints = nextVisualPoints;
        result.flowStatus = new Uint8Array(status.data.slice());

        // Calculate tracking quality and only proceed if quality is sufficient
        let trackingQuality = validCount / status.rows;
        result.trackingQuality = trackingQuality;
        if (trackingQuality < 0.6 || prevPtsFiltered.length < 16) {
            // Not enough good points; do not update tracking.
            prevGray.delete(); currentGray.delete(); prevMask.delete();
            featurePoints.delete(); prevPoints.delete(); nextPoints.delete();
            status.delete(); err.delete();
            backPoints.delete(); backStatus.delete(); backErr.delete();
            return result;
        }

        // Compute homography based on filtered points
        let prevPointsMat = cv.matFromArray(prevPtsFiltered.length/2, 1, cv.CV_32FC2, prevPtsFiltered);
        let nextPointsMat = cv.matFromArray(nextPtsFiltered.length/2, 1, cv.CV_32FC2, nextPtsFiltered);
        let homography = cv.findHomography(prevPointsMat, nextPointsMat, cv.RANSAC, this.params.ransacReprojThreshold);

        // If homography is valid, transform the original corners
        if (homography && !homography.empty()) {
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
                if (validCorners && this.isValidQuadrilateral(corners)) {
                    result.corners = corners;
                    result.success = true;
                }
            }
            cornerPoints.delete(); transformedCorners.delete();
        }

        // Clean up all resources
        prevGray.delete(); currentGray.delete(); prevMask.delete();
        featurePoints.delete(); prevPoints.delete(); nextPoints.delete();
        status.delete(); err.delete(); backPoints.delete();
        backStatus.delete(); backErr.delete(); prevPointsMat.delete(); nextPointsMat.delete();
        if (homography) homography.delete();

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

    // Check if the tracked quadrilateral is valid (not too distorted)
    isValidQuadrilateral(corners) {
        if (corners.length !== 4) return false;

        // Calculate edge lengths
        const edges = [];
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            const dx = corners[next].x - corners[i].x;
            const dy = corners[next].y - corners[i].y;
            const length = Math.sqrt(dx * dx + dy * dy);
            edges.push(length);
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
        if (area < 100) return false;

        // Check compactness (circle has value 1, lower values are less compact)
        const compactness = (4 * Math.PI * area) / (perimeter * perimeter);

        // Reject extremely distorted quadrilaterals
        return compactness > 0.1;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.OpticalFlowTracker = OpticalFlowTracker;
}

