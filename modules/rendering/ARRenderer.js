/**
 * AR Renderer - Three.js-based AR overlay renderer
 *
 * Renders both tracking rectangles and video overlays using Three.js WebGL.
 */
class ARRenderer {
  constructor(canvasId, cameraVideo, options = {}) {
    this.canvasId = canvasId;
    this.cameraVideo = cameraVideo;
    this.enabled = options.enabled !== false;
    this.showTrackingRects = options.showTrackingRects !== false;

    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Background camera feed
    this.backgroundPlane = null;
    this.backgroundTexture = null;
    this.lastCameraFrame = null; // Store last camera frame for sync

    // Target objects: targetId -> {videoPlane, trackingLine}
    this.targetObjects = new Map();

    // Video manager
    this.videoManager = new VideoManager({
      muted: options.muted !== false,
      cleanupDelay: 3000
    });

    // Camera dimensions
    this.cameraWidth = 0;
    this.cameraHeight = 0;

    this.initialize();
  }

  /**
   * Initialize Three.js scene
   */
  initialize() {
    console.log('[ARRenderer] Initializing Three.js...');

    if (typeof THREE === 'undefined') {
      console.error('[ARRenderer] THREE.js not loaded!');
      return;
    }

    const canvas = document.getElementById(this.canvasId);
    if (!canvas) {
      console.error(`[ARRenderer] Canvas ${this.canvasId} not found`);
      return;
    }

    // Create scene
    this.scene = new THREE.Scene();

    // Create orthographic camera (matches camera feed dimensions)
    this.camera = new THREE.OrthographicCamera(
      0, 1, 0, 1, 0.1, 1000
    );
    this.camera.position.z = 1;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: false, // No transparency - we render camera background
      antialias: true
    });
    this.renderer.setClearColor(0x000000, 1); // Black background

    // Create background plane for camera feed
    this.createBackgroundPlane();

    console.log('[ARRenderer] Three.js initialized successfully');
  }

  /**
   * Create background plane for camera feed
   */
  createBackgroundPlane() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });

    this.backgroundPlane = new THREE.Mesh(geometry, material);
    this.backgroundPlane.position.z = -1; // Behind everything else

    this.scene.add(this.backgroundPlane);
  }

  /**
   * Update renderer size to match camera feed
   */
  updateSize(width, height) {
    if (!this.renderer) return;

    // Use provided dimensions or fall back to video element
    if (!width || !height) {
      if (!this.cameraVideo) return;
      width = this.cameraVideo.videoWidth || 640;
      height = this.cameraVideo.videoHeight || 480;
    }

    if (width === this.cameraWidth && height === this.cameraHeight) return;

    this.cameraWidth = width;
    this.cameraHeight = height;

    this.renderer.setSize(width, height, false);

    // Update camera to match canvas coordinates
    // Origin (0,0) is top-left, Y increases downward (standard canvas coordinates)
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();

    // Update background plane to fill viewport
    if (this.backgroundPlane) {
      this.backgroundPlane.position.set(width / 2, height / 2, -1);
      this.backgroundPlane.scale.set(width, height, 1);
    }

    console.log('[ARRenderer] Resized to:', width, 'x', height, 'Camera bounds:', {
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom
    });
  }

  /**
   * Handle resize/orientation change events
   */
  handleResize() {
    // Force re-check of video dimensions
    this.cameraWidth = 0;
    this.cameraHeight = 0;
    this.updateSize();
  }

  /**
   * Update video overlay for tracked target
   * @param {string} targetId
   * @param {Array<{x, y}>} corners - 4 corners [TL, TR, BR, BL]
   * @param {string} videoUrl
   */
  async updateTarget(targetId, corners, videoUrl) {
    if (!videoUrl) return;

    try {
      const result = await this.videoManager.getVideoForTarget(targetId, videoUrl);
      if (!result || !result.video) return;

      this.videoManager.updateTargetSeen(targetId);
      this.videoManager.playVideo(targetId);
    } catch (error) {
      console.error(`[ARRenderer] Error updating target ${targetId}:`, error);
    }
  }

  /**
   * Update camera background from OpenCV frame
   * @param {cv.Mat} frame - OpenCV frame to display as background
   */
  updateCameraBackground(frame) {
    if (!frame || !this.backgroundPlane) return;

    try {
      // Store reference to current frame
      this.lastCameraFrame = frame;

      // Update size to match frame
      this.updateSize(frame.cols, frame.rows);

      // Convert OpenCV Mat to canvas
      if (!this._backgroundCanvas) {
        this._backgroundCanvas = document.createElement('canvas');
        this._backgroundContext = this._backgroundCanvas.getContext('2d', {
          willReadFrequently: false,
          alpha: false
        });
      }
      this._backgroundCanvas.width = frame.cols;
      this._backgroundCanvas.height = frame.rows;
      cv.imshow(this._backgroundCanvas, frame);

      // Update texture from canvas
      if (!this.backgroundTexture) {
        this.backgroundTexture = new THREE.CanvasTexture(this._backgroundCanvas);
        this.backgroundTexture.minFilter = THREE.LinearFilter;
        this.backgroundTexture.magFilter = THREE.LinearFilter;
        this.backgroundTexture.flipY = false; // Don't flip
        this.backgroundTexture.colorSpace = THREE.SRGBColorSpace; // Match canvas color space
        this.backgroundPlane.material.map = this.backgroundTexture;
        this.backgroundPlane.material.needsUpdate = true;
      } else {
        this.backgroundTexture.needsUpdate = true;
      }
    } catch (error) {
      console.error('[ARRenderer] Error updating camera background:', error);
    }
  }

  /**
   * Render frame with tracking and videos
   * @param {Array} trackingResults
   * @param {cv.Mat} cameraFrame - Current camera frame to render as background
   * @param {string} selectedTargetId - ID of target to show video for (single-video mode)
   */
  render(trackingResults = [], cameraFrame = null, selectedTargetId = null) {
    if (!this.enabled || !this.renderer || !this.scene) return;

    // Update background with current camera frame for perfect sync
    if (cameraFrame) {
      this.updateCameraBackground(cameraFrame);
    }

    // Get OpenCV processing resolution (same as camera frame)
    const opencvWidth = this.cameraWidth || 640;
    const opencvHeight = this.cameraHeight || 480;

    // Track which targets are active
    const activeTargets = new Set();

    // Update/create objects for each tracked target
    for (const result of trackingResults) {
      if (!result.success || !result.corners || result.corners.length !== 4) {
        continue;
      }

      activeTargets.add(result.targetId);

      // Convert corners from OpenCV pixel coordinates to normalized coordinates (0-1)
      // Then scale to camera resolution
      const scaledCorners = result.corners.map(corner => ({
        x: (corner.x / opencvWidth) * this.cameraWidth,
        y: (corner.y / opencvHeight) * this.cameraHeight
      }));

      // Get or create target objects
      let targetObj = this.targetObjects.get(result.targetId);
      if (!targetObj) {
        targetObj = this.createTargetObjects(result.targetId);
        this.targetObjects.set(result.targetId, targetObj);
      }

      // Update video plane - only show for selected target
      const isSelectedTarget = selectedTargetId === result.targetId;
      if (isSelectedTarget) {
        const video = this.videoManager.getVideo(result.targetId);
        if (video) {
          console.log(`[ARRenderer] 📹 Video for ${result.targetId}:`, {
            readyState: video.readyState,
            paused: video.paused,
            currentTime: video.currentTime.toFixed(2),
            duration: video.duration,
            networkState: video.networkState
          });

          if (video.readyState >= 2) {
            this.updateVideoPlane(targetObj.videoPlane, video, scaledCorners);
            targetObj.videoPlane.visible = true;
          } else {
            // Video not ready yet - show loading state
            targetObj.videoPlane.visible = false;
            console.warn(`[ARRenderer] ⏳ Video not ready (readyState: ${video.readyState})`);
          }
        } else {
          targetObj.videoPlane.visible = false;
          console.warn(`[ARRenderer] ❌ No video element found for ${result.targetId}`);
        }
      } else {
        // Not selected - hide video
        targetObj.videoPlane.visible = false;
      }

      // Update tracking rectangle
      if (this.showTrackingRects) {
        this.updateTrackingLine(targetObj.trackingLine, scaledCorners);
        targetObj.trackingLine.visible = true;
      } else {
        targetObj.trackingLine.visible = false;
      }
    }

    // Hide objects for non-active targets and pause videos
    for (const [targetId, targetObj] of this.targetObjects) {
      if (!activeTargets.has(targetId)) {
        targetObj.videoPlane.visible = false;
        targetObj.trackingLine.visible = false;
        // Pause video when target is lost
        this.videoManager.pauseVideo(targetId);
      } else if (selectedTargetId && targetId !== selectedTargetId) {
        // Target is visible but not selected - pause its video
        this.videoManager.pauseVideo(targetId);
      }
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Create Three.js objects for a target
   */
  createTargetObjects(targetId) {
    console.log('[ARRenderer] Creating objects for target:', targetId);

    // Create video plane
    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: false
    });
    const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    videoPlane.visible = false;
    this.scene.add(videoPlane);

    // Create tracking line
    const lineGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(5 * 3); // 5 points (closed rectangle)
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const trackingLine = new THREE.Line(lineGeometry, lineMaterial);
    trackingLine.visible = false;
    this.scene.add(trackingLine);

    return { videoPlane, trackingLine };
  }

  /**
   * Update video plane transform
   */
  updateVideoPlane(plane, video, corners) {
    try {
      // Update texture
      if (!plane.material.map || plane.material.map.image !== video) {
        if (plane.material.map) {
          plane.material.map.dispose();
        }
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        plane.material.map = videoTexture;
        plane.material.needsUpdate = true;
      }

      // Update texture
      if (plane.material.map) {
        plane.material.map.needsUpdate = true;
      }

      // Calculate center
      const centerX = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
      const centerY = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;

      // Calculate dimensions
      const width = Math.sqrt(
        Math.pow(corners[1].x - corners[0].x, 2) +
        Math.pow(corners[1].y - corners[0].y, 2)
      );
      const height = Math.sqrt(
        Math.pow(corners[3].x - corners[0].x, 2) +
        Math.pow(corners[3].y - corners[0].y, 2)
      );

      // Don't use rotation - instead directly position vertices to match corners
      // This gives us proper perspective transform
      plane.position.set(centerX, centerY, 0);
      plane.rotation.set(0, 0, 0);
      plane.scale.set(1, 1, 1);

      // Apply perspective distortion by directly setting vertex positions
      // This matches the corners exactly regardless of rotation/skew
      const positions = plane.geometry.attributes.position;

      // PlaneGeometry default vertices are at: [-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]
      // Map them to: TL, TR, BL, BR
      positions.setXY(0, corners[0].x - centerX, corners[0].y - centerY); // Top-left
      positions.setXY(1, corners[1].x - centerX, corners[1].y - centerY); // Top-right
      positions.setXY(2, corners[3].x - centerX, corners[3].y - centerY); // Bottom-left
      positions.setXY(3, corners[2].x - centerX, corners[2].y - centerY); // Bottom-right
      positions.needsUpdate = true;
    } catch (error) {
      console.error('[ARRenderer] Error updating video plane:', error);
    }
  }

  /**
   * Update tracking line
   */
  updateTrackingLine(line, corners) {
    try {
      const positions = line.geometry.attributes.position;

      // Set 5 points for closed rectangle
      positions.setXYZ(0, corners[0].x, corners[0].y, 0);
      positions.setXYZ(1, corners[1].x, corners[1].y, 0);
      positions.setXYZ(2, corners[2].x, corners[2].y, 0);
      positions.setXYZ(3, corners[3].x, corners[3].y, 0);
      positions.setXYZ(4, corners[0].x, corners[0].y, 0); // Close the loop

      positions.needsUpdate = true;

      // Debug logging (once every 60 frames)
      if (!this._debugFrameCount) this._debugFrameCount = 0;
      this._debugFrameCount++;
      if (this._debugFrameCount % 60 === 0) {
        console.log('[ARRenderer] Tracking line corners:', {
          TL: `(${corners[0].x}, ${corners[0].y})`,
          TR: `(${corners[1].x}, ${corners[1].y})`,
          BR: `(${corners[2].x}, ${corners[2].y})`,
          BL: `(${corners[3].x}, ${corners[3].y})`,
          cameraSize: `${this.cameraWidth}x${this.cameraHeight}`
        });
      }
    } catch (error) {
      console.error('[ARRenderer] Error updating tracking line:', error);
    }
  }

  /**
   * Remove target
   */
  removeTarget(targetId) {
    const targetObj = this.targetObjects.get(targetId);
    if (targetObj) {
      this.scene.remove(targetObj.videoPlane);
      this.scene.remove(targetObj.trackingLine);

      targetObj.videoPlane.geometry.dispose();
      targetObj.videoPlane.material.dispose();
      if (targetObj.videoPlane.material.map) {
        targetObj.videoPlane.material.map.dispose();
      }

      targetObj.trackingLine.geometry.dispose();
      targetObj.trackingLine.material.dispose();

      this.targetObjects.delete(targetId);
    }

    this.videoManager.releaseVideo(targetId);
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.renderer) {
      this.renderer.clear();
    }
  }

  /**
   * Set tracking rects visibility
   */
  setShowTrackingRects(show) {
    this.showTrackingRects = show;
  }

  /**
   * Set muted state
   */
  setMuted(muted) {
    this.videoManager.setMuted(muted);
  }

  /**
   * Cleanup
   */
  dispose() {
    for (const targetId of Array.from(this.targetObjects.keys())) {
      this.removeTarget(targetId);
    }

    // Clean up background
    if (this.backgroundTexture) {
      this.backgroundTexture.dispose();
    }
    if (this.backgroundPlane) {
      this.backgroundPlane.geometry.dispose();
      this.backgroundPlane.material.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    this.videoManager.dispose();
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.ARRenderer = ARRenderer;
}
