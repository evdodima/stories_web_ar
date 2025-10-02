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
            if (this.tracker.referenceImage?.isLoaded()) {
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

        const file = event.target.files && event.target.files[0];
        if (file) {
            this.filePickerLabel.textContent = file.name;
            if (this.filePickerHint) {
                this.filePickerHint.textContent = `${Math.round(file.size / 1024)} KB`;
            }
        } else {
            this.filePickerLabel.textContent = 'Choose image';
            if (this.filePickerHint) {
                this.filePickerHint.textContent = 'JPG or PNG';
            }
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}

