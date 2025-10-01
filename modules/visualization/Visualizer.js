/**
 * Handles visualization of tracking results
 */
class Visualizer {
    renderResults(frame, trackingResult, canvas, drawKeypoints, flowPoints, flowStatus) {
        // Resources to clean up
        let displayFrame = null;
        let contours = null;
        let contour = null;

        try {
            // Create a clone of the frame for drawing
            displayFrame = frame.clone();

            // If tracking was successful, draw the contour
            if (trackingResult.success && trackingResult.corners) {
                contours = new cv.MatVector();
                contour = new cv.Mat();

                // Create contour for visualization
                contour.create(4, 1, cv.CV_32SC2);

                // Safely set contour data
                try {
                    const flatPoints = trackingResult.corners.flatMap(p => [p.x, p.y]);
                    if (contour.data32S && contour.data32S.length >= flatPoints.length) {
                        contour.data32S.set(flatPoints);
                        contours.push_back(contour);

                        // Draw contour on frame
                        cv.drawContours(displayFrame, contours, 0, [0, 255, 0, 255], 3);
                    }
                } catch (e) {
                    console.error("Error drawing contour:", e);
                }
            }

            // Draw keypoints if available and enabled
            if (drawKeypoints && trackingResult.keypoints) {
                this.drawKeypoints(displayFrame, trackingResult);
            }

            // Draw optical flow tracking points if available
            if (flowPoints && flowPoints.length > 0) {
                // Pass the tracking corners to the drawFlowPoints method for better visualization
                const corners = trackingResult.success && trackingResult.corners ?
                    trackingResult.corners : null;
                this.drawFlowPoints(displayFrame, flowPoints, flowStatus, corners);
            }

            // Display the processed frame
            cv.imshow(canvas, displayFrame);
        } catch (e) {
            console.error("Error in visualization:", e);
        } finally {
            // Clean up resources
            if (displayFrame) displayFrame.delete();
            if (contours) contours.delete();
            if (contour) contour.delete();
        }
    }

    drawFlowPoints(frame, points, flowStatus, corners) {
        try {
            if (!points || points.length === 0) return;

            // Use the provided corners if available, otherwise use a fallback
            let cornerPoints = corners || [];

            // If no corners were provided, create a fallback
            if (!cornerPoints || cornerPoints.length !== 4) {
                // Create a simplistic approximation of the marker boundaries
                if (frame.cols > 0 && frame.rows > 0) {
                    const padding = 0;
                    cornerPoints = [
                        new cv.Point(padding, padding),
                        new cv.Point(frame.cols - padding, padding),
                        new cv.Point(frame.cols - padding, frame.rows - padding),
                        new cv.Point(padding, frame.rows - padding)
                    ];
                }
            }

            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                if (!point) continue;

                // Determine color based on tracking status and location
                let color;
                const isTracked = flowStatus && flowStatus.length > i && flowStatus[i] === 1;

                if (isTracked) {
                    // For tracked points, use green for points inside the marker region,
                    // yellow for points that might be outside the marker
                    if (cornerPoints.length === 4) {
                        const isInside = this.isPointInPolygon(cornerPoints, point.x, point.y);
                        color = isInside ? [0, 255, 0, 255] : [255, 255, 0, 255]; // Green if inside, yellow if outside
                    } else {
                        color = [0, 255, 0, 255]; // Default to green if we can't determine location
                    }
                } else {
                    color = [255, 0, 0, 255]; // Red for lost points
                }

                // Draw the point
                cv.circle(frame, point, 3, color, -1);
            }
        } catch (e) {
            console.error("Error drawing flow points:", e);
        }
    }

    drawKeypoints(frame, trackingResult) {
        try {
            const { keypoints, matches, goodMatches } = trackingResult;

            // Draw all keypoints in blue (smaller)
            for (let i = 0; i < keypoints.size(); i++) {
                try {
                    const kp = keypoints.get(i);
                    if (kp && kp.pt) {
                        cv.circle(frame, kp.pt, 1, [255, 0, 0, 255], -1);
                    }
                } catch (e) {}
            }

            // If we have matches, draw matched keypoints in yellow (medium)
            if (matches && matches.size() > 0) {
                for (let i = 0; i < matches.size(); i++) {
                    try {
                        const match = matches.get(i);
                        if (match && match.trainIdx >= 0 && match.trainIdx < keypoints.size()) {
                            const kp = keypoints.get(match.trainIdx);
                            if (kp && kp.pt) {
                                cv.circle(frame, kp.pt, 2, [255, 255, 0, 255], -1);
                            }
                        }
                    } catch (e) {}
                }
            }

            // If we have good matches, draw them in green (larger)
            if (goodMatches && goodMatches.size() > 0) {
                for (let i = 0; i < goodMatches.size(); i++) {
                    try {
                        const match = goodMatches.get(i);
                        if (match && match.trainIdx >= 0 && match.trainIdx < keypoints.size()) {
                            const kp = keypoints.get(match.trainIdx);
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
}

// Make available globally
if (typeof window !== 'undefined') {
    window.Visualizer = Visualizer;
}

