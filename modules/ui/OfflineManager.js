/**
 * OfflineManager - Handles offline detection and cache status display
 * Provides UI indicators for network status and cache availability
 */

class OfflineManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.cacheManager = null;
    this.statusElement = null;

    this.init();
  }

  /**
   * Initialize offline manager
   */
  async init() {
    // Set up online/offline event listeners
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Initialize cache manager
    if (window.CacheManager) {
      try {
        this.cacheManager = new window.CacheManager();
        await this.cacheManager.init();
        console.log('[OfflineManager] Cache manager initialized');
      } catch (error) {
        console.error('[OfflineManager] Failed to init cache:', error);
      }
    }

    // Create status element if it doesn't exist
    this.createStatusElement();

    // Update initial status
    this.updateStatus();

    // Add cache info to control panel if it exists
    this.addCacheInfoToPanel();
  }

  /**
   * Create offline status element
   */
  createStatusElement() {
    // Check if element already exists
    if (document.getElementById('offlineStatus')) {
      this.statusElement = document.getElementById('offlineStatus');
      return;
    }

    // Create status banner
    const statusDiv = document.createElement('div');
    statusDiv.id = 'offlineStatus';
    statusDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 8px 16px;
      background: #ef4444;
      color: white;
      text-align: center;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      display: none;
      transform: translateY(-100%);
      transition: transform 0.3s ease-in-out;
    `;
    statusDiv.innerHTML = `
      <span id="offlineStatusText">You are offline</span>
    `;

    document.body.appendChild(statusDiv);
    this.statusElement = statusDiv;
  }

  /**
   * Handle online event
   */
  handleOnline() {
    console.log('[OfflineManager] Network connection restored');
    this.isOnline = true;
    this.updateStatus();
  }

  /**
   * Handle offline event
   */
  handleOffline() {
    console.log('[OfflineManager] Network connection lost');
    this.isOnline = false;
    this.updateStatus();
  }

  /**
   * Update status display
   */
  updateStatus() {
    if (!this.statusElement) return;

    const textElement = document.getElementById('offlineStatusText');

    if (!this.isOnline) {
      // Show offline message
      this.statusElement.style.display = 'block';
      setTimeout(() => {
        this.statusElement.style.transform = 'translateY(0)';
      }, 10);

      if (this.cacheManager) {
        textElement.textContent = 'You are offline - Using cached content';
        this.statusElement.style.background = '#f59e0b'; // Orange
      } else {
        textElement.textContent = 'You are offline - Some features may not work';
        this.statusElement.style.background = '#ef4444'; // Red
      }
    } else {
      // Hide offline message
      this.statusElement.style.transform = 'translateY(-100%)';
      setTimeout(() => {
        this.statusElement.style.display = 'none';
      }, 300);
    }
  }

  /**
   * Add cache information to control panel
   */
  async addCacheInfoToPanel() {
    const controlPanel = document.getElementById('controlPanel');
    if (!controlPanel || !this.cacheManager) return;

    // Find status section
    const statusSection = controlPanel.querySelector('[data-panel="status"]');
    if (!statusSection) return;

    // Create cache info card
    const cacheCard = document.createElement('div');
    cacheCard.className = 'status-card';
    cacheCard.innerHTML = `
      <span class="status-label">Cache Status</span>
      <p class="status-text">
        <span id="cacheStatusText">Loading...</span>
      </p>
      <button id="clearCacheBtn" class="btn btn-ghost" style="margin-top: 8px; font-size: 12px;">
        Clear Cache
      </button>
    `;

    statusSection.appendChild(cacheCard);

    // Update cache stats
    this.updateCacheStats();

    // Add clear cache button handler
    const clearBtn = document.getElementById('clearCacheBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearCache());
    }
  }

  /**
   * Update cache statistics display
   */
  async updateCacheStats() {
    if (!this.cacheManager) return;

    const statusText = document.getElementById('cacheStatusText');
    if (!statusText) return;

    try {
      const stats = await this.cacheManager.getCacheStats();

      const albumCount = stats.albums.count;
      const albumSize = this.cacheManager.formatSize(stats.albums.size);
      const vocabCount = stats.vocabulary.count;

      if (albumCount === 0) {
        statusText.textContent = 'No cached albums';
      } else {
        statusText.innerHTML = `
          ${albumCount} album${albumCount > 1 ? 's' : ''} (${albumSize})<br>
          ${vocabCount} vocabulary tree${vocabCount > 1 ? 's' : ''}
        `;
      }
    } catch (error) {
      console.error('[OfflineManager] Failed to get cache stats:', error);
      statusText.textContent = 'Cache unavailable';
    }
  }

  /**
   * Clear all caches
   */
  async clearCache() {
    if (!this.cacheManager) return;

    if (!confirm('Clear all cached albums and vocabulary trees? This will free up storage but require re-downloading on next visit.')) {
      return;
    }

    try {
      console.log('[OfflineManager] Clearing caches...');

      // Clear IndexedDB
      await this.cacheManager.clearAll();

      // Clear Service Worker caches
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const channel = new MessageChannel();

        channel.port1.onmessage = (event) => {
          if (event.data.success) {
            console.log('[OfflineManager] Service Worker caches cleared');
          }
        };

        navigator.serviceWorker.controller.postMessage(
          { type: 'CLEAR_CACHE' },
          [channel.port2]
        );
      }

      // Update stats
      await this.updateCacheStats();

      alert('Cache cleared successfully');
    } catch (error) {
      console.error('[OfflineManager] Failed to clear cache:', error);
      alert('Failed to clear cache: ' + error.message);
    }
  }

  /**
   * Get cache size estimate
   */
  async getCacheSize() {
    if (!this.cacheManager) return 0;

    try {
      const stats = await this.cacheManager.getCacheStats();
      return stats.total;
    } catch (error) {
      console.error('[OfflineManager] Failed to get cache size:', error);
      return 0;
    }
  }

  /**
   * Check if album is cached
   */
  async isAlbumCached(albumCode) {
    if (!this.cacheManager) return false;

    try {
      const cachedAlbum = await this.cacheManager.getAlbum(albumCode);
      return cachedAlbum !== null;
    } catch (error) {
      console.error('[OfflineManager] Failed to check album cache:', error);
      return false;
    }
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.OfflineManager = OfflineManager;
}
