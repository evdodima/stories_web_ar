/**
 * AlbumManager.js
 *
 * Handles album code validation and downloading from storage via backend proxy
 */

class AlbumManager {
  constructor() {
    // Backend API endpoint
    this.backendURL = 'https://pro.stories-ar.com';
  }

  /**
   * Get encrypted album code from current URL
   * @returns {string|null} Encrypted code or null if not found
   */
  getAlbumCodeFromURL() {
    try {
      // Get URL parameters
      const urlParams = new URLSearchParams(window.location.search);

      // Look for 'c' parameter
      let encodedCode = urlParams.get('c');
      if (!encodedCode) {
        console.log('No album code found in URL');
        return null;
      }

      // Fix: URLSearchParams converts + to space, but we need + for base64
      // Convert spaces back to + for proper base64 decoding
      encodedCode = encodedCode.replace(/ /g, '+');

      console.log('Found encoded album code in URL');
      return encodedCode;
    } catch (error) {
      console.error('Error parsing URL for album code:', error);
      return null;
    }
  }

  /**
   * Get download URL from backend API
   * @param {string} encryptedCode - Encrypted album code
   * @returns {Promise<string>} Download URL
   */
  async getDownloadURL(encryptedCode) {
    try {
      const apiUrl = `${this.backendURL}/api/v1/albums/download`;

      console.log('Fetching download URL from backend...');
      console.log('Encrypted code being sent:', encryptedCode);
      console.log('Code length:', encryptedCode.length);
      console.log('Request body:', JSON.stringify({ code: encryptedCode }));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: encryptedCode })
      });

      if (!response.ok) {
        // Try to get error details from response
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          console.error('Backend error response:', errorData);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error('Could not parse error response');
        }

        if (response.status === 404) {
          throw new Error('Album not found');
        }
        if (response.status === 401) {
          throw new Error(`Invalid or expired album code: ${errorMessage}`);
        }
        throw new Error(`API request failed: ${errorMessage}`);
      }

      const data = await response.json();
      console.log('Backend response:', data);

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.url) {
        throw new Error('No download URL in API response');
      }

      console.log('Got download URL from backend');
      return data.url;
    } catch (error) {
      console.error('Error getting download URL:', error);
      throw error;
    }
  }

  /**
   * Download album zip file
   * @param {string} url - Download URL
   * @param {Function} onProgress - Progress callback (optional)
   * @returns {Promise<Blob>} Album zip blob
   */
  async downloadAlbumZip(url, onProgress = null) {
    try {
      console.log('Downloading album from:', url);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get content length for progress tracking
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body) {
        // Fallback if streaming not supported
        const blob = await response.blob();
        if (onProgress) {
          onProgress({ loaded: blob.size, total: blob.size });
        }
        return blob;
      }

      // Stream the response with progress tracking
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        chunks.push(value);
        loaded += value.length;

        if (onProgress) {
          onProgress({ loaded, total });
        }
      }

      // Combine chunks into blob
      const blob = new Blob(chunks, { type: 'application/zip' });
      console.log('Download complete, size:', blob.size, 'bytes');

      return blob;
    } catch (error) {
      console.error('Error downloading album:', error);
      throw error;
    }
  }

  /**
   * Get album zip from URL parameter
   * Downloads the album based on the encoded URL parameter
   * @param {Function} onProgress - Progress callback (optional)
   * @returns {Promise<Blob>} Album zip blob
   */
  async getAlbumFromURL(onProgress = null) {
    try {
      // Get encrypted code from URL
      const encryptedCode = this.getAlbumCodeFromURL();
      if (!encryptedCode) {
        throw new Error('No valid album code in URL');
      }

      // Get download URL from backend
      if (onProgress) {
        onProgress({
          stage: 'api',
          message: 'Getting album download URL...'
        });
      }

      const downloadUrl = await this.getDownloadURL(encryptedCode);

      // Download the zip file
      if (onProgress) {
        onProgress({
          stage: 'download',
          message: 'Downloading album...'
        });
      }

      const zipBlob = await this.downloadAlbumZip(downloadUrl, (progress) => {
        if (onProgress && progress.total > 0) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          onProgress({
            stage: 'download',
            progress: percent,
            message: `Downloading album... ${percent}%`
          });
        }
      });

      return zipBlob;
    } catch (error) {
      console.error('Error getting album from URL:', error);
      throw error;
    }
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.AlbumManager = AlbumManager;
}
