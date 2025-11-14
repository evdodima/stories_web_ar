/**
 * Debug visualization utilities
 * Handles drawing keypoints, matches, homography, and metrics
 */

export class DebugVisualizer {
  /**
   * Draw keypoints on an image
   * @param {cv.Mat} imageMat - Source image
   * @param {cv.KeyPointVector} keypoints - Detected keypoints
   * @param {string} color - Color for keypoints (default: green)
   * @param {boolean} showStrength - Color-code by response strength
   * @returns {HTMLCanvasElement} Canvas with visualization
   */
  static drawKeypoints(imageMat, keypoints, color = 'green', showStrength = true) {
    const canvas = document.createElement('canvas');
    canvas.width = imageMat.cols;
    canvas.height = imageMat.rows;
    const ctx = canvas.getContext('2d');

    // Draw image
    cv.imshow(canvas, imageMat);

    // Get max response for normalization
    let maxResponse = 0;
    if (showStrength) {
      for (let i = 0; i < keypoints.size(); i++) {
        const kp = keypoints.get(i);
        maxResponse = Math.max(maxResponse, kp.response);
      }
    }

    // Draw keypoints
    for (let i = 0; i < keypoints.size(); i++) {
      const kp = keypoints.get(i);
      const x = kp.pt.x;
      const y = kp.pt.y;

      // Color-code by strength if requested
      if (showStrength && maxResponse > 0) {
        const strength = kp.response / maxResponse;
        const hue = strength * 120; // 0 (red) to 120 (green)
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.strokeStyle = `hsl(${hue}, 100%, 30%)`;
      } else {
        ctx.fillStyle = color;
        ctx.strokeStyle = 'darkgreen';
      }

      // Draw circle
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    return canvas;
  }

  /**
   * Draw matches between two images side by side
   * @param {cv.Mat} targetMat - Target image
   * @param {cv.Mat} frameMat - Frame image
   * @param {cv.KeyPointVector} targetKps - Target keypoints
   * @param {cv.KeyPointVector} frameKps - Frame keypoints
   * @param {cv.DMatchVector} matches - All matches
   * @param {Array} goodMatches - Good matches after ratio test (indices)
   * @returns {HTMLCanvasElement} Canvas with visualization
   */
  static drawMatches(targetMat, frameMat, targetKps, frameKps, matches,
                     goodMatches) {
    const canvas = document.createElement('canvas');
    const padding = 20;
    canvas.width = targetMat.cols + frameMat.cols + padding;
    canvas.height = Math.max(targetMat.rows, frameMat.rows);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw target image on left
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = targetMat.cols;
    targetCanvas.height = targetMat.rows;
    cv.imshow(targetCanvas, targetMat);
    ctx.drawImage(targetCanvas, 0, 0);

    // Draw frame image on right
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = frameMat.cols;
    frameCanvas.height = frameMat.rows;
    cv.imshow(frameCanvas, frameMat);
    ctx.drawImage(frameCanvas, targetMat.cols + padding, 0);

    // Create set of good match indices for quick lookup
    const goodMatchSet = new Set(goodMatches);

    // Draw match lines
    for (let i = 0; i < matches.size(); i++) {
      const match = matches.get(i);
      const targetKp = targetKps.get(match.queryIdx);
      const frameKp = frameKps.get(match.trainIdx);

      const x1 = targetKp.pt.x;
      const y1 = targetKp.pt.y;
      const x2 = frameKp.pt.x + targetMat.cols + padding;
      const y2 = frameKp.pt.y;

      // Color: green for good matches, red for filtered ones
      const isGood = goodMatchSet.has(i);
      ctx.strokeStyle = isGood ?
        'rgba(0, 255, 0, 0.4)' : 'rgba(255, 0, 0, 0.2)';
      ctx.lineWidth = isGood ? 1.5 : 0.5;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw keypoint circles
      ctx.fillStyle = isGood ?
        'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(x1, y1, 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw legend
    ctx.font = '12px monospace';
    ctx.fillStyle = 'white';
    ctx.fillText('Target', 10, 20);
    ctx.fillText('Frame', targetMat.cols + padding + 10, 20);

    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.fillText(`Good matches: ${goodMatches.length}`, 10, 40);

    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.fillText(`Filtered: ${matches.size() - goodMatches.length}`, 10, 60);

    return canvas;
  }

  /**
   * Draw homography detection result on frame
   * @param {cv.Mat} frameMat - Frame image
   * @param {Array} corners - Detected corners [[x,y], [x,y], [x,y], [x,y]]
   * @param {boolean} success - Whether detection succeeded
   * @returns {HTMLCanvasElement} Canvas with visualization
   */
  static drawHomography(frameMat, corners, success) {
    const canvas = document.createElement('canvas');
    canvas.width = frameMat.cols;
    canvas.height = frameMat.rows;
    const ctx = canvas.getContext('2d');

    // Draw frame
    cv.imshow(canvas, frameMat);

    if (success && corners && corners.length === 4) {
      // Draw bounding box
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 4; i++) {
        ctx.lineTo(corners[i][0], corners[i][1]);
      }
      ctx.closePath();
      ctx.stroke();

      // Draw corners
      ctx.fillStyle = '#ff0000';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(corners[i][0], corners[i][1], 5, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Draw "DETECTED" label
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#00ff00';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      const text = 'DETECTED';
      const textMetrics = ctx.measureText(text);
      const textX = 10;
      const textY = 30;
      ctx.strokeText(text, textX, textY);
      ctx.fillText(text, textX, textY);
    } else {
      // Draw "NOT DETECTED" label
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ff0000';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      const text = 'NOT DETECTED';
      const textX = 10;
      const textY = 30;
      ctx.strokeText(text, textX, textY);
      ctx.fillText(text, textX, textY);
    }

    return canvas;
  }

  /**
   * Draw metrics overlay on image
   * @param {HTMLCanvasElement} canvas - Canvas to draw on
   * @param {Object} metrics - Metrics to display
   */
  static drawMetrics(canvas, metrics) {
    const ctx = canvas.getContext('2d');

    // Semi-transparent background
    const bgHeight = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, canvas.height - bgHeight, 400, bgHeight);

    // Draw metrics
    ctx.font = '12px monospace';
    ctx.fillStyle = 'white';
    let y = canvas.height - bgHeight + 20;
    const lineHeight = 18;

    const lines = [
      `Target KPs: ${metrics.targetKeypoints || 0}`,
      `Frame KPs: ${metrics.frameKeypoints || 0}`,
      `Raw matches: ${metrics.rawMatches || 0}`,
      `Good matches: ${metrics.goodMatches || 0}`,
      `Ratio: ${metrics.ratioThreshold || 0}`,
      `Success: ${metrics.success ? 'YES' : 'NO'}`,
      `Time: ${metrics.processingTime ? metrics.processingTime.toFixed(2) : 0}ms`
    ];

    lines.forEach(line => {
      ctx.fillText(line, 10, y);
      y += lineHeight;
    });
  }

  /**
   * Create a composite visualization with all three views
   * @param {Object} data - Data containing images, keypoints, matches, etc.
   * @returns {HTMLCanvasElement} Canvas with composite visualization
   */
  static createComposite(data) {
    const {
      targetMat, frameMat,
      targetKps, frameKps,
      matches, goodMatches,
      corners, success, metrics
    } = data;

    // Create individual visualizations
    const keypointsTarget = this.drawKeypoints(targetMat, targetKps,
      'green', true);
    const keypointsFrame = this.drawKeypoints(frameMat, frameKps,
      'blue', true);
    const matchesCanvas = this.drawMatches(targetMat, frameMat,
      targetKps, frameKps, matches, goodMatches);
    const homographyCanvas = this.drawHomography(frameMat, corners, success);

    // Draw metrics on homography canvas
    this.drawMetrics(homographyCanvas, metrics);

    // Create composite canvas (2x2 grid)
    const padding = 10;
    const rowHeight = Math.max(
      keypointsTarget.height,
      keypointsFrame.height
    );
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = Math.max(
      keypointsTarget.width + keypointsFrame.width + padding * 3,
      matchesCanvas.width + padding * 2
    );
    compositeCanvas.height = rowHeight + matchesCanvas.height +
                              homographyCanvas.height + padding * 4;

    const ctx = compositeCanvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);

    // Row 1: Target and Frame keypoints side by side
    let y = padding;
    ctx.drawImage(keypointsTarget, padding, y);
    ctx.drawImage(keypointsFrame,
      keypointsTarget.width + padding * 2, y);

    // Add labels
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.strokeText('Target Keypoints', padding + 10, y + 25);
    ctx.fillText('Target Keypoints', padding + 10, y + 25);
    ctx.strokeText('Frame Keypoints',
      keypointsTarget.width + padding * 2 + 10, y + 25);
    ctx.fillText('Frame Keypoints',
      keypointsTarget.width + padding * 2 + 10, y + 25);

    // Row 2: Matches
    y += rowHeight + padding;
    ctx.drawImage(matchesCanvas, padding, y);
    ctx.strokeText('Feature Matches', padding + 10, y + 25);
    ctx.fillText('Feature Matches', padding + 10, y + 25);

    // Row 3: Homography result
    y += matchesCanvas.height + padding;
    ctx.drawImage(homographyCanvas, padding, y);
    ctx.strokeText('Detection Result', padding + 10, y + 25);
    ctx.fillText('Detection Result', padding + 10, y + 25);

    return compositeCanvas;
  }

  /**
   * Save canvas to blob
   * @param {HTMLCanvasElement} canvas
   * @param {string} format - Image format (png, jpeg)
   * @returns {Promise<Blob>}
   */
  static async canvasToBlob(canvas, format = 'image/png') {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      }, format);
    });
  }

  /**
   * Download canvas as image
   * @param {HTMLCanvasElement} canvas
   * @param {string} filename
   */
  static downloadCanvas(canvas, filename) {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  /**
   * Create thumbnail of canvas
   * @param {HTMLCanvasElement} canvas
   * @param {number} maxWidth - Maximum width
   * @returns {HTMLCanvasElement} Thumbnail canvas
   */
  static createThumbnail(canvas, maxWidth = 300) {
    const scale = maxWidth / canvas.width;
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = maxWidth;
    thumbnailCanvas.height = canvas.height * scale;

    const ctx = thumbnailCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, thumbnailCanvas.width,
                  thumbnailCanvas.height);

    return thumbnailCanvas;
  }

  /**
   * Convert canvas to data URL
   * @param {HTMLCanvasElement} canvas
   * @param {string} format - Image format
   * @returns {string} Data URL
   */
  static canvasToDataURL(canvas, format = 'image/png') {
    return canvas.toDataURL(format);
  }
}
