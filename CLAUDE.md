# WebAR Image Tracking Development Guide

## Commands
- **Run locally**: `python -m http.server` or `npx serve`
- **Open**: Navigate to `http://localhost:8000` in browser
- **Debug**: Use browser devtools console and Network tab to inspect operations
- **Testing**: Test on both desktop and mobile browsers; no automated tests
- **Reload**: Refresh browser after code changes (no hot reloading)

## Code Style Guidelines
- **Formatting**: 2 spaces indentation, max 80-100 characters per line
- **Naming**: camelCase for variables/methods, PascalCase for classes
- **Error handling**: Use try/catch/finally blocks around OpenCV operations
- **Memory management**: Always delete OpenCV resources with `resource.delete()`
- **Resource cleanup**: Set resources to null after deletion to prevent double-free
- **Documentation**: JSDoc-style comments for all classes and methods
- **Architecture**: Modular class-based design with single responsibilities
- **Performance**: Reuse OpenCV matrices when possible; minimize allocations
- **Optical flow**: Limit tracking points (<30) and feature detection frequency
- **Type safety**: Check for null/undefined and validate data before operations
- **Event handling**: Use proper event delegation and cleanup

## Project Organization
- **Structure**: OpenCV.js from CDN, single-page application with modular JS
- **Components**: ImageTracker (main), UIManager, CameraManager, OpticalFlowTracker
- **Features**: Image detection with BRISK, tracking with Lucas-Kanade optical flow
- **Files**: HTML (structure), CSS (styling), JS (logic), no build process