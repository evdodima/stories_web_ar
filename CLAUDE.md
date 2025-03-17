# WebAR Image Tracking Development Guide

## Commands
- **Run locally**: `python -m http.server` or `npx serve`
- **Open**: Navigate to `http://localhost:8000` in browser
- **Testing**: Use browser devtools for debugging (no automated tests)

## Code Style Guidelines
- **Formatting**: Clean, consistent indentation (2 spaces preferred)
- **Naming**: camelCase for variables/methods, PascalCase for classes
- **Error handling**: Use try/catch blocks, especially around OpenCV operations
- **Memory management**: Always delete OpenCV resources when done using them
- **Documentation**: JSDoc-style comments for classes and methods
- **Architecture**: Follow the modular design pattern with distinct classes for different responsibilities
- **Performance**: Minimize creating new OpenCV matrices; reuse when possible
- **Cleanup**: Set resources to null after deletion to prevent double-free
- **Optical flow**: Keep tracking points to a minimum (<30) for performance

## Project Organization
- OpenCV.js loaded from CDN
- Single-page application with HTML/CSS/JS
- Modular JavaScript structure with class-based organization
- No build process required - plain JavaScript