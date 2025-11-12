# WebAR Image Tracking Modules

This directory contains the modularized components of the WebAR Image Tracking system.

## Directory Structure

```
modules/
├── core/                 # Core application logic
│   └── ImageTracker.js   # Main application coordinator
├── ui/                   # User interface components
│   └── UIManager.js      # UI elements and interactions
├── camera/               # Camera management
│   └── CameraManager.js  # Camera access and video capture
├── reference/            # Reference image handling
│   └── ReferenceImageManager.js # Reference image loading and processing
├── detection/            # Feature detection
│   └── FeatureDetector.js # Feature detection and matching
├── tracking/             # Optical flow tracking
│   └── OpticalFlowTracker.js # Optical flow tracking between frames
├── visualization/        # Result visualization
│   └── Visualizer.js     # Visualization of tracking results
└── utils/                # Utility functions (if needed)
```

## Module Descriptions

### Core Module
- **ImageTracker**: The main application coordinator that orchestrates all other modules

### UI Module
- **UIManager**: Manages all user interface elements, event listeners, and status updates

### Camera Module
- **CameraManager**: Handles camera access, video stream management, and frame capture

### Reference Module
- **ReferenceImageManager**: Loads and processes reference images for feature extraction

### Detection Module
- **FeatureDetector**: Performs feature detection and matching using ORB algorithm and homography estimation

### Tracking Module
- **OpticalFlowTracker**: Implements Lucas-Kanade sparse optical flow for efficient frame-to-frame tracking

### Visualization Module
- **Visualizer**: Handles rendering of tracking results, keypoints, and optical flow points

## Usage

The main entry point remains `imageTracker.js` which imports the `ImageTracker` class from the core module. All functionality is preserved while providing better maintainability through modularization.

## Benefits of Modularization

1. **Better Maintainability**: Each module has a single responsibility
2. **Easier Testing**: Modules can be tested independently
3. **Better Code Organization**: Related functionality is grouped together
4. **Reusability**: Individual modules can be reused in other projects
5. **Reduced Coupling**: Modules have clear interfaces and dependencies

