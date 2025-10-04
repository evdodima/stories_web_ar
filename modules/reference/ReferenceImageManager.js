/**
 * Manages reference image loading and processing for multiple targets.
 * Supports both individual image uploads and pre-built database loading.
 */
class ReferenceImageManager {
    constructor() {
        this.ui = document.getElementById('statusMessage');
        this.targets = new Map();
        this.targetOrder = [];
        this.listeners = new Set();
        this.nextId = 1;
        this.databaseLoader = new DatabaseLoader();
        this.usingDatabase = false;
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
     * Load targets from pre-built database (database-only mode)
     * @param {string} databaseUrl - URL to database JSON file
     */
    async loadFromDatabase(databaseUrl = 'target_database.json') {
        this.updateStatus('Loading target database...');

        try {
            await this.databaseLoader.loadDatabase(databaseUrl);
            const runtimeTargets = this.databaseLoader.getAllRuntimeTargets();

            console.log(`Loading ${runtimeTargets.length} targets from database...`);

            for (const target of runtimeTargets) {
                this.targets.set(target.id, target);
                this.targetOrder.push(target.id);

                console.log(`Loaded target: ${target.id} (${target.numFeatures} features)`);
            }

            this.usingDatabase = true;
            this.updateStatus(`Loaded ${runtimeTargets.length} targets from database.`);
            this.notifyChange({ type: 'database_loaded', targets: this.getTargetSummaries() });

            return runtimeTargets;
        } catch (error) {
            console.error('Failed to load database:', error);
            this.updateStatus(`ERROR: Failed to load database: ${error.message}`);
            throw error;
        }
    }

    async loadDatabase() {
        // Database-only mode: load targets from pre-built database
        return await this.loadFromDatabase();
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
        this.notifyChange({ type: 'cleared', target: null });
    }

    cleanupTargetResources(target) {
        if (!target || !target.referenceData) return;

        const { keypoints, descriptors, image } = target.referenceData;
        if (keypoints) keypoints.delete();
        if (descriptors) descriptors.delete();
        if (image) image.delete();
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

