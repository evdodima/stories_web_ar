/**
 * AR Renderer - Three.js-based AR overlay renderer
 *
 * Renders both tracking rectangles and video overlays using Three.js WebGL.
 * Uses ViewportManager for centralized dimension management.
 */
class ARRenderer {
  constructor(canvasId, cameraVideo, viewportManager, options = {}) {
    this.canvasId = canvasId;
    this.cameraVideo = cameraVideo;
    this.viewportManager = viewportManager;
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

    // Corner cache to avoid object allocation every frame
    // targetId -> [{x, y}, {x, y}, {x, y}, {x, y}]
    this.cornerCache = new Map();

    // Video manager
    this.videoManager = new VideoManager({
      muted: options.muted !== false,
      cleanupDelay: 3000
    });

    // Viewport dimensions (canvas size)
    this.cameraWidth = 0;
    this.cameraHeight = 0;

    // OpenCV processing dimensions (frame resolution)
    this.frameWidth = 0;
    this.frameHeight = 0;

    this.initialize();

    // Subscribe to viewport updates
    this.viewportManager.on('update', (data) => {
      this.onViewportUpdate(data);
    });
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
   * Update renderer size using ViewportManager dimensions
   */
  updateSize() {
    if (!this.renderer || !this.viewportManager) return;

    const { width, height } = this.viewportManager.getDimensions();

    if (width === this.cameraWidth && height === this.cameraHeight) return;

    this.cameraWidth = width;
    this.cameraHeight = height;

    this.renderer.setSize(width, height, false);

    // Update camera to match canvas coordinates
    // Origin (0,0) is top-left, Y increases downward (standard canvas)
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();

    // Update background plane using ViewportManager's aspect-fill calculation
    this.updateBackgroundPlane();

    // Resized log removed
  }

  /**
   * Update background plane sizing using ViewportManager
   */
  updateBackgroundPlane() {
    if (!this.backgroundPlane) return;

    // Use OpenCV frame dimensions if available, fallback to video dimensions
    let frameWidth = this.frameWidth;
    let frameHeight = this.frameHeight;

    // If frame dimensions not set, use video dimensions as fallback
    if (!frameWidth || !frameHeight) {
      if (this.cameraVideo && this.cameraVideo.videoWidth > 0) {
        frameWidth = this.cameraVideo.videoWidth;
        frameHeight = this.cameraVideo.videoHeight;
        console.log('[ARRenderer] Using video dimensions as fallback:', {
          video: `${frameWidth}x${frameHeight}`
        });
      } else {
        console.warn('[ARRenderer] No dimensions available for background plane');
        return;
      }
    }

    const { width, height } = this.viewportManager.getDimensions();
    const scale = this.viewportManager.getAspectFillScale(
      frameWidth,
      frameHeight
    );

    this.backgroundPlane.position.set(scale.x, scale.y, -1);
    this.backgroundPlane.scale.set(scale.width, scale.height, 1);
  }

  /**
   * Handle viewport updates from ViewportManager
   * @param {Object} data - Update data from ViewportManager
   */
  onViewportUpdate(data) {
    console.log('[ARRenderer] Viewport update:', {
      dimensions: `${data.width}x${data.height}`,
      orientation: data.orientation,
      orientationChanged: data.orientationChanged
    });

    // Update renderer size
    this.updateSize();

    // Only update background plane if dimensions are available
    // During orientation change, camera restarts and dimensions may not be available yet
    if (data.orientationChanged &&
        (!this.frameWidth || !this.frameHeight) &&
        (!this.cameraVideo?.videoWidth || !this.cameraVideo?.videoHeight)) {
      console.log('[ARRenderer] Skipping background update - waiting for camera restart');
      return;
    }

    // Force a render to update canvas immediately
    if (this.scene && this.camera && this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
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
   * @param {cv.Mat} processingFrame - Low-res frame for AR processing (determines coordinate space)
   */
  updateCameraBackground(processingFrame) {
    if (!processingFrame || !this.backgroundPlane) {
      console.warn('[ARRenderer] updateCameraBackground called but:', {
        hasFrame: !!processingFrame,
        hasBackgroundPlane: !!this.backgroundPlane
      });
      return;
    }

    try {
      // Store reference to current processing frame (for coordinate space)
      this.lastCameraFrame = processingFrame;

      // Track OpenCV processing frame dimensions (for coordinate mapping)
      this.frameWidth = processingFrame.cols;
      this.frameHeight = processingFrame.rows;

      // Ensure canvas is sized to viewport (only on first frame)
      if (this.cameraWidth === 0 || this.cameraHeight === 0) {
        this.updateSize();
      }

      // Use video element directly as texture source (no OpenCV conversion needed!)
      // VideoTexture updates automatically from the video stream
      if (!this.backgroundTexture) {
        console.log('[ARRenderer] Creating VideoTexture from camera video element');

        this.backgroundTexture = new THREE.VideoTexture(this.cameraVideo);
        // High-quality texture filtering for better upscaling
        this.backgroundTexture.minFilter = THREE.LinearMipmapLinearFilter;
        this.backgroundTexture.magFilter = THREE.LinearFilter;
        this.backgroundTexture.generateMipmaps = true;
        // Enable anisotropic filtering for sharper textures at angles
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.backgroundTexture.anisotropy = Math.min(4, maxAnisotropy);
        this.backgroundTexture.flipY = false;  // Flip Y axis to correct video orientation
        this.backgroundTexture.colorSpace = THREE.SRGBColorSpace;
        this.backgroundPlane.material.map = this.backgroundTexture;
        this.backgroundPlane.material.needsUpdate = true;

        // Update background plane scale with video dimensions
        this.updateBackgroundPlane();
      }
      // VideoTexture updates automatically - no needsUpdate required!
    } catch (error) {
      console.error('[ARRenderer] Error updating camera background:', error);
      console.error('[ARRenderer] Error stack:', error.stack);
    }
  }

  /**
   * Render frame with tracking and videos
   * @param {Array} trackingResults
   * @param {cv.Mat} processingFrame - Low-res frame used for AR processing (coordinate space)
   * @param {string} selectedTargetId - ID of target to show video for (single-video mode)
   */
  render(trackingResults = [], processingFrame = null, selectedTargetId = null) {
    if (!this.enabled || !this.renderer || !this.scene) return;

    // Update background with current camera frame for perfect sync
    // Video element is used directly via VideoTexture (no frame conversion needed)
    if (processingFrame) {
      this.updateCameraBackground(processingFrame);
    }

    // Get OpenCV processing resolution (from frame dimensions)
    const opencvWidth = this.frameWidth || 640;
    const opencvHeight = this.frameHeight || 480;

    // Get background plane scale (the actual displayed size after aspect-fill)
    const bgScale = this.viewportManager.getAspectFillScale(
      opencvWidth,
      opencvHeight
    );

    // Track which targets are active
    const activeTargets = new Set();

    // Update/create objects for each tracked target
    for (const result of trackingResults) {
      if (!result.success || !result.corners || result.corners.length !== 4) {
        continue;
      }

      activeTargets.add(result.targetId);

      // Convert corners from OpenCV pixel coordinates to background plane world coordinates
      // CRITICAL: Account for background plane position and size!
      // Background is centered and aspect-filled, may extend beyond viewport

      // Reuse cached corner objects to avoid allocation every frame
      let scaledCorners = this.cornerCache.get(result.targetId);
      if (!scaledCorners) {
        // Create corner objects once
        scaledCorners = [
          {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}
        ];
        this.cornerCache.set(result.targetId, scaledCorners);
      }

      // Update corner positions in-place (no new object allocation)
      for (let i = 0; i < 4; i++) {
        const u = result.corners[i].x / opencvWidth;   // Normalized X (0-1)
        const v = result.corners[i].y / opencvHeight;  // Normalized Y (0-1)
        scaledCorners[i].x = bgScale.x - bgScale.width / 2 + u * bgScale.width;
        scaledCorners[i].y = bgScale.y - bgScale.height / 2 + v * bgScale.height;
      }

      // Debug logs removed

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

    // Batch geometry updates for all active targets (performance optimization)
    // Instead of setting needsUpdate per target, batch all updates at once
    for (const targetId of activeTargets) {
      const targetObj = this.targetObjects.get(targetId);
      if (targetObj) {
        targetObj.videoPlane.geometry.attributes.position.needsUpdate = true;
        targetObj.trackingLine.geometry.attributes.position.needsUpdate = true;
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
      // needsUpdate will be batched after all targets are processed
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

      // needsUpdate will be batched after all targets are processed

      // Debug logs removed
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
