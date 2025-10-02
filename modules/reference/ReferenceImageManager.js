/**
 * Manages reference image loading and processing for multiple targets.
 */
class ReferenceImageManager {
    constructor() {
        this.ui = document.getElementById('statusMessage');
        this.targets = new Map();
        this.targetOrder = [];
        this.listeners = new Set();
        this.nextId = 1;
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

    async loadDefaultImage() {
        this.updateStatus('Loading default reference image...');

        const img = new Image();
        try {
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Failed to load reference.jpg'));
                img.src = 'reference.jpg';
            });

            const target = await this.addImageElement(img, {
                label: 'Default target',
                source: 'reference.jpg'
            }, { maxFeatures: 500, briskThreshold: 50 });

            if (target) {
                this.updateStatus(`Loaded default target (${target.featureCount} features).`);
                this.notifyChange({ type: 'added', target: this.serializeTarget(target) });
            }
        } catch (error) {
            this.updateStatus(`Error loading reference image: ${error.message}`);
            console.error(error);
        }
    }

    async loadFromFile(event) {
        const files = event?.target?.files;
        if (!files || files.length === 0) {
            return [];
        }

        return this.loadFromFileList(files);
    }

    async loadFromFileList(fileList, options = {}) {
        if (!fileList || fileList.length === 0) {
            return [];
        }

        const loadedTargets = [];

        for (const file of fileList) {
            if (!file) continue;

            let imageUrl = null;
            try {
                imageUrl = URL.createObjectURL(file);
                const img = await this.readImage(imageUrl);
                const target = await this.addImageElement(
                    img,
                    { label: file.name, source: file.name },
                    options
                );

                if (target) {
                    loadedTargets.push(target);
                    this.notifyChange({ type: 'added', target: this.serializeTarget(target) });
                }
            } catch (error) {
                this.updateStatus(`Error loading ${file.name}: ${error.message}`);
                console.error(error);
            } finally {
                if (imageUrl) {
                    URL.revokeObjectURL(imageUrl);
                }
            }
        }

        if (loadedTargets.length > 0) {
            const names = loadedTargets.map(target => target.label).join(', ');
            this.updateStatus(`Loaded ${loadedTargets.length} target${loadedTargets.length > 1 ? 's' : ''}: ${names}`);
        } else if (!this.hasTargets()) {
            this.updateStatus('Upload a reference image before starting.');
        }

        return loadedTargets;
    }

    async readImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image source'));
            img.src = src;
        });
    }

    async addImageElement(img, metadata = {}, options = {}) {
        if (!img) return null;

        if (!img.naturalWidth || !img.naturalHeight) {
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
        }

        const { referenceData, featureCount } = await this.processImage(img, options);

        const target = {
            id: `target-${this.nextId++}`,
            label: metadata.label || `Target ${this.nextId}`,
            source: metadata.source || null,
            width: referenceData.image.cols,
            height: referenceData.image.rows,
            featureCount,
            referenceData,
            metadata,
            runtime: {
                status: 'idle',
                lastSeen: null,
                roi: null,
                score: null
            },
            createdAt: Date.now()
        };

        this.registerTarget(target);
        return target;
    }

    registerTarget(target) {
        if (!target || !target.id) return;

        if (this.targets.has(target.id)) {
            this.cleanupTargetResources(this.targets.get(target.id));
        }

        this.targets.set(target.id, target);
        this.targetOrder.push(target.id);
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
        this.notifyChange({ type: 'cleared', target: null });
    }

    cleanupTargetResources(target) {
        if (!target || !target.referenceData) return;

        const { image, imageGray, keypoints, descriptors } = target.referenceData;
        if (image) image.delete();
        if (imageGray) imageGray.delete();
        if (keypoints) keypoints.delete();
        if (descriptors) descriptors.delete();
    }

    async processImage(img, options = {}) {
        const { maxFeatures = 500, briskThreshold = 50 } = options;

        let image = null;
        let imageGray = null;
        let keypoints = null;
        let descriptors = null;
        let detector = null;
        let tmpKeypoints = null;

        try {
            image = cv.imread(img);

            imageGray = new cv.Mat();
            cv.cvtColor(image, imageGray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(imageGray, imageGray, new cv.Size(3, 3), 0);
            cv.equalizeHist(imageGray, imageGray);

            detector = new cv.BRISK(briskThreshold, 3, 1.0);

            tmpKeypoints = new cv.KeyPointVector();
            descriptors = new cv.Mat();

            detector.detect(imageGray, tmpKeypoints);

            let keypointsArray = [];
            for (let i = 0; i < tmpKeypoints.size(); i++) {
                keypointsArray.push(tmpKeypoints.get(i));
            }

            keypointsArray.sort((a, b) => b.response - a.response);
            if (keypointsArray.length > maxFeatures) {
                keypointsArray = keypointsArray.slice(0, maxFeatures);
            }

            keypoints = new cv.KeyPointVector();
            for (const kp of keypointsArray) {
                keypoints.push_back(kp);
            }

            detector.compute(imageGray, keypoints, descriptors);

            const featureCount = keypoints.size();

            this.updateStatus(`Reference image processed (${featureCount} features).`);

            return {
                referenceData: { image, imageGray, keypoints, descriptors },
                featureCount
            };
        } catch (error) {
            if (image) image.delete();
            if (imageGray) imageGray.delete();
            if (keypoints) keypoints.delete();
            if (descriptors) descriptors.delete();

            throw error;
        } finally {
            if (detector) detector.delete();
            if (tmpKeypoints) tmpKeypoints.delete();
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

