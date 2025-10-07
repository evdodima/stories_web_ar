/**
 * Video AR Renderer - Three.js-based video overlay renderer
 *
 * Renders videos on top of tracked targets with proper perspective transforms.
 * Uses homography decomposition to calculate 3D pose from 4 corner points.
 */
class VideoARRenderer {
  constructor(canvasId, cameraVideo, options = {}) {
    this.canvasId = canvasId;
    this.cameraVideo = cameraVideo;
    this.enabled = options.enabled !== false;

    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Target planes: targetId -> {mesh, material, videoTexture}
    this.targetPlanes = new Map();

    // Video manager
    this.videoManager = new VideoManager({
      muted: options.muted !== false,
      cleanupDelay: 3000
    });

    // Camera dimensions (will be updated)
    this.cameraWidth = 0;
    this.cameraHeight = 0;

    this.initialize();
  }

  /**
   * Initialize Three.js scene
   */
  initialize() {
    console.log('[VideoARRenderer] Initializing...');
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) {
      console.error(`[VideoARRenderer] Canvas ${this.canvasId} not found`);
      return;
    }
    console.log('[VideoARRenderer] Canvas found:', canvas);

    // Check if THREE is available
    if (typeof THREE === 'undefined') {
      console.error('[VideoARRenderer] THREE.js not loaded!');
      return;
    }
    console.log('[VideoARRenderer] THREE.js version:', THREE.REVISION);

    // Create scene
    this.scene = new THREE.Scene();

    // Create orthographic camera (for 2D overlay)
    this.camera = new THREE.OrthographicCamera(
      0, 1, // left, right (will be updated)
      0, 1, // top, bottom (will be updated)
      0.1, 1000 // near, far
    );
    this.camera.position.z = 1;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setClearColor(0x000000, 0); // Transparent background

    // Handle resize
    this.updateSize();

    console.log('[VideoARRenderer] Initialized successfully');
  }

  /**
   * Update renderer size to match camera feed
   */
  updateSize() {
    if (!this.cameraVideo || !this.renderer) return;

    const width = this.cameraVideo.videoWidth || 640;
    const height = this.cameraVideo.videoHeight || 480;

    if (width === this.cameraWidth && height === this.cameraHeight) return;

    this.cameraWidth = width;
    this.cameraHeight = height;

    // Update renderer
    this.renderer.setSize(width, height, false);

    // Update camera to match video dimensions
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update video overlay for tracked target
   * @param {string} targetId - Target identifier
   * @param {Array<{x, y}>} corners - 4 corner points [TL, TR, BR, BL]
   * @param {string} videoUrl - Video source URL
   * @param {Object} targetMeta - Target metadata (dimensions, etc.)
   */
  async updateTarget(targetId, corners, videoUrl, targetMeta = {}) {
    console.log('[VideoARRenderer] updateTarget called:', {
      targetId,
      videoUrl,
      enabled: this.enabled,
      corners: corners?.length
    });

    if (!this.enabled) {
      console.log('[VideoARRenderer] Renderer disabled, skipping');
      return;
    }

    if (!videoUrl) {
      console.log('[VideoARRenderer] No videoUrl provided for target:', targetId);
      return;
    }

    try {
      // Get or create video
      console.log('[VideoARRenderer] Getting video for target:', targetId);
      const result = await this.videoManager.getVideoForTarget(
        targetId,
        videoUrl
      );

      // Check if video is still loading
      if (!result || !result.video) {
        console.log('[VideoARRenderer] Video not ready yet, skipping this frame');
        return;
      }

      const { video, isNew } = result;
      console.log('[VideoARRenderer] Video obtained:', { isNew, readyState: video.readyState });

      // Update last seen
      this.videoManager.updateTargetSeen(targetId);

      // Get or create plane for target
      let plane = this.targetPlanes.get(targetId);
      if (!plane) {
        console.log('[VideoARRenderer] Creating new plane for target:', targetId);
        plane = this.createPlane(targetId, video);
        this.targetPlanes.set(targetId, plane);
      }

      // Update video texture
      if (isNew || plane.needsTextureUpdate) {
        plane.videoTexture.image = video;
        plane.videoTexture.needsUpdate = true;
        plane.needsTextureUpdate = false;
        console.log('[VideoARRenderer] Updated video texture');
      }

      // Update plane transform based on corners
      this.updatePlaneTransform(plane, corners, targetMeta);

      // Play video
      this.videoManager.playVideo(targetId);
      console.log('[VideoARRenderer] Target updated successfully:', targetId);
    } catch (error) {
      console.error(`[VideoARRenderer] Error updating target ${targetId}:`, error);
    }
  }

  /**
   * Create plane mesh for target
   * @param {string} targetId
   * @param {HTMLVideoElement} video
   * @returns {Object} Plane object
   */
  createPlane(targetId, video) {
    // Create video texture
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;

    // Create material
    const material = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.DoubleSide,
      transparent: false
    });

    // Create geometry (1x1 plane, will be transformed)
    const geometry = new THREE.PlaneGeometry(1, 1);

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);

    // Add to scene
    this.scene.add(mesh);

    return {
      mesh,
      material,
      videoTexture,
      geometry,
      needsTextureUpdate: false
    };
  }

  /**
   * Update plane transform to match tracked corners
   * @param {Object} plane - Plane object
   * @param {Array<{x, y}>} corners - 4 corners [TL, TR, BR, BL]
   * @param {Object} targetMeta - Target metadata
   */
  updatePlaneTransform(plane, corners, targetMeta) {
    if (!corners || corners.length !== 4) return;

    // Calculate center point
    const centerX = (corners[0].x + corners[1].x +
                     corners[2].x + corners[3].x) / 4;
    const centerY = (corners[0].y + corners[1].y +
                     corners[2].y + corners[3].y) / 4;

    // Calculate dimensions from corners
    const width = Math.sqrt(
      Math.pow(corners[1].x - corners[0].x, 2) +
      Math.pow(corners[1].y - corners[0].y, 2)
    );
    const height = Math.sqrt(
      Math.pow(corners[3].x - corners[0].x, 2) +
      Math.pow(corners[3].y - corners[0].y, 2)
    );

    // Calculate rotation from top edge
    const angle = Math.atan2(
      corners[1].y - corners[0].y,
      corners[1].x - corners[0].x
    );

    // Get video aspect ratio
    const video = plane.videoTexture.image;
    const videoAspect = video.videoWidth / video.videoHeight;
    const targetAspect = width / height;

    // Calculate aspect-fit scaling
    let scaleX = width;
    let scaleY = height;

    if (videoAspect > targetAspect) {
      // Video is wider - fit width
      scaleY = width / videoAspect;
    } else {
      // Video is taller - fit height
      scaleX = height * videoAspect;
    }

    // Apply transform
    plane.mesh.position.set(centerX, centerY, 0);
    plane.mesh.scale.set(scaleX, scaleY, 1);
    plane.mesh.rotation.z = angle;

    // Apply perspective correction if available
    this.applyPerspectiveCorrection(plane, corners, width, height);
  }

  /**
   * Apply perspective correction to plane vertices
   * @param {Object} plane
   * @param {Array<{x, y}>} corners - 4 corners [TL, TR, BR, BL]
   * @param {number} width - Target width
   * @param {number} height - Target height
   */
  applyPerspectiveCorrection(plane, corners, width, height) {
    // Get geometry positions
    const positions = plane.geometry.attributes.position;

    // Map plane vertices to tracked corners (relative to center)
    // PlaneGeometry vertices: [TL, TR, BL, BR] at (-0.5, 0.5), (0.5, 0.5),
    // (-0.5, -0.5), (0.5, -0.5)

    const centerX = (corners[0].x + corners[1].x +
                     corners[2].x + corners[3].x) / 4;
    const centerY = (corners[0].y + corners[1].y +
                     corners[2].y + corners[3].y) / 4;

    // Update vertex positions for perspective
    // Vertex 0: Top-left
    positions.setXY(0, corners[0].x - centerX, corners[0].y - centerY);
    // Vertex 1: Top-right
    positions.setXY(1, corners[1].x - centerX, corners[1].y - centerY);
    // Vertex 2: Bottom-left
    positions.setXY(2, corners[3].x - centerX, corners[3].y - centerY);
    // Vertex 3: Bottom-right
    positions.setXY(3, corners[2].x - centerX, corners[2].y - centerY);

    positions.needsUpdate = true;
  }

  /**
   * Remove target plane
   * @param {string} targetId
   */
  removeTarget(targetId) {
    const plane = this.targetPlanes.get(targetId);
    if (!plane) return;

    // Remove from scene
    this.scene.remove(plane.mesh);

    // Dispose resources
    plane.geometry.dispose();
    plane.material.dispose();
    plane.videoTexture.dispose();

    this.targetPlanes.delete(targetId);
    this.videoManager.releaseVideo(targetId);
  }

  /**
   * Render frame
   */
  render() {
    if (!this.enabled || !this.renderer || !this.scene || !this.camera) {
      return;
    }

    // Update size if needed
    this.updateSize();

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Debug: log render every 60 frames
    if (!this._renderCount) this._renderCount = 0;
    this._renderCount++;
    if (this._renderCount % 60 === 0) {
      console.log('[VideoARRenderer] Rendering, planes:', this.targetPlanes.size);
    }
  }

  /**
   * Set enabled state
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      // Clear canvas
      if (this.renderer) {
        this.renderer.clear();
      }
    }
  }

  /**
   * Set muted state
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.videoManager.setMuted(muted);
  }

  /**
   * Cleanup all resources
   */
  dispose() {
    // Remove all planes
    for (const targetId of Array.from(this.targetPlanes.keys())) {
      this.removeTarget(targetId);
    }

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
    }

    // Dispose video manager
    this.videoManager.dispose();
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.VideoARRenderer = VideoARRenderer;
}
