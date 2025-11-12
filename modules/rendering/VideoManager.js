/**
 * Video Manager - Handles video element lifecycle and playback
 *
 * Features:
 * - Video element pooling for memory efficiency
 * - Preloading and error handling
 * - Automatic cleanup for lost targets
 */
class VideoManager {
  constructor(options = {}) {
    this.maxPoolSize = options.maxPoolSize || 5;
    this.cleanupDelay = options.cleanupDelay || 3000; // 3s after lost
    this.muted = options.muted !== false; // Default muted

    // Video pool: available videos for reuse
    this.videoPool = [];

    // Active videos: targetId -> {video, texture, url, lastSeen}
    this.activeVideos = new Map();

    // Loading videos: url -> Promise
    this.loadingVideos = new Map();

    // Cleanup timer
    this.cleanupTimer = null;
    this.startCleanupTimer();
  }

  /**
   * Get or create video for target
   * @param {string} targetId - Target identifier
   * @param {string} videoUrl - Video source URL
   * @returns {Promise<{video: HTMLVideoElement, isNew: boolean}>}
   */
  async getVideoForTarget(targetId, videoUrl) {
    // Check if already active
    const active = this.activeVideos.get(targetId);
    if (active) {
      // Check if still loading - wait for it to complete
      if (active.loadPromise) {
        await active.loadPromise;
        // After waiting, get the updated active entry
        const updatedActive = this.activeVideos.get(targetId);
        if (updatedActive && updatedActive.video) {
          updatedActive.lastSeen = Date.now();
          return { video: updatedActive.video, isNew: false };
        }
        return null;
      }

      active.lastSeen = Date.now();
      if (active.url === videoUrl) {
        return { video: active.video, isNew: false };
      } else {
        // URL changed - need to reload
        console.log('[VideoManager] ↻ URL changed, reloading video');
        await this.loadVideo(active.video, videoUrl);
        active.url = videoUrl;
        return { video: active.video, isNew: false };
      }
    }

    // Create a promise for this load operation
    const loadPromise = (async () => {
      // Get video from pool or create new
      let video = this.videoPool.pop();
      if (!video) {
        console.log('[VideoManager] Creating new video element');
        video = this.createVideoElement();
      } else {
        console.log('[VideoManager] Reusing video from pool');
      }

      // Load video
      console.log('[VideoManager] Loading video from URL:', videoUrl);
      await this.loadVideo(video, videoUrl);

      // Update registration with actual video
      this.activeVideos.set(targetId, {
        video,
        url: videoUrl,
        lastSeen: Date.now(),
        loadPromise: null,
        preloaded: false // Mark as not preloaded (loaded on-demand)
      });

      console.log('[VideoManager] Video loaded and registered for target:', targetId);
      return { video, isNew: true };
    })();

    // Register immediately with the load promise to prevent duplicate loads
    this.activeVideos.set(targetId, { loadPromise });

    return loadPromise;
  }

  /**
   * Create new video element
   * @returns {HTMLVideoElement}
   */
  createVideoElement() {
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous'); // Enable CORS for WebGL textures
    video.muted = this.muted;
    video.loop = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    console.log('[VideoManager] Created video element with CORS enabled');
    return video;
  }

  /**
   * Load video source
   * @param {HTMLVideoElement} video
   * @param {string} url
   * @returns {Promise<void>}
   */
  async loadVideo(video, url) {
    // Check if already loading this URL
    if (this.loadingVideos.has(url)) {
      console.log('[VideoManager] Video already loading, waiting...');
      return this.loadingVideos.get(url);
    }

    const loadPromise = new Promise((resolve, reject) => {
      let checkInterval = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (checkInterval) clearInterval(checkInterval);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('error', onError);
        this.loadingVideos.delete(url);
      };

      const timeout = setTimeout(() => {
        console.warn('[VideoManager] Video load timeout, resolving anyway');
        cleanup();
        resolve(); // Resolve anyway after timeout
      }, 5000); // 5 second timeout

      const onCanPlay = () => {
        console.log('[VideoManager] Video canplay event fired');
        cleanup();
        resolve();
      };

      const onLoadedData = () => {
        console.log('[VideoManager] Video loadeddata event fired');
        cleanup();
        resolve();
      };

      const onError = (e) => {
        cleanup();
        console.error(`[VideoManager] Failed to load video: ${url}`, e);
        console.error('[VideoManager] Error details:', {
          error: video.error,
          networkState: video.networkState,
          readyState: video.readyState
        });
        reject(new Error(`Failed to load video: ${url}`));
      };

      // Check if video already has this src loaded
      if (video.src === url && video.readyState >= 2) {
        console.log('[VideoManager] Video already loaded');
        this.loadingVideos.delete(url);
        resolve();
        return;
      }

      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('error', onError);

      console.log('[VideoManager] Setting video src and calling load()');
      video.src = url;
      video.load();

      // Also check readyState periodically
      checkInterval = setInterval(() => {
        console.log('[VideoManager] Video readyState:', video.readyState, 'networkState:', video.networkState);
        if (video.readyState >= 2) {
          cleanup();
          resolve();
        }
      }, 500);
    });

    this.loadingVideos.set(url, loadPromise);
    return loadPromise;
  }

  /**
   * Play video for target
   * @param {string} targetId
   */
  async playVideo(targetId) {
    const active = this.activeVideos.get(targetId);
    if (!active) {
      console.warn(`[VideoManager] ⚠️ No active video found for ${targetId}`);
      return;
    }

    // Wait for loading if still in progress
    if (active.loadPromise) {
      await active.loadPromise;
      return this.playVideo(targetId); // Retry after loading
    }

    if (active.video) {
      // Mark as used (no longer preloaded) so it can be cleaned up normally
      if (active.preloaded) {
        active.preloaded = false;
      }

      if (active.video.paused) {
        active.video.play().catch(e => {
          console.error(`❌ Failed to play video for ${targetId}:`, e);
        });
      }
    } else {
      console.warn(`[VideoManager] ⚠️ Video not ready for ${targetId}`);
    }
  }

  /**
   * Pause video for target
   * @param {string} targetId
   */
  pauseVideo(targetId) {
    const active = this.activeVideos.get(targetId);
    if (active && active.video && !active.video.paused) {
      active.video.pause();
    }
  }

  /**
   * Update target as seen (resets cleanup timer)
   * @param {string} targetId
   */
  updateTargetSeen(targetId) {
    const active = this.activeVideos.get(targetId);
    if (active && !active.loadPromise && active.video) {
      active.lastSeen = Date.now();
      // Mark preloaded videos as used when they're being tracked
      if (active.preloaded) {
        active.preloaded = false;
      }
    }
  }

  /**
   * Set mute state for all videos
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.muted = muted;
    for (const [_, active] of this.activeVideos) {
      if (active.video) {
        active.video.muted = muted;
      }
    }
  }

  /**
   * Cleanup timer - removes videos for lost targets
   */
  startCleanupTimer() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const toRemove = [];

      for (const [targetId, active] of this.activeVideos) {
        // Skip entries that are still loading or don't have lastSeen
        if (active.loadPromise || !active.lastSeen) continue;

        // Skip preloaded videos - they should stay loaded until used
        if (active.preloaded) continue;

        if (now - active.lastSeen > this.cleanupDelay) {
          toRemove.push(targetId);
        }
      }

      for (const targetId of toRemove) {
        this.releaseVideo(targetId);
      }
    }, 1000); // Check every second
  }

  /**
   * Release video back to pool
   * @param {string} targetId
   */
  releaseVideo(targetId) {
    const active = this.activeVideos.get(targetId);
    if (!active) return;

    // Skip if still loading
    if (active.loadPromise) return;

    if (!active.video) return;

    // Pause and reset
    active.video.pause();
    active.video.currentTime = 0;

    // Return to pool if not full
    if (this.videoPool.length < this.maxPoolSize) {
      this.videoPool.push(active.video);
    } else {
      // Remove from DOM and cleanup
      active.video.src = '';
      active.video.load();
      if (active.video.parentNode) {
        active.video.parentNode.removeChild(active.video);
      }
    }

    this.activeVideos.delete(targetId);
  }

  /**
   * Get video element for target
   * @param {string} targetId
   * @returns {HTMLVideoElement|null}
   */
  getVideo(targetId) {
    const active = this.activeVideos.get(targetId);
    return active ? active.video : null;
  }

  /**
   * Preload videos for all targets
   * @param {Array} targets - Array of target objects with videoUrl
   */
  async preloadVideos(targets) {
    const preloadPromises = targets.map(async (target) => {
      if (!target.videoUrl) {
        console.warn(`[VideoManager] Target ${target.id} has no videoUrl`);
        return;
      }

      try {
        // Use getVideoForTarget to handle loading properly
        await this.getVideoForTarget(target.id, target.videoUrl);

        // Mark as preloaded to prevent cleanup
        const active = this.activeVideos.get(target.id);
        if (active && active.video) {
          active.preloaded = true;
          active.lastSeen = Date.now();
        }
      } catch (error) {
        console.error(`[VideoManager] Failed to preload video for target ${target.id}:`, error);
      }
    });

    await Promise.all(preloadPromises);
  }

  /**
   * Cleanup all resources
   */
  dispose() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Release all active videos
    for (const targetId of Array.from(this.activeVideos.keys())) {
      this.releaseVideo(targetId);
    }

    // Cleanup pool
    for (const video of this.videoPool) {
      video.src = '';
      video.load();
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    }
    this.videoPool = [];
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.VideoManager = VideoManager;
}
