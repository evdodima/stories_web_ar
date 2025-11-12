/**
 * Orchestrates the control panel UI, synchronising DOM elements with tracker state
 */
class UIManager {
    constructor(tracker) {
        this.tracker = tracker;

        this.cacheElements();
        this.initializeInterfaceState();

        // Expose commonly requested elements to other modules
        this.elements = {
            video: this.video,
            canvas: this.canvas,
            startButton: this.startButton,
            stopButton: this.stopButton,
            statusMessage: this.statusMessage,
            currentMode: this.currentMode
        };
    }

    cacheElements() {
        const byId = (id) => document.getElementById(id);

        this.video = byId('video');
        this.canvas = byId('output');
        this.startButton = byId('startTracking');
        this.stopButton = byId('stopTracking');
        this.statusMessage = byId('statusMessage');
        this.currentMode = byId('currentMode');
        this.useOpticalFlowToggle = byId('useOpticalFlow');
        this.visualizeFlowPointsToggle = byId('visualizeFlowPoints');
        this.detectionIntervalSlider = byId('detectionInterval');
        this.detectionIntervalValue = byId('intervalValue');
        this.maxFeaturesSlider = byId('maxFeatures');
        this.maxFeaturesValue = byId('maxFeaturesValue');
        this.opticalFlowBadge = byId('opticalFlowBadge');
        this.fpsValue = byId('fpsValue');
        this.targetStatusList = byId('targetStatusList');
        this.databaseInfo = byId('databaseInfo');
        this.profileButton = byId('profileButton');
        this.profileCopyButton = byId('profileCopyButton');
        this.profileResetButton = byId('profileResetButton');
        this.profileOutput = byId('profileOutput');

        // New fullscreen UI elements
        this.loadingScreen = byId('loadingScreen');
        this.loadingSpinner = byId('loadingSpinner');
        this.loadingErrorIcon = byId('loadingErrorIcon');
        this.loadingProgressBar = byId('loadingProgressBar');
        this.loadingProgressText = byId('loadingProgressText');
        this.menuToggle = byId('menuToggle');
        this.controlPanel = byId('controlPanel');
        this.closePanel = byId('closePanel');
        this.targetInfo = byId('targetInfo');

        // Video overlay controls
        this.showTrackingRectsToggle = byId('showTrackingRects');
        this.enableVideoOverlayToggle = byId('enableVideoOverlay');
        this.muteVideosToggle = byId('muteVideos');
    }

    initializeInterfaceState() {
        const { state } = this.tracker;

        if (this.stopButton) {
            this.stopButton.disabled = true;
        }
        if (this.startButton) {
            this.startButton.disabled = false;
        }

        if (this.useOpticalFlowToggle) {
            this.useOpticalFlowToggle.checked = state.useOpticalFlow;
        }
        if (this.visualizeFlowPointsToggle) {
            this.visualizeFlowPointsToggle.checked = state.visualizeFlowPoints;
        }

        if (this.detectionIntervalSlider) {
            this.detectionIntervalSlider.value = state.detectionInterval;
            this.updateDetectionIntervalValue(state.detectionInterval);
        }

        if (this.maxFeaturesSlider) {
            this.maxFeaturesSlider.value = state.maxFeatures;
            this.updateMaxFeaturesValue(state.maxFeatures);
        }

        if (this.opticalFlowBadge) {
            this.updateOpticalFlowBadge();
        }
        this.updateFPS(0);
        this.updateTrackingMode('Waiting for reference image');
    }

    setupEventListeners(handlers) {
        const { onStartTracking, onStopTracking, onShowTrackingRects, onVideoOverlayToggle, onMuteVideos } = handlers;

        if (this.startButton) {
            this.startButton.addEventListener('click', () => {
                if (this.tracker.referenceManager?.hasTargets()) {
                    onStartTracking();
                } else {
                    this.updateStatus('ERROR: Database not loaded. Check console.');
                }
            });
        }

        if (this.stopButton) {
            this.stopButton.addEventListener('click', () => {
                onStopTracking();
                this.updateOpticalFlowBadge();
            });
        }

        if (this.useOpticalFlowToggle) {
            this.useOpticalFlowToggle.addEventListener('change', () => {
                this.tracker.state.useOpticalFlow = this.useOpticalFlowToggle.checked;
                this.updateOpticalFlowBadge();
                this.updateTrackingMode();
            });
        }

        if (this.visualizeFlowPointsToggle) {
            this.visualizeFlowPointsToggle.addEventListener('change', () => {
                this.tracker.state.visualizeFlowPoints = this.visualizeFlowPointsToggle.checked;
            });
        }

        if (this.detectionIntervalSlider) {
            this.detectionIntervalSlider.addEventListener('input', () => {
                const value = parseInt(this.detectionIntervalSlider.value, 10);
                this.tracker.state.detectionInterval = value;
                this.updateDetectionIntervalValue(value);
                this.updateTrackingMode();
            });
        }

        if (this.maxFeaturesSlider) {
            this.maxFeaturesSlider.addEventListener('input', () => {
                const value = parseInt(this.maxFeaturesSlider.value, 10);
                this.tracker.state.maxFeatures = value;
                this.updateMaxFeaturesValue(value);
            });
        }

        if (this.profileButton && this.tracker.profiler) {
            this.profileButton.addEventListener('click', () => {
                this.showProfileReport();
            });
        }

        if (this.profileCopyButton && this.tracker.profiler) {
            this.profileCopyButton.addEventListener('click', async () => {
                try {
                    const report = this.tracker.profiler.getReport();
                    await navigator.clipboard.writeText(report);

                    // Visual feedback
                    const originalText = this.profileCopyButton.textContent;
                    this.profileCopyButton.textContent = 'Copied!';
                    this.profileCopyButton.style.color = '#4ade80';

                    setTimeout(() => {
                        this.profileCopyButton.textContent = originalText;
                        this.profileCopyButton.style.color = '';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy profile stats:', err);
                    this.profileCopyButton.textContent = 'Copy failed';
                    setTimeout(() => {
                        this.profileCopyButton.textContent = 'Copy stats';
                    }, 2000);
                }
            });
        }

        if (this.profileResetButton && this.tracker.profiler) {
            this.profileResetButton.addEventListener('click', () => {
                this.tracker.profiler.reset();
                this.profileOutput.textContent = 'Metrics reset. Start tracking to collect new data.';
                console.log('Profiler metrics reset');
            });
        }

        // New fullscreen UI event listeners
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', () => {
                this.controlPanel.classList.add('open');
            });
        }

        if (this.closePanel) {
            this.closePanel.addEventListener('click', () => {
                this.controlPanel.classList.remove('open');
            });
        }

        // Video overlay controls
        if (this.showTrackingRectsToggle && onShowTrackingRects) {
            this.showTrackingRectsToggle.addEventListener('change', () => {
                onShowTrackingRects(this.showTrackingRectsToggle.checked);
            });
        }

        if (this.enableVideoOverlayToggle && onVideoOverlayToggle) {
            this.enableVideoOverlayToggle.addEventListener('change', () => {
                onVideoOverlayToggle(this.enableVideoOverlayToggle.checked);
            });
        }

        if (this.muteVideosToggle && onMuteVideos) {
            this.muteVideosToggle.addEventListener('change', () => {
                onMuteVideos(this.muteVideosToggle.checked);
            });
        }

        // Menu item event listeners
        const faqBtn = document.getElementById('faqBtn');
        if (faqBtn) {
            faqBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open('https://stories-ar.com/faq', '_blank');
            });
        }

        const clearCacheBtn = document.getElementById('clearCacheBtn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Clear all cached photos? This action cannot be undone.')) {
                    try {
                        // Hard clear: Close all open IndexedDB connections first
                        // This is safe because we're reloading anyway
                        await this.hardClearCache();

                        alert('Cache cleared successfully! The page will now reload.');
                        // Force reload - the browser will clean up any remaining connections
                        window.location.reload();
                    } catch (err) {
                        console.error('Failed to clear cache:', err);
                        // Even if there's an error, reload anyway since page will restart
                        alert('Cache clear attempted. The page will now reload.');
                        window.location.reload();
                    }
                }
            });
        }

        const supportBtn = document.getElementById('supportBtn');
        if (supportBtn) {
            supportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open('mailto:support@stories-ar.com', '_blank');
            });
        }

        const learnMoreBtn = document.getElementById('learnMoreBtn');
        if (learnMoreBtn) {
            learnMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open('https://stories-ar.com', '_blank');
            });
        }

        const exportDebugBtn = document.getElementById('exportDebugBtn');
        if (exportDebugBtn) {
            exportDebugBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                this.handleDebugExport();
            });
        }
    }

    async handleDebugExport() {
        if (!this.tracker.debugExporter) {
            alert('Debug exporter not initialized');
            return;
        }

        const exportDebugBtn = document.getElementById('exportDebugBtn');
        const originalLabel = exportDebugBtn?.querySelector('.menu-item-label');
        const originalText = originalLabel?.textContent;

        try {
            // Show export options to user
            const choice = await this.showDebugExportDialog();

            if (choice === 'cancel') {
                return;
            }

            // Update button to show progress
            if (originalLabel) {
                originalLabel.textContent = 'Exporting...';
            }

            let success = false;
            let message = '';

            if (choice === 'copy') {
                success = await this.tracker.debugExporter.copyToClipboard();
                message = success
                    ? 'Debug data copied to clipboard!'
                    : 'Failed to copy. Try download instead.';
            } else if (choice === 'text') {
                const filename = this.tracker.debugExporter.downloadText();
                success = true;
                message = `Downloaded: ${filename}`;
            } else if (choice === 'json') {
                const filename = this.tracker.debugExporter.downloadJSON();
                success = true;
                message = `Downloaded: ${filename}`;
            }

            // Show success/error message
            if (originalLabel) {
                originalLabel.textContent = success ? 'Success!' : 'Failed';
                setTimeout(() => {
                    if (originalLabel) {
                        originalLabel.textContent = originalText;
                    }
                }, 2000);
            }

            if (success) {
                console.log('[DebugExport] ' + message);
            } else {
                console.error('[DebugExport] ' + message);
            }

        } catch (err) {
            console.error('Debug export error:', err);
            if (originalLabel) {
                originalLabel.textContent = 'Error';
                setTimeout(() => {
                    if (originalLabel) {
                        originalLabel.textContent = originalText;
                    }
                }, 2000);
            }
            alert('Failed to export debug data. Check console for details.');
        }
    }

    showDebugExportDialog() {
        return new Promise((resolve) => {
            // Create a simple modal dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 20px;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                width: 100%;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            `;

            content.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: #1a1a1a;
                           font-size: 20px; font-weight: 600;">
                    Export Debug Data
                </h3>
                <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
                    Choose how to export logs and profiling data:
                </p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button id="debugCopyBtn" style="padding: 12px;
                        background: #3b82f6; color: white; border: none;
                        border-radius: 8px; cursor: pointer; font-size: 15px;
                        font-weight: 500;">
                        Copy to Clipboard
                    </button>
                    <button id="debugTextBtn" style="padding: 12px;
                        background: #10b981; color: white; border: none;
                        border-radius: 8px; cursor: pointer; font-size: 15px;
                        font-weight: 500;">
                        Download as Text
                    </button>
                    <button id="debugJsonBtn" style="padding: 12px;
                        background: #8b5cf6; color: white; border: none;
                        border-radius: 8px; cursor: pointer; font-size: 15px;
                        font-weight: 500;">
                        Download as JSON
                    </button>
                    <button id="debugCancelBtn" style="padding: 12px;
                        background: #f3f4f6; color: #1a1a1a; border: none;
                        border-radius: 8px; cursor: pointer; font-size: 15px;
                        font-weight: 500;">
                        Cancel
                    </button>
                </div>
            `;

            dialog.appendChild(content);
            document.body.appendChild(dialog);

            const cleanup = () => {
                document.body.removeChild(dialog);
            };

            document.getElementById('debugCopyBtn').onclick = () => {
                cleanup();
                resolve('copy');
            };

            document.getElementById('debugTextBtn').onclick = () => {
                cleanup();
                resolve('text');
            };

            document.getElementById('debugJsonBtn').onclick = () => {
                cleanup();
                resolve('json');
            };

            document.getElementById('debugCancelBtn').onclick = () => {
                cleanup();
                resolve('cancel');
            };

            dialog.onclick = (e) => {
                if (e.target === dialog) {
                    cleanup();
                    resolve('cancel');
                }
            };
        });
    }

    hideLoadingScreen() {
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                this.loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    updateLoadingProgress(percent, message) {
        if (this.loadingProgressBar) {
            const clamped = Math.max(0, Math.min(100, Math.round(percent)));
            this.loadingProgressBar.style.width = clamped + '%';
        }
        if (this.loadingProgressText && message) {
            this.loadingProgressText.textContent = message;
        }
    }

    showError(message) {
        // Ensure loading screen is visible and not hidden
        if (this.loadingScreen) {
            this.loadingScreen.classList.remove('hidden');
            this.loadingScreen.style.display = 'flex';
        }

        // Toggle spinner vs. error icon
        if (this.loadingSpinner) {
            this.loadingSpinner.style.display = 'none';
        }
        if (this.loadingErrorIcon) {
            this.loadingErrorIcon.style.display = 'block';
        }

        // Make progress bar appear full and styled as error if possible
        if (this.loadingProgressBar) {
            this.loadingProgressBar.style.width = '100%';
            this.loadingProgressBar.classList.add('error');
        }

        // Update both loading text and status panel
        if (this.loadingProgressText) {
            this.loadingProgressText.textContent = `Error: ${message}`;
        }

        this.updateStatus(`ERROR: ${message}`);
    }

    showTargetInfo(label) {
        if (this.targetInfo) {
            this.targetInfo.textContent = `Tracking: ${label}`;
            this.targetInfo.classList.add('visible');
        }
    }

    hideTargetInfo() {
        if (this.targetInfo) {
            this.targetInfo.classList.remove('visible');
        }
    }

    showProfileReport() {
        if (!this.tracker.profiler || !this.profileOutput) return;

        const report = this.tracker.profiler.getReport();
        this.profileOutput.textContent = report;
        this.profileOutput.style.display = 'block';
        console.log(report);
    }

    updateControlsForTracking(isTracking) {
        if (this.startButton) {
            this.startButton.disabled = isTracking;
        }
        if (this.stopButton) {
            this.stopButton.disabled = !isTracking;
        }

        if (isTracking) {
            this.updateTrackingMode('Initialising tracking...');
            this.updateStatus('Tracking in progress. Hold the target steady.');
        } else {
            this.updateTrackingMode('Tracking idle');
            this.updateFPS(0);
        }

        this.updateOpticalFlowBadge();
    }

    updateStatus(message) {
        if (this.statusMessage) {
            this.statusMessage.textContent = message;
        }
    }

    updateTrackingMode(forcedMessage = null) {
        if (!this.currentMode) return;

        if (forcedMessage) {
            this.currentMode.textContent = forcedMessage;
            return;
        }

        const { state } = this.tracker;

        if (!state.isTracking) {
            this.currentMode.textContent = 'Tracking idle';
            return;
        }

        if (!state.useOpticalFlow) {
            this.currentMode.textContent = 'Feature detection (optical flow off)';
            return;
        }

        const interval = state.detectionInterval || 1;
        const framesSinceDetection = state.frameCount % interval;

        if (framesSinceDetection === 0) {
            this.currentMode.textContent = 'Full detection refresh';
        } else {
            const remaining = interval - framesSinceDetection;
            this.currentMode.textContent = `Optical flow · refresh in ${remaining} frame${remaining === 1 ? '' : 's'}`;
        }
    }

    updateOpticalFlowBadge() {
        if (!this.opticalFlowBadge) return;

        const { useOpticalFlow, isTracking } = this.tracker.state;

        this.opticalFlowBadge.className = 'badge';

        if (!useOpticalFlow) {
            this.opticalFlowBadge.textContent = 'Off';
            this.opticalFlowBadge.classList.add('badge-warning');
            return;
        }

        if (isTracking) {
            this.opticalFlowBadge.textContent = 'Active';
            this.opticalFlowBadge.classList.add('badge-positive');
        } else {
            this.opticalFlowBadge.textContent = 'Armed';
            this.opticalFlowBadge.classList.add('badge-muted');
        }
    }

    updateDetectionIntervalValue(value) {
        if (this.detectionIntervalValue) {
            this.detectionIntervalValue.textContent = value;
        }
    }

    updateMaxFeaturesValue(value) {
        if (this.maxFeaturesValue) {
            this.maxFeaturesValue.textContent = value;
        }
    }

    updateFPS(fpsValue) {
        if (!this.fpsValue) return;

        if (!Number.isFinite(fpsValue) || fpsValue <= 0) {
            this.fpsValue.textContent = '0 fps';
            return;
        }

        const rounded = Math.round(fpsValue);
        this.fpsValue.textContent = `${rounded} fps`;
    }

    highlightReferencePicker() {
        if (!this.filePicker) return;

        this.filePicker.classList.add('request-attention');

        setTimeout(() => {
            this.filePicker.classList.remove('request-attention');
        }, 800);
    }

    reflectReferenceSelection(event) {
        if (!this.filePicker || !this.filePickerLabel) return;

        const files = event.target.files;
        if (files && files.length > 0) {
            if (files.length === 1) {
                this.filePickerLabel.textContent = `Adding: ${files[0].name}`;
                if (this.filePickerHint) {
                    this.filePickerHint.textContent = `${Math.round(files[0].size / 1024)} KB`;
                }
            } else {
                this.filePickerLabel.textContent = `Adding ${files.length} images...`;
                const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);
                if (this.filePickerHint) {
                    this.filePickerHint.textContent = `${Math.round(totalSize / 1024)} KB total`;
                }
            }
        }
    }

    resetFilePickerLabel() {
        if (!this.filePickerLabel) return;

        this.filePickerLabel.textContent = 'Add more targets';
        if (this.filePickerHint) {
            this.filePickerHint.textContent = 'Select one or multiple images';
        }
    }

    updateDatabaseInfo(info) {
        if (!this.databaseInfo) return;

        if (!info || !info.loaded) {
            this.databaseInfo.textContent = 'Individual images';
            return;
        }

        const text = `Loaded: ${info.targets} targets, ${info.vocabSize} words`;
        this.databaseInfo.textContent = text;
    }

    updateTargetStatus(targets = []) {
        if (!this.targetStatusList) return;

        // Update database info if using database
        if (this.tracker.referenceManager.usingDatabase) {
            const loader = this.tracker.referenceManager.databaseLoader;
            if (loader && loader.isReady()) {
                const metadata = loader.getMetadata();
                this.updateDatabaseInfo({
                    loaded: true,
                    targets: metadata.num_targets,
                    vocabSize: metadata.vocabulary_size
                });
            }
        } else {
            this.updateDatabaseInfo({ loaded: false });
        }

        if (targets.length === 0) {
            this.targetStatusList.innerHTML = '<span class="target-status-empty">No targets loaded</span>';
            return;
        }

        const targetItems = targets.map(target => {
            const status = target.runtime?.status || 'idle';
            const statusClass = status === 'tracked' ? 'badge-positive' :
                               status === 'lost' ? 'badge-warning' : 'badge-muted';

            const thumbnail = target.thumbnailUrl
                ? `<img src="${target.thumbnailUrl}" class="target-thumbnail" alt="${target.label}">`
                : '';

            const featureCount = target.featureCount || target.numFeatures || 0;

            return `
                <div class="target-status-item">
                    ${thumbnail}
                    <div class="target-info">
                        <span class="target-name">${target.label || target.id}</span>
                        <span class="target-features">${featureCount} features</span>
                    </div>
                    <span class="badge ${statusClass}">${status}</span>
                    <button class="target-remove-btn" data-target-id="${target.id}" title="Remove target">×</button>
                </div>
            `;
        }).join('');

        this.targetStatusList.innerHTML = targetItems;

        // Add event listeners for remove buttons
        this.targetStatusList.querySelectorAll('.target-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.dataset.targetId;
                this.tracker.referenceManager.removeTarget(targetId);
            });
        });
    }

    /**
     * Hard clear all caches - aggressively closes connections and clears all storage
     * Safe to use since page will reload immediately after
     */
    async hardClearCache() {
        console.log('[UIManager] Starting hard cache clear...');

        // Step 1: Clear CacheManager database if available
        // This will clear all stores (even if deletion is blocked later)
        try {
            if (window.CacheManager) {
                const cacheManager = new window.CacheManager();
                // Clear all stores - this clears data even if database can't be deleted
                await Promise.race([
                    cacheManager.clearAll(),
                    new Promise(resolve => setTimeout(resolve, 500)) // Max 500ms wait
                ]);
                // Close the database connection we just opened
                if (cacheManager.db) {
                    cacheManager.db.close();
                }
                console.log('[UIManager] Cleared CacheManager database stores');
            }
        } catch (err) {
            console.warn('[UIManager] Error clearing CacheManager:', err);
            // Continue anyway - we'll delete the database directly
        }

        // Step 2: Delete all IndexedDB databases
        // Since page reloads, blocked deletions will be cleaned up automatically
        try {
            if (indexedDB && indexedDB.databases) {
                const databases = await indexedDB.databases();
                console.log(`[UIManager] Attempting to delete ${databases.length} databases...`);
                
                // Delete each database - handle blocked deletions gracefully
                // We don't wait for completion since reload will handle cleanup
                for (const db of databases) {
                    try {
                        const deleteReq = indexedDB.deleteDatabase(db.name);
                        // Set up handlers but don't block on them
                        deleteReq.onsuccess = () => {
                            console.log(`[UIManager] Successfully deleted database: ${db.name}`);
                        };
                        deleteReq.onerror = () => {
                            console.warn(`[UIManager] Failed to delete database: ${db.name}`, deleteReq.error);
                        };
                        deleteReq.onblocked = () => {
                            console.warn(`[UIManager] Database deletion blocked: ${db.name} (will be cleaned on reload)`);
                            // Blocked deletions are fine - page reload will close connections
                        };
                    } catch (err) {
                        console.warn(`[UIManager] Error initiating delete for ${db.name}:`, err);
                    }
                }
                
                // Give deletions a moment to start, but don't wait for completion
                // The page reload will ensure cleanup happens
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                // Fallback for browsers that don't support indexedDB.databases()
                // Try to delete known database names
                const knownDatabases = ['WebarAlbumCache'];
                for (const dbName of knownDatabases) {
                    try {
                        indexedDB.deleteDatabase(dbName);
                    } catch (err) {
                        console.warn(`[UIManager] Could not delete database ${dbName}:`, err);
                    }
                }
            }
        } catch (err) {
            console.warn('[UIManager] Error during IndexedDB cleanup:', err);
            // Continue anyway - reload will handle it
        }

        // Step 3: Clear localStorage
        try {
            localStorage.clear();
            console.log('[UIManager] Cleared localStorage');
        } catch (err) {
            console.warn('[UIManager] Error clearing localStorage:', err);
        }

        // Step 4: Clear sessionStorage
        try {
            sessionStorage.clear();
            console.log('[UIManager] Cleared sessionStorage');
        } catch (err) {
            console.warn('[UIManager] Error clearing sessionStorage:', err);
        }

        // Step 5: Clear Cache API (if available)
        try {
            if ('caches' in window && caches.keys) {
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames.map(cacheName => {
                        console.log(`[UIManager] Deleting cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    })
                );
                console.log('[UIManager] Cleared Cache API');
            }
        } catch (err) {
            console.warn('[UIManager] Error clearing Cache API:', err);
        }

        console.log('[UIManager] Hard cache clear completed - page will reload');
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}

