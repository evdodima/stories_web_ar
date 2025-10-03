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
            fileInput: this.fileInput,
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
        this.fileInput = byId('referenceImage');
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
        this.profileButton = byId('profileButton');
        this.profileResetButton = byId('profileResetButton');
        this.profileOutput = byId('profileOutput');

        this.filePicker = document.querySelector('.file-picker');
        this.filePickerLabel = document.querySelector('.file-picker__label');
        this.filePickerHint = document.querySelector('.file-picker__hint');
    }

    initializeInterfaceState() {
        const { state } = this.tracker;

        this.stopButton.disabled = true;
        this.startButton.disabled = false;
        this.fileInput.disabled = false;

        this.useOpticalFlowToggle.checked = state.useOpticalFlow;
        this.visualizeFlowPointsToggle.checked = state.visualizeFlowPoints;

        if (this.detectionIntervalSlider) {
            this.detectionIntervalSlider.value = state.detectionInterval;
            this.updateDetectionIntervalValue(state.detectionInterval);
        }

        if (this.maxFeaturesSlider) {
            this.maxFeaturesSlider.value = state.maxFeatures;
            this.updateMaxFeaturesValue(state.maxFeatures);
        }

        this.updateOpticalFlowBadge();
        this.updateFPS(0);
        this.updateTrackingMode('Waiting for reference image');
    }

    setupEventListeners(handlers) {
        const { onStartTracking, onStopTracking, onReferenceImageLoad } = handlers;

        this.startButton.addEventListener('click', () => {
            if (this.tracker.referenceManager?.hasTargets()) {
                onStartTracking();
            } else {
                this.updateStatus('Upload a reference image before starting.');
                this.highlightReferencePicker();
            }
        });

        this.stopButton.addEventListener('click', () => {
            onStopTracking();
            this.updateOpticalFlowBadge();
        });

        this.fileInput.addEventListener('change', (event) => {
            this.reflectReferenceSelection(event);
            onReferenceImageLoad(event);
            // Reset input so user can upload more files
            setTimeout(() => {
                event.target.value = '';
                this.resetFilePickerLabel();
            }, 1000);
        });

        this.useOpticalFlowToggle.addEventListener('change', () => {
            this.tracker.state.useOpticalFlow = this.useOpticalFlowToggle.checked;
            this.updateOpticalFlowBadge();
            this.updateTrackingMode();
        });

        this.visualizeFlowPointsToggle.addEventListener('change', () => {
            this.tracker.state.visualizeFlowPoints = this.visualizeFlowPointsToggle.checked;
        });

        this.detectionIntervalSlider.addEventListener('input', () => {
            const value = parseInt(this.detectionIntervalSlider.value, 10);
            this.tracker.state.detectionInterval = value;
            this.updateDetectionIntervalValue(value);
            this.updateTrackingMode();
        });

        this.maxFeaturesSlider.addEventListener('input', () => {
            const value = parseInt(this.maxFeaturesSlider.value, 10);
            this.tracker.state.maxFeatures = value;
            this.updateMaxFeaturesValue(value);
        });

        if (this.profileButton && this.tracker.profiler) {
            this.profileButton.addEventListener('click', () => {
                this.showProfileReport();
            });
        }

        if (this.profileResetButton && this.tracker.profiler) {
            this.profileResetButton.addEventListener('click', () => {
                this.tracker.profiler.reset();
                this.profileOutput.textContent = 'Metrics reset. Start tracking to collect new data.';
                console.log('Profiler metrics reset');
            });
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
        this.startButton.disabled = isTracking;
        this.stopButton.disabled = !isTracking;
        this.fileInput.disabled = isTracking;

        if (this.filePicker) {
            this.filePicker.classList.toggle('is-disabled', isTracking);
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
        this.statusMessage.textContent = message;
    }

    updateTrackingMode(forcedMessage = null) {
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

    updateTargetStatus(targets = []) {
        if (!this.targetStatusList) return;

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

            return `
                <div class="target-status-item">
                    ${thumbnail}
                    <div class="target-info">
                        <span class="target-name">${target.label}</span>
                        <span class="target-features">${target.featureCount} features</span>
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
}

// Make available globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}

