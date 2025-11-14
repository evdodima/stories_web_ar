/**
 * ZipDatabaseLoader.js
 *
 * Loads image targets and videos from a zip archive and builds
 * vocabulary tree dynamically in the browser
 */

class ZipDatabaseLoader {
  constructor(options = {}) {
    this.onProgress = options.onProgress || (() => {});
    this.albumCode = options.albumCode || null;
    this.vocabularyBuilder = null;
    this.database = null;
    this.vocabularyQuery = null;
    this.videoBlobs = new Map(); // targetId -> blob URL
  }

  /**
   * Load database from zip file
   * @param {string|File} source - URL to zip or File object
   * @returns {Promise<Object>} Database structure
   */
  async loadFromZip(source) {
    console.log('Loading album from zip...');
    this.onProgress({ stage: 'loading', progress: 0, message: 'Loading zip file...' });

    let zipData;
    if (typeof source === 'string') {
      // Load from URL
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to load zip: ${response.statusText}`);
      }
      zipData = await response.arrayBuffer();
    } else {
      // Load from File object
      zipData = await source.arrayBuffer();
    }

    this.onProgress({ stage: 'loading', progress: 50, message: 'Extracting archive...' });

    // Extract zip contents
    const zip = await JSZip.loadAsync(zipData);

    // Extract images and videos
    const images = await this._extractImages(zip);
    const videos = await this._extractVideos(zip);

    this.onProgress({ stage: 'loading', progress: 100, message: 'Zip extracted' });

    // Build database from images
    await this._buildDatabase(images, videos);

    return this.database;
  }

  /**
   * Extract image files from zip (files in root directory only)
   */
  async _extractImages(zip) {
    const images = [];
    const imageFiles = [];

    // Look for image files in root directory
    zip.forEach((relativePath, file) => {
      // Only process files in root (no directory separator)
      if (!file.dir && !relativePath.includes('/') && this._isImageFile(relativePath)) {
        imageFiles.push({ path: relativePath, file });
      }
    });

    if (imageFiles.length === 0) {
      throw new Error(`No image files found in zip root directory`);
    }

    console.log(`Found ${imageFiles.length} images in zip`);

    this.onProgress({
      stage: 'images',
      progress: 0,
      message: `Loading ${imageFiles.length} images...`
    });

    // Load each image
    for (let i = 0; i < imageFiles.length; i++) {
      const { path, file } = imageFiles[i];
      const blob = await file.async('blob');
      const imageMat = await this._loadImageToMat(blob);

      // Extract target ID from filename
      const filename = path.split('/').pop();
      const baseFilename = filename.replace(/\.[^/.]+$/, '');

      // Handle both patterns:
      // 1. Direct match: photo1.jpg → photo1
      // 2. Photo/video pattern: photo123.jpg → 123 (to match with video123.mp4)
      let targetId = baseFilename;
      if (baseFilename.match(/^photo\d+$/i)) {
        // Extract just the number: photo123 → 123
        targetId = baseFilename.replace(/^photo/i, '');
      }

      images.push({
        targetId,
        filename,
        imageMat,
        blob
      });

      this.onProgress({
        stage: 'images',
        progress: ((i + 1) / imageFiles.length) * 100,
        message: `Loaded ${filename}`
      });
    }

    return images;
  }

  /**
   * Extract video files from zip (files in root directory only)
   */
  async _extractVideos(zip) {
    const videos = new Map();
    const videoFiles = [];

    // Look for video files in root directory
    zip.forEach((relativePath, file) => {
      // Only process files in root (no directory separator)
      if (!file.dir && !relativePath.includes('/') && this._isVideoFile(relativePath)) {
        videoFiles.push({ path: relativePath, file });
      }
    });

    console.log(`Found ${videoFiles.length} videos in zip`);

    this.onProgress({
      stage: 'videos',
      progress: 0,
      message: `Loading ${videoFiles.length} videos...`
    });

    // Load each video
    for (let i = 0; i < videoFiles.length; i++) {
      const { path, file } = videoFiles[i];
      const arrayBuffer = await file.async('arraybuffer');

      // Extract target ID from filename
      const filename = path.split('/').pop();
      const baseFilename = filename.replace(/\.[^/.]+$/, '');

      // Get MIME type based on file extension
      const ext = filename.toLowerCase().split('.').pop();
      const mimeType = this._getVideoMimeType(ext);

      // Create blob with correct MIME type
      const blob = new Blob([arrayBuffer], { type: mimeType });

      // Handle both patterns:
      // 1. Direct match: video1.mp4 → video1
      // 2. Photo/video pattern: video123.mp4 → 123 (to match with photo123.jpg)
      let targetId = baseFilename;
      if (baseFilename.match(/^video\d+$/i)) {
        // Extract just the number: video123 → 123
        targetId = baseFilename.replace(/^video/i, '');
      }

      // Create blob URL for video
      const blobUrl = URL.createObjectURL(blob);
      videos.set(targetId, blobUrl);
      this.videoBlobs.set(targetId, blobUrl);

      this.onProgress({
        stage: 'videos',
        progress: ((i + 1) / videoFiles.length) * 100,
        message: `Loaded ${filename}`
      });
    }

    return videos;
  }

  /**
   * Build database from extracted images
   */
  async _buildDatabase(images, videos) {
    console.log('Building vocabulary tree from images...');

    // Create vocabulary builder
    this.vocabularyBuilder = new VocabularyBuilder({
      branchingFactor: AppConfig.vocabulary.branchingFactor,
      levels: AppConfig.vocabulary.levels,
      maxFeaturesPerTarget: AppConfig.vocabulary.maxFeaturesPerTargetStorage,
      albumCode: this.albumCode,
      onProgress: (progress) => {
        this.onProgress({
          stage: progress.stage,
          progress: progress.progress || 0,
          message: this._getProgressMessage(progress.stage)
        });
      }
    });

    // Prepare target data for processing
    const targetData = images.map(img => ({
      imageMat: img.imageMat,
      targetId: img.targetId
    }));

    // Process targets and build vocabulary
    await this.vocabularyBuilder.processTargets(targetData);

    // Export database
    this.database = this.vocabularyBuilder.exportDatabase();

    // Add video URLs to targets
    for (const target of this.database.targets) {
      const videoUrl = videos.get(target.id);
      if (videoUrl) {
        target.videoUrl = videoUrl;
      } else {
        console.warn(`No video found for target: ${target.id}`);
      }
    }

    // Clean up OpenCV mats
    for (const img of images) {
      img.imageMat.delete();
    }

    console.log('Database built successfully!');
    console.log(`  Targets: ${this.database.targets.length}`);
    console.log(`  Vocabulary size: ${this.database.metadata.vocabulary_size}`);

    // Initialize vocabulary query for fast candidate selection
    this._initializeVocabularyQuery();

    this.onProgress({
      stage: 'complete',
      progress: 100,
      message: 'Album loaded successfully!'
    });
  }

  /**
   * Initialize VocabularyTreeQuery from the built database
   */
  _initializeVocabularyQuery() {
    try {
      // VocabularyTreeQuery expects vocabulary as array of arrays (not Mats)
      const vocabulary = this.database.vocabulary.words;
      const idf = this.database.vocabulary.idf_weights;

      // Create vocabulary query (assumes VocabularyTreeQuery is globally available)
      if (typeof VocabularyTreeQuery !== 'undefined') {
        this.vocabularyQuery = new VocabularyTreeQuery(vocabulary, idf);
        console.log('Vocabulary tree query initialized');
      } else {
        console.warn('VocabularyTreeQuery not available');
      }
    } catch (error) {
      console.error('Error initializing vocabulary query:', error);
      this.vocabularyQuery = null;
    }
  }

  /**
   * Load image blob to OpenCV Mat
   */
  _loadImageToMat(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Create canvas and draw image
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          // Convert to OpenCV Mat
          const imageMat = cv.imread(canvas);

          // Convert to grayscale for feature detection
          const gray = new cv.Mat();
          cv.cvtColor(imageMat, gray, cv.COLOR_RGBA2GRAY);

          let processingMat = gray;

          // Preprocessing pipeline for better feature quality (matches FeatureDetector)
          if (AppConfig.preprocessing.useCLAHE) {
            // 1. Optional Gaussian blur to reduce noise
            if (AppConfig.preprocessing.useBlur) {
              const blurred = new cv.Mat();
              const kernelSize = AppConfig.preprocessing.blurKernelSize || 3;
              const sigma = AppConfig.preprocessing.blurSigma || 0.5;
              cv.GaussianBlur(processingMat, blurred, new cv.Size(kernelSize, kernelSize), sigma);
              processingMat = blurred;
            }

            // 2. CLAHE for contrast enhancement
            const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
            const enhanced = new cv.Mat();
            clahe.apply(processingMat, enhanced);

            // Clean up intermediate results
            if (AppConfig.preprocessing.useBlur) {
              processingMat.delete(); // Delete blurred mat
            }
            gray.delete(); // Delete original
            processingMat = enhanced; // Use enhanced version
            clahe.delete();
          }

          // Clean up
          imageMat.delete();

          URL.revokeObjectURL(img.src);
          resolve(processingMat);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * Check if file is an image
   */
  _isImageFile(filename) {
    const ext = filename.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'bmp', 'webp'].includes(ext);
  }

  /**
   * Check if file is a video
   */
  _isVideoFile(filename) {
    const ext = filename.toLowerCase().split('.').pop();
    return ['mp4', 'webm', 'ogv', 'mov'].includes(ext);
  }

  /**
   * Get MIME type for video file
   */
  _getVideoMimeType(ext) {
    const mimeTypes = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogv': 'video/ogg',
      'mov': 'video/quicktime'
    };
    return mimeTypes[ext] || 'video/mp4'; // Default to mp4 if unknown
  }

  /**
   * Get user-friendly progress message
   */
  _getProgressMessage(stage) {
    const messages = {
      loading: 'Loading zip archive...',
      images: 'Loading images...',
      videos: 'Loading videos...',
      extracting: 'Extracting features...',
      clustering: 'Building vocabulary tree...',
      bow: 'Computing bag-of-words...',
      idf: 'Computing IDF weights...',
      tfidf: 'Computing TF-IDF vectors...',
      complete: 'Complete!'
    };
    return messages[stage] || 'Processing...';
  }

  /**
   * Get database
   */
  getDatabase() {
    return this.database;
  }

  /**
   * Get vocabulary query instance
   * @returns {VocabularyTreeQuery|null}
   */
  getVocabularyQuery() {
    return this.vocabularyQuery;
  }

  /**
   * Get video blob URL for a target
   */
  getVideoForTarget(targetId) {
    return this.videoBlobs.get(targetId);
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Revoke all blob URLs
    for (const blobUrl of this.videoBlobs.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    this.videoBlobs.clear();
    this.database = null;
    this.vocabularyBuilder = null;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.ZipDatabaseLoader = ZipDatabaseLoader;
}
