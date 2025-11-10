/**
 * CacheManager - IndexedDB storage for albums, videos, and vocabulary trees
 * Handles persistent caching with TTL support
 */

class CacheManager {
  constructor() {
    this.dbName = 'WebarAlbumCache';
    this.dbVersion = 1;
    this.db = null;
    this.cacheTTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    // Store names
    this.stores = {
      albums: 'albums',          // Album zip files
      contents: 'contents',      // Extracted images/videos
      vocabulary: 'vocabulary'   // Vocabulary trees
    };
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('[Cache] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[Cache] IndexedDB opened successfully');

        // Clean up expired cache entries
        this.cleanExpiredEntries();

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(this.stores.albums)) {
          const albumStore = db.createObjectStore(this.stores.albums, {
            keyPath: 'albumCode'
          });
          albumStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(this.stores.contents)) {
          const contentStore = db.createObjectStore(this.stores.contents, {
            keyPath: 'albumCode'
          });
          contentStore.createIndex('timestamp', 'timestamp', {
            unique: false
          });
        }

        if (!db.objectStoreNames.contains(this.stores.vocabulary)) {
          const vocabStore = db.createObjectStore(this.stores.vocabulary, {
            keyPath: 'albumCode'
          });
          vocabStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        console.log('[Cache] IndexedDB schema created');
      };
    });
  }

  /**
   * Store album zip file
   */
  async storeAlbum(albumCode, zipBlob) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.albums],
        'readwrite');
      const store = transaction.objectStore(this.stores.albums);

      const data = {
        albumCode,
        zipBlob,
        timestamp: Date.now(),
        size: zipBlob.size
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`[Cache] Album ${albumCode} stored (${this.formatSize(
          zipBlob.size)})`);
        resolve();
      };

      request.onerror = () => {
        console.error('[Cache] Failed to store album:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Retrieve album zip file
   */
  async getAlbum(albumCode) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.albums],
        'readonly');
      const store = transaction.objectStore(this.stores.albums);
      const request = store.get(albumCode);

      request.onsuccess = () => {
        const result = request.result;

        if (!result) {
          console.log(`[Cache] Album ${albumCode} not found`);
          resolve(null);
          return;
        }

        // Check if cache is expired
        const age = Date.now() - result.timestamp;
        if (age > this.cacheTTL) {
          console.log(`[Cache] Album ${albumCode} expired (${Math.floor(
            age / (24 * 60 * 60 * 1000))} days old)`);
          this.deleteAlbum(albumCode);
          resolve(null);
          return;
        }

        console.log(`[Cache] Album ${albumCode} found (${this.formatSize(
          result.size)})`);
        resolve(result.zipBlob);
      };

      request.onerror = () => {
        console.error('[Cache] Failed to get album:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete album from cache
   */
  async deleteAlbum(albumCode) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.albums],
        'readwrite');
      const store = transaction.objectStore(this.stores.albums);
      const request = store.delete(albumCode);

      request.onsuccess = () => {
        console.log(`[Cache] Album ${albumCode} deleted`);
        resolve();
      };

      request.onerror = () => {
        console.error('[Cache] Failed to delete album:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Store extracted album contents (images and videos)
   */
  async storeContents(albumCode, contents) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.contents],
        'readwrite');
      const store = transaction.objectStore(this.stores.contents);

      const data = {
        albumCode,
        contents,
        timestamp: Date.now()
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`[Cache] Contents for ${albumCode} stored`);
        resolve();
      };

      request.onerror = () => {
        console.error('[Cache] Failed to store contents:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Retrieve extracted album contents
   */
  async getContents(albumCode) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.contents],
        'readonly');
      const store = transaction.objectStore(this.stores.contents);
      const request = store.get(albumCode);

      request.onsuccess = () => {
        const result = request.result;

        if (!result) {
          console.log(`[Cache] Contents for ${albumCode} not found`);
          resolve(null);
          return;
        }

        // Check if cache is expired
        const age = Date.now() - result.timestamp;
        if (age > this.cacheTTL) {
          console.log(`[Cache] Contents for ${albumCode} expired`);
          this.deleteContents(albumCode);
          resolve(null);
          return;
        }

        console.log(`[Cache] Contents for ${albumCode} found`);
        resolve(result.contents);
      };

      request.onerror = () => {
        console.error('[Cache] Failed to get contents:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete contents from cache
   */
  async deleteContents(albumCode) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.contents],
        'readwrite');
      const store = transaction.objectStore(this.stores.contents);
      const request = store.delete(albumCode);

      request.onsuccess = () => {
        console.log(`[Cache] Contents for ${albumCode} deleted`);
        resolve();
      };

      request.onerror = () => {
        console.error('[Cache] Failed to delete contents:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Store vocabulary tree
   */
  async storeVocabulary(albumCode, vocabularyData) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.vocabulary],
        'readwrite');
      const store = transaction.objectStore(this.stores.vocabulary);

      const data = {
        albumCode,
        vocabularyData,
        timestamp: Date.now()
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`[Cache] Vocabulary for ${albumCode} stored`);
        resolve();
      };

      request.onerror = () => {
        console.error('[Cache] Failed to store vocabulary:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Retrieve vocabulary tree
   */
  async getVocabulary(albumCode) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.vocabulary],
        'readonly');
      const store = transaction.objectStore(this.stores.vocabulary);
      const request = store.get(albumCode);

      request.onsuccess = () => {
        const result = request.result;

        if (!result) {
          console.log(`[Cache] Vocabulary for ${albumCode} not found`);
          resolve(null);
          return;
        }

        // Check if cache is expired
        const age = Date.now() - result.timestamp;
        if (age > this.cacheTTL) {
          console.log(`[Cache] Vocabulary for ${albumCode} expired`);
          this.deleteVocabulary(albumCode);
          resolve(null);
          return;
        }

        console.log(`[Cache] Vocabulary for ${albumCode} found`);
        resolve(result.vocabularyData);
      };

      request.onerror = () => {
        console.error('[Cache] Failed to get vocabulary:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete vocabulary from cache
   */
  async deleteVocabulary(albumCode) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.vocabulary],
        'readwrite');
      const store = transaction.objectStore(this.stores.vocabulary);
      const request = store.delete(albumCode);

      request.onsuccess = () => {
        console.log(`[Cache] Vocabulary for ${albumCode} deleted`);
        resolve();
      };

      request.onerror = () => {
        console.error('[Cache] Failed to delete vocabulary:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clean up expired cache entries across all stores
   */
  async cleanExpiredEntries() {
    if (!this.db) return;

    const now = Date.now();
    const stores = Object.values(this.stores);

    for (const storeName of stores) {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('timestamp');
        const request = index.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const age = now - cursor.value.timestamp;
            if (age > this.cacheTTL) {
              console.log(`[Cache] Cleaning expired ${storeName}:`,
                cursor.value.albumCode);
              cursor.delete();
            }
            cursor.continue();
          }
        };
      } catch (error) {
        console.error(`[Cache] Error cleaning ${storeName}:`, error);
      }
    }
  }

  /**
   * Get all cached album codes
   */
  async getCachedAlbums() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.stores.albums],
        'readonly');
      const store = transaction.objectStore(this.stores.albums);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('[Cache] Failed to get cached albums:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    if (!this.db) await this.init();

    const stats = {
      albums: { count: 0, size: 0 },
      contents: { count: 0 },
      vocabulary: { count: 0 },
      total: 0
    };

    try {
      // Get album stats
      const albumTransaction = this.db.transaction([this.stores.albums],
        'readonly');
      const albumStore = albumTransaction.objectStore(this.stores.albums);
      const albumRequest = albumStore.getAll();

      await new Promise((resolve) => {
        albumRequest.onsuccess = () => {
          const albums = albumRequest.result;
          stats.albums.count = albums.length;
          stats.albums.size = albums.reduce((sum, album) =>
            sum + (album.size || 0), 0);
          stats.total += stats.albums.size;
          resolve();
        };
      });

      // Get contents count
      const contentTransaction = this.db.transaction([this.stores.contents],
        'readonly');
      const contentStore = contentTransaction.objectStore(this.stores.contents);
      const contentRequest = contentStore.count();

      await new Promise((resolve) => {
        contentRequest.onsuccess = () => {
          stats.contents.count = contentRequest.result;
          resolve();
        };
      });

      // Get vocabulary count
      const vocabTransaction = this.db.transaction([this.stores.vocabulary],
        'readonly');
      const vocabStore = vocabTransaction.objectStore(this.stores.vocabulary);
      const vocabRequest = vocabStore.count();

      await new Promise((resolve) => {
        vocabRequest.onsuccess = () => {
          stats.vocabulary.count = vocabRequest.result;
          resolve();
        };
      });

      return stats;
    } catch (error) {
      console.error('[Cache] Failed to get cache stats:', error);
      return stats;
    }
  }

  /**
   * Clear all caches
   */
  async clearAll() {
    if (!this.db) await this.init();

    const stores = Object.values(this.stores);

    for (const storeName of stores) {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        await new Promise((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
        });
        console.log(`[Cache] Cleared ${storeName}`);
      } catch (error) {
        console.error(`[Cache] Failed to clear ${storeName}:`, error);
      }
    }
  }

  /**
   * Format bytes to human-readable size
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
