/**
 * WebAR Image Tracking Module - Main Entry Point
 * A modular system for detecting and tracking reference images in a video stream.
 * Features best-in-class optical flow tracking for robust performance.
 */

// Load all module scripts in order
(function() {
    const scripts = [
        './modules/utils/PerformanceProfiler.js',
        './modules/database/DatabaseLoader.js',
        './modules/database/VocabularyTreeQuery.js',
        './modules/ui/UIManager.js',
        './modules/camera/CameraManager.js',
        './modules/reference/ReferenceImageManager.js',
        './modules/detection/FeatureDetector.js',
        './modules/tracking/OpticalFlowTracker.js',
        './modules/rendering/VideoManager.js',
        './modules/core/ViewportManager.js',
        './modules/rendering/ARRenderer.js',
        './modules/core/ImageTracker.js'
    ];

    let loadedCount = 0;
    const totalScripts = scripts.length;

    function loadScript(index) {
        if (index >= scripts.length) {
            // All scripts loaded, initialize when DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeTracker);
            } else {
                initializeTracker();
            }
            return;
        }

        const script = document.createElement('script');
        script.src = scripts[index] + '?v=' + Date.now();
        script.onload = () => {
            loadedCount++;
            console.log(`Loaded ${scripts[index]} (${loadedCount}/${totalScripts})`);
            loadScript(index + 1); // Load next script
        };
        script.onerror = () => {
            console.error(`Failed to load script: ${scripts[index]}`);
        };
        document.head.appendChild(script);
    }

    function initializeTracker() {
        if (window.ImageTracker) {
            console.log('Initializing ImageTracker...');
            new window.ImageTracker();
        } else {
            console.error('ImageTracker not available after loading scripts');
        }
    }

    // Start loading scripts sequentially
    loadScript(0);
})();