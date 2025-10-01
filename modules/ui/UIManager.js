/**
 * Manages the user interface elements and interactions
 */
class UIManager {
    constructor(tracker) {
        this.tracker = tracker;

        // DOM elements
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.startButton = document.getElementById('startTracking');
        this.stopButton = document.getElementById('stopTracking');
        this.fileInput = document.getElementById('referenceImage');
        this.statusMessage = document.getElementById('statusMessage');
        this.currentMode = document.getElementById('currentMode');
        this.useOpticalFlow = document.getElementById('useOpticalFlow');
        this.detectionInterval = document.getElementById('detectionInterval');
        this.intervalValue = document.getElementById('intervalValue');
        this.visualizeFlowPoints = document.getElementById('visualizeFlowPoints');
        this.maxFeatures = document.getElementById('maxFeatures');
        this.maxFeaturesValue = document.getElementById('maxFeaturesValue');

        // Initial UI state
        this.stopButton.disabled = true;
        this.useOpticalFlow.checked = tracker.state.useOpticalFlow;
        this.detectionInterval.value = tracker.state.detectionInterval;
        this.intervalValue.textContent = tracker.state.detectionInterval;
        this.visualizeFlowPoints.checked = tracker.state.visualizeFlowPoints;
        if (this.maxFeatures) {
            this.maxFeatures.value = tracker.state.maxFeatures;
            this.maxFeaturesValue.textContent = tracker.state.maxFeatures;
        }
        this.currentMode.textContent = 'Waiting for reference image';

        // Make elements accessible to other modules that need them
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

    setupEventListeners(handlers) {
        const { onStartTracking, onStopTracking, onReferenceImageLoad } = handlers;

        this.startButton.addEventListener('click', () => {
            if (this.tracker.referenceImage.isLoaded()) {
                onStartTracking();
            } else {
                this.updateStatus('Please upload a reference image first.');
            }
        });

        this.stopButton.addEventListener('click', onStopTracking);
        this.fileInput.addEventListener('change', onReferenceImageLoad);

        // Set up optical flow UI interactions
        this.useOpticalFlow.addEventListener('change', () => {
            this.tracker.state.useOpticalFlow = this.useOpticalFlow.checked;
            this.updateTrackingMode();
        });

        this.detectionInterval.addEventListener('input', () => {
            const value = parseInt(this.detectionInterval.value);
            this.tracker.state.detectionInterval = value;
            this.intervalValue.textContent = value;
        });

        // Set up visualization options
        this.visualizeFlowPoints.addEventListener('change', () => {
            this.tracker.state.visualizeFlowPoints = this.visualizeFlowPoints.checked;
        });

        // Set up max features slider
        if (this.maxFeatures) {
            this.maxFeatures.addEventListener('input', () => {
                const value = parseInt(this.maxFeatures.value);
                this.tracker.state.maxFeatures = value;
                this.maxFeaturesValue.textContent = value;
            });
        }
    }

    updateControlsForTracking(isTracking) {
        this.startButton.disabled = isTracking;
        this.stopButton.disabled = !isTracking;
        this.fileInput.disabled = isTracking;

        if (isTracking) {
            this.updateTrackingMode('Initializing tracking...');
        } else {
            this.updateTrackingMode('Tracking stopped');
        }
    }

    updateStatus(message) {
        this.statusMessage.textContent = message;
    }

    updateTrackingMode(forcedMessage = null) {
        if (forcedMessage) {
            this.currentMode.textContent = forcedMessage;
            return;
        }

        if (!this.tracker.state.isTracking) {
            this.currentMode.textContent = 'Tracking stopped';
            return;
        }

        // Show current tracking mode
        if (this.tracker.state.useOpticalFlow) {
            if (this.tracker.state.frameCount % this.tracker.state.detectionInterval === 0) {
                this.currentMode.textContent = 'Feature detection (periodic refresh)';
            } else {
                this.currentMode.textContent = `Optical flow (${this.tracker.state.detectionInterval - (this.tracker.state.frameCount % this.tracker.state.detectionInterval)} frames until refresh)`;
            }
        } else {
            this.currentMode.textContent = 'Feature detection only (optical flow disabled)';
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}

