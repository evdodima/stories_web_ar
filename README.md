# Stories Album - WebAR Image Tracking

A WebAR application that brings photo albums to life by playing videos when you point your camera at printed photos. Uses advanced computer vision with BRISK features and vocabulary tree matching for fast, robust tracking.

## Features

- **Album-Based Loading**: Load targets and videos from a single zip archive
- **Real-time Image Tracking**: Uses OpenCV BRISK features with vocabulary tree optimization
- **Optical Flow Tracking**: Smooth tracking between detections for better performance
- **Video Overlay**: Plays videos aligned to detected images using WebGL rendering
- **Multi-Target Support**: Track multiple images simultaneously with smart selection
- **Frontend Vocabulary Building**: Builds vocabulary tree dynamically in the browser
- **Mobile & Desktop**: Works on modern browsers with camera access

## Quick Start

### 1. Prepare Your Album

Create a zip file named `album.zip` with all images and videos in the root (no folders):

```
album.zip
├── photo500770.jpg
├── video500770.mp4
├── photo502377.jpg
├── video502377.mp4
├── photo1163826.jpg
├── video1163826.mp4
└── ...
```

**Filename Pattern**: Use `photoXXX.jpg` and `videoXXX.mp4` where `XXX` is the same number/ID.
- `photo500770.jpg` pairs with `video500770.mp4`
- `photo502377.jpg` pairs with `video502377.mp4`
- The code extracts the numeric ID to match them automatically

### 2. Place Album in Project Root

Put your `album.zip` file in the root directory of the project.

### 3. Run the Application

```bash
# Using Python 3
python -m http.server

# Or using Node.js
npx serve
```

Navigate to `http://localhost:8000` in your browser.

### 4. Start Tracking

1. Allow camera access when prompted
2. Wait for the album to load and vocabulary tree to build (5-15 seconds)
3. Point your camera at one of the printed photos
4. Watch the corresponding video play on top of the image!

## How It Works

### Image Target Loading

1. **Zip Extraction**: The app loads `album.zip` and extracts images and videos
2. **Feature Detection**: Extracts BRISK features from each image (up to 500 per image)
3. **Vocabulary Building**: Clusters features into a vocabulary tree using k-means
4. **BoW & TF-IDF**: Computes Bag-of-Words and TF-IDF vectors for fast retrieval
5. **Video Mapping**: Associates each image with its corresponding video file

### Real-Time Tracking

1. **Frame Processing**: Captures video frames from camera
2. **Vocabulary Query**: Quickly finds top candidate targets using TF-IDF similarity
3. **Feature Matching**: Matches BRISK features between frame and candidates
4. **Geometric Verification**: Uses RANSAC to verify matches and compute homography
5. **Optical Flow**: Tracks features between detections for smooth performance
6. **Video Rendering**: Projects video onto detected target using WebGL

## Album Preparation Tips

### Image Requirements

- **Resolution**: 800x600 to 2000x1500 pixels recommended
- **Features**: Use images with distinct features (textures, patterns, details)
- **Avoid**: Solid colors, repetitive patterns, very blurry images
- **Format**: JPEG, PNG, BMP, WebP supported

### Video Requirements

- **Format**: MP4 (H.264), WebM, OGV supported
- **Resolution**: 720p or 1080p recommended
- **Duration**: Any length (will loop automatically)
- **Filename**: Must match image filename exactly (except extension)

### Example Good Targets

- Family photos with varied clothing and background
- Artwork with textures and details
- Photos of nature scenes with foliage
- Group photos with multiple people
- Photos with text and graphics

### Example Poor Targets

- Solid color backgrounds
- Very blurry or low-contrast images
- Repetitive patterns (grids, wallpaper)
- Images with glare or reflections
- Very small or low-resolution images

## Configuration

### Vocabulary Tree Settings

Edit `modules/database/VocabularyBuilder.js` to adjust:

```javascript
{
  branchingFactor: 10,        // Vocabulary tree branching
  levels: 2,                  // Tree depth (words = k^levels)
  maxFeaturesPerTarget: 500   // Features per image
}
```

### Detection Settings

Adjust in the UI control panel:
- **Detection Interval**: How often to run full detection (frames)
- **Max Features**: Maximum feature points per frame
- **Optical Flow**: Enable/disable smooth tracking
- **Video Settings**: Mute, enable/disable overlay

## Technical Stack

- **OpenCV.js**: Computer vision (BRISK, optical flow, homography)
- **Three.js**: WebGL rendering for video overlay
- **JSZip**: Zip file extraction in browser
- **Vanilla JavaScript**: No framework dependencies

## Architecture

### Modules

```
modules/
├── database/
│   ├── VocabularyBuilder.js       # K-means clustering for vocabulary
│   ├── VocabularyTreeQuery.js     # Fast candidate selection
│   └── ZipDatabaseLoader.js       # Zip loading & database building
├── reference/
│   └── ReferenceImageManager.js   # Target lifecycle management
├── detection/
│   └── FeatureDetector.js         # BRISK matching with vocabulary
├── tracking/
│   └── OpticalFlowTracker.js      # Lucas-Kanade tracking
├── rendering/
│   ├── ARRenderer.js              # WebGL video projection
│   └── VideoManager.js            # Video element pooling
├── camera/
│   └── CameraManager.js           # Camera access & streaming
├── ui/
│   └── UIManager.js               # UI controls & status
└── core/
    ├── ImageTracker.js            # Main coordinator
    └── ViewportManager.js         # Viewport & orientation
```

## Performance

### Loading Time

- Zip extraction: ~1-2 seconds
- Feature extraction: ~0.5-1 second per image
- Vocabulary building: ~5-10 seconds (10 images)
- Total: ~5-15 seconds for typical album

### Runtime Performance

- Full detection: ~50-100ms per frame (with vocabulary query)
- Optical flow tracking: ~10-20ms per frame
- Video rendering: ~5-10ms per frame
- Target FPS: 15-30 (adaptive based on device)

## Browser Support

- Chrome/Edge: Recommended (best performance)
- Safari: Supported (iOS and macOS)
- Firefox: Supported
- Mobile browsers: Supported (requires camera permission)

## Troubleshooting

### Album Not Loading

- Check browser console for errors
- Verify `album.zip` is in project root
- Ensure zip structure matches expected format
- Check that JSZip library loaded successfully

### Tracking Not Working

- Ensure good lighting conditions
- Hold camera steady and at proper distance
- Verify printed image quality is good
- Check that camera permissions are granted
- Try images with more distinct features

### Poor Performance

- Reduce detection interval (UI setting)
- Lower max features count
- Use smaller images in album
- Disable optical flow visualization
- Close other browser tabs

### Videos Not Playing

- Verify video format is supported (MP4 H.264 recommended)
- Check video filenames match image filenames
- Look for console errors about video loading
- Ensure videos are not corrupted

## Development

### Adding New Features

1. Create new module in `modules/` directory
2. Add module to `imageTracker.js` script load order
3. Import and use in `ImageTracker` main class

### Debugging

- Enable optical flow visualization to see tracking points
- Use browser devtools console for detailed logs
- Check Performance profiling panel for bottlenecks
- Monitor status panel for real-time info

### Testing

- Test with variety of image types
- Test on different devices (mobile, tablet, desktop)
- Test under different lighting conditions
- Test with various album sizes (5-20 images)

## Differences from Main Branch

This branch (`feature/zip-based-targets`) introduces:

1. **Zip-based loading** instead of pre-built database JSON
2. **Frontend vocabulary building** using JavaScript k-means
3. **Automatic image-to-video pairing** by filename matching
4. **Removed DatabaseLoader.js** (replaced by ZipDatabaseLoader.js)
5. **Dynamic database generation** instead of offline Python script

## Future Improvements

- [ ] Add drag & drop zip upload in UI
- [ ] Support remote zip URLs
- [ ] Cache vocabulary tree in IndexedDB
- [ ] Add album metadata (title, descriptions)
- [ ] Support image-to-multiple-videos mapping
- [ ] Progressive loading for large albums
- [ ] Album editing and management UI

## License

MIT

## Credits

Built with OpenCV.js, Three.js, and JSZip.
