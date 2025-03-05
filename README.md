# WebAR Image Tracking

A custom WebAR image tracking solution built using OpenCV.js and Three.js. This application allows you to track images in real-time using your camera and overlay 3D content on top of them.

## Features

- Real-time image tracking using OpenCV's feature detection
- 3D object rendering with Three.js
- Camera access from any device with a browser
- No markers required - use any image as a reference
- Works on mobile and desktop browsers

## How It Works

1. Upload a reference image that you want to track
2. Point your camera at the printed version of the image
3. The app will detect the image in the real world and overlay a 3D cube on top of it
4. The 3D object will follow the image as you move your camera or the image

## Technical Details

This solution uses:

- **OpenCV.js** for image processing and feature detection
- **ORB** (Oriented FAST and Rotated BRIEF) feature detector for robust real-time tracking
- **Three.js** for 3D rendering
- **Homography Matrix** to calculate the transformation between the reference image and the camera view

## Requirements

- A modern web browser with WebGL and WebRTC support
- Camera access
- For best results, use images with many distinct features (avoid repetitive patterns or overly simple images)

## Getting Started

1. Clone this repository
2. Open `index.html` in a web server (cannot be run directly from the filesystem due to security restrictions)
3. Allow camera access when prompted
4. Upload a reference image
5. Click "Start Tracking"
6. Point your camera at a physical copy of the reference image

## Running Locally

You can use any local web server to run this project. For example:

```bash
# Using Python 3
python -m http.server

# Using Node.js
npx serve
```

Then navigate to `http://localhost:8000` (or whichever port your server uses).

## Customizing the 3D Object

Currently, the app displays a simple green cube as the 3D object. You can customize this by modifying the `initThreeJS()` method in `imageTracker.js`. Replace the cube with any 3D model of your choice, including:

- Custom 3D models (glTF, OBJ, etc.)
- Interactive animations
- UI elements or information cards

## Performance Considerations

- The image tracking algorithm is computationally intensive, especially on mobile devices
- For better performance, use smaller reference images with distinct features
- The app limits processing to approximately 30fps to reduce CPU usage
- Memory management is critical - all OpenCV objects are properly cleaned up after use

## Future Improvements

- Support for tracking multiple images simultaneously
- Add more complex 3D models and animations
- Implement marker-less tracking for specific surfaces
- Optimize for mobile performance
- Add support for ARCore/ARKit for improved tracking when available

## License

MIT