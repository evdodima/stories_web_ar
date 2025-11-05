/**
 * Manages reference image loading and processing for multiple targets.
 * Loads targets from zip archives containing images and videos.
 */
class ReferenceImageManager {
    constructor(uiManager = null) {
        this.ui = document.getElementById('statusMessage');
        this.uiManager = uiManager || null;
        this.targets = new Map();
        this.targetOrder = [];
        this.listeners = new Set();
        this.nextId = 1;
        this.zipLoader = null;
        this.usingZipAlbum = false;
    }

    onChange(listener) {
        if (typeof listener === 'function') {
            this.listeners.add(listener);
        }

        return () => {
            this.listeners.delete(listener);
        };
    }

    notifyChange(event = {}) {
        const snapshot = this.getTargetSummaries();

        for (const listener of this.listeners) {
            try {
                listener({
                    type: event.type || 'update',
                    target: event.target || null,
                    targets: snapshot
                });
            } catch (error) {
                console.error('ReferenceImageManager listener error:', error);
            }
        }
    }

    serializeTarget(target) {
        if (!target) return null;

        const { referenceData, ...rest } = target;
        const runtime = target.runtime || {};

        return {
            ...rest,
            referenceData: undefined, // Exclude heavy OpenCV data
            runtime: {
                status: runtime.status || 'idle',
                lastSeen: runtime.lastSeen || null,
                roi: runtime.roi || null,
                score: runtime.score ?? null
            }
        };
    }

    getTargets() {
        return this.targetOrder
            .map(id => this.targets.get(id))
            .filter(Boolean);
    }

    getTargetSummaries() {
        return this.getTargets().map(target => this.serializeTarget(target));
    }

    getTarget(id) {
        return this.targets.get(id) || null;
    }

    hasTargets() {
        return this.targets.size > 0;
    }

    /**
     * Load targets from zip archive containing images and videos
     * @param {string|File} source - URL to zip file or File object
     */
    async loadFromZip(source = null) {
        this.updateStatus('Loading album archive...');

        try {
            // Unified progress aggregator
            const progressManager = typeof ProgressManager !== 'undefined' ? new ProgressManager() : null;
            const updateUnifiedProgress = (stage, progressInput, message) => {
                if (!progressManager) return;
                const { totalPercent } = progressManager.report(stage, progressInput);
                if (this.uiManager && this.uiManager.updateLoadingProgress) {
                    this.uiManager.updateLoadingProgress(totalPercent, message);
                }
            };

            // Determine the source of the album
            let albumSource = source;

            // If no source provided, try to get from URL parameter
            if (!albumSource) {
                const albumManager = new AlbumManager();

                // Check if there's an album code in the URL
                const albumCode = albumManager.getAlbumCodeFromURL();

                if (albumCode) {
                    // Download from storage via backend
                    console.log('Downloading album from cloud storage...');
                    this.updateStatus('Downloading album from cloud storage...');

                    const albumBlob = await albumManager.getAlbumFromURL((progress) => {
                        if (progress.stage === 'api') {
                            this.updateStatus(progress.message);
                            updateUnifiedProgress('api', 100, progress.message || 'Getting album URL...');
                        } else if (progress.stage === 'download') {
                            const msg = progress.message || 'Downloading album...';
                            if (typeof progress.progress === 'number') {
                                updateUnifiedProgress('download', progress.progress, msg);
                            } else if (typeof progress.loaded === 'number') {
                                updateUnifiedProgress('download', { loaded: progress.loaded, total: progress.total || 0 }, msg);
                            }
                            this.updateStatus(msg);
                        }
                    });

                    albumSource = albumBlob;
                    console.log('Album downloaded successfully');
                } else {
                    throw new Error('No album source provided and no album code found in URL');
                }
            }

            // Create loader with progress callback (ZipDatabaseLoader is globally available)
            this.zipLoader = new ZipDatabaseLoader({
                onProgress: (progress) => {
                    const stage = progress.stage;
                    const percent = (typeof progress.progress === 'number') ? progress.progress : 0;
                    const msg = progress.message || 'Processing...';

                    // Map loader stages to unified stages
                    const stageMap = {
                        loading: 'zip',
                        images: 'images',
                        videos: 'videos',
                        extracting: 'extracting',
                        clustering: 'clustering',
                        bow: 'bow',
                        idf: 'idf',
                        tfidf: 'tfidf',
                        complete: 'tfidf'
                    };

                    const unified = stageMap[stage] || 'zip';
                    updateUnifiedProgress(unified, percent, msg);

                    this.updateStatus(`${msg} (${Math.round(percent)}%)`);
                }
            });

            // Load and build database from zip
            const database = await this.zipLoader.loadFromZip(albumSource);

            console.log(`Loading ${database.targets.length} targets from album...`);

            // Convert database format to runtime targets
            for (const targetData of database.targets) {
                const target = this._convertToRuntimeTarget(targetData, database);
                this.targets.set(target.id, target);
                this.targetOrder.push(target.id);

                console.log(`Loaded target: ${target.id} (${target.numFeatures} features)`);
            }

            this.usingZipAlbum = true;
            this.updateStatus(`Loaded ${database.targets.length} targets from album.`);
            this.notifyChange({ type: 'album_loaded', targets: this.getTargetSummaries() });

            return this.getTargets();
        } catch (error) {
            console.error('Failed to load album:', error);
            this.updateStatus(`ERROR: Failed to load album: ${error.message}`);
            if (this.uiManager && this.uiManager.showError) {
                this.uiManager.showError(error.message || 'Failed to load album');
            }
            throw error;
        }
    }

    /**
     * Convert database format to runtime target format
     */
    _convertToRuntimeTarget(targetData, database) {
        // Convert keypoints to KeyPointVector
        const keypoints = new cv.KeyPointVector();
        for (const [x, y] of targetData.keypoints) {
            // OpenCV.js doesn't expose KeyPoint constructor, create object manually
            const kp = {
                pt: { x, y },
                size: 7,
                angle: -1,
                response: 0,
                octave: 0,
                class_id: -1
            };
            keypoints.push_back(kp);
        }

        // Convert descriptors to cv.Mat
        const descriptorSize = database.metadata.descriptor_bytes;
        const numDescriptors = targetData.descriptors.length;
        const descriptors = new cv.Mat(numDescriptors, descriptorSize, cv.CV_8U);

        for (let i = 0; i < numDescriptors; i++) {
            for (let j = 0; j < descriptorSize; j++) {
                descriptors.ucharPtr(i, j)[0] = targetData.descriptors[i][j];
            }
        }

        // Create a mock image object with dimensions (needed for corner calculation)
        const imageMeta = targetData.image_meta || { width: 640, height: 480 };
        const mockImage = {
            cols: imageMeta.width,
            rows: imageMeta.height
        };

        return {
            id: targetData.id,
            filename: targetData.filename,
            numFeatures: targetData.num_features,
            videoUrl: targetData.videoUrl,
            bow: targetData.bow,
            bow_tfidf: targetData.bow_tfidf,
            referenceData: {
                keypoints,
                descriptors,
                image: mockImage  // Add mock image with dimensions
            },
            runtime: {
                status: 'idle',
                lastSeen: null,
                roi: null,
                score: null
            }
        };
    }

    async loadDatabase() {
        // Load from zip album
        return await this.loadFromZip();
    }

    // Deprecated: kept for backwards compatibility
    async loadDefaultImage() {
        return await this.loadDatabase();
    }


    updateTargetRuntime(id, updates = {}) {
        const target = this.targets.get(id);
        if (!target) return;

        target.runtime = {
            status: updates.status || updates.state || target.runtime.status || 'idle',
            lastSeen: updates.lastSeen ?? target.runtime.lastSeen ?? null,
            roi: updates.roi ?? target.runtime.roi ?? null,
            score: updates.score ?? target.runtime.score ?? null
        };

        this.notifyChange({ type: 'runtime', target: this.serializeTarget(target) });
    }

    removeTarget(id) {
        const target = this.targets.get(id);
        if (!target) return false;

        this.cleanupTargetResources(target);
        this.targets.delete(id);
        this.targetOrder = this.targetOrder.filter(targetId => targetId !== id);

        this.notifyChange({ type: 'removed', target: this.serializeTarget(target) });
        return true;
    }

    clearTargets() {
        for (const target of this.targets.values()) {
            this.cleanupTargetResources(target);
        }
        this.targets.clear();
        this.targetOrder = [];

        // Clean up zip loader resources
        if (this.zipLoader) {
            this.zipLoader.cleanup();
            this.zipLoader = null;
        }

        this.notifyChange({ type: 'cleared', target: null });
    }

    cleanupTargetResources(target) {
        if (!target || !target.referenceData) return;

        const { keypoints, descriptors, image } = target.referenceData;

        // Clean up OpenCV objects
        try {
            if (keypoints && keypoints.delete) keypoints.delete();
            if (descriptors && descriptors.delete) descriptors.delete();
            if (image && image.delete) image.delete();
        } catch (error) {
            console.warn('Error cleaning up target resources:', error);
        }
    }

    updateStatus(message) {
        if (this.ui) {
            this.ui.textContent = message;
        }
    }
}

if (typeof window !== 'undefined') {
    window.ReferenceImageManager = ReferenceImageManager;
}

