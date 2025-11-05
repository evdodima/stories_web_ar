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

Create a zip file with all images and videos in the root (no folders):

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

Upload the album to your cloud storage system and get an encoded album code.

### 2. Access the Application with Album Code

The app automatically downloads albums from cloud storage using an encoded URL parameter:

```
https://webar.stories-ar.com/?c=nRyZThA25blBk+AVSwZAEg==
```

The `c` parameter contains the encrypted album ID. The app will:
1. Send the encrypted code to the backend API (`https://pro.stories-ar.com`)
2. Backend decrypts and validates the code securely
3. Backend fetches the download URL from storage API
4. Frontend downloads and extracts the album automatically

### 3. Run the Application (Development)

```bash
# Using Python 3
python -m http.server

# Or using Node.js
npx serve
```

Navigate to `http://localhost:8000` in your browser.

### 4. Start Tracking

1. Allow camera access when prompted
2. Wait for the album to download and vocabulary tree to build (10-20 seconds)
3. Point your camera at one of the printed photos
4. Watch the corresponding video play on top of the image!

## How It Works

### Album Download & Loading

1. **URL Parsing**: Extracts encrypted album code from URL parameter
2. **Backend API Call**: Sends encrypted code to Rails backend (`POST /api/v1/albums/download`)
3. **Secure Processing**: Backend decrypts code, validates, and fetches pre-signed download URL
4. **Album Download**: Downloads the album zip file with progress tracking
5. **Zip Extraction**: Extracts images and videos from the downloaded archive
6. **Feature Detection**: Extracts BRISK features from each image (up to 500 per image)
7. **Vocabulary Building**: Clusters features into a vocabulary tree using k-means
8. **BoW & TF-IDF**: Computes Bag-of-Words and TF-IDF vectors for fast retrieval
9. **Video Mapping**: Associates each image with its corresponding video file

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

### Frontend
- **OpenCV.js**: Computer vision (BRISK, optical flow, homography)
- **Three.js**: WebGL rendering for video overlay
- **JSZip**: Zip file extraction in browser
- **Vanilla JavaScript**: No framework dependencies

### Backend
- **Ruby on Rails**: Backend API proxy for secure album downloads
- **AES Encryption**: Secure album code decryption on server
- **AWS S3**: Pre-signed URLs for secure file downloads

## Security Architecture

### How It Works

1. **Encrypted URL Codes**: Album IDs are encrypted on the backend before generating share URLs
2. **Backend Proxy**: Frontend never has access to encryption keys or storage API credentials
3. **Authorization via Code**: The encrypted code acts as a temporary "password" for that specific album
4. **Pre-signed URLs**: S3 URLs are time-limited and can only be used once
5. **No Frontend Secrets**: All sensitive keys (AES, API keys) remain on the backend server

### Flow

```
User URL with code → Frontend → Rails Backend → Storage API → S3 Download
                        ↓            ↓
                    No secrets   Has all keys
```

### Benefits

✅ **Secure**: API keys and encryption keys never exposed to users
✅ **Simple**: Users just need the encrypted URL to access their album
✅ **Controlled**: Backend can add rate limiting, logging, and access control
✅ **Auditable**: All album downloads go through backend for tracking

## Architecture

### Modules

```
modules/
├── database/
│   ├── VocabularyBuilder.js       # K-means clustering for vocabulary
│   ├── VocabularyTreeQuery.js     # Fast candidate selection
│   └── ZipDatabaseLoader.js       # Zip loading & database building
├── utils/
│   ├── AlbumManager.js            # Album code decryption & download
│   └── PerformanceProfiler.js     # Performance monitoring
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

- Album download: ~2-5 seconds (depending on network and album size)
- Zip extraction: ~1-2 seconds
- Feature extraction: ~0.5-1 second per image
- Vocabulary building: ~5-10 seconds (10 images)
- Total: ~10-20 seconds for typical album

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
- Verify the URL contains a valid `c` parameter with encoded album code
- Ensure network connection is stable for downloading
- Check that backend API (`https://pro.stories-ar.com`) is accessible
- Verify the album exists in cloud storage
- Check backend logs for decryption or API errors
- Ensure JSZip library loaded successfully

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

## Recent Updates

This branch includes:

1. **Secure Backend Proxy** - All sensitive operations moved to Rails backend
2. **Cloud Storage Integration** - Albums downloaded from S3 via pre-signed URLs
3. **URL Parameter Handling** - Automatic album loading from encrypted URL codes
4. **Backend API** - Rails endpoint (`/api/v1/albums/download`) handles decryption and authorization
5. **Zero Frontend Secrets** - No API keys or encryption keys exposed in frontend code
6. **Progress Tracking** - Real-time download and processing progress
7. **AlbumManager Module** - Simplified frontend module for album downloads

## Future Improvements

- [ ] Cache downloaded albums in IndexedDB for offline use
- [ ] Add drag & drop zip upload in UI for local testing
- [ ] Cache vocabulary tree in IndexedDB to speed up repeated loads
- [ ] Add album metadata (title, descriptions) in API response
- [ ] Support image-to-multiple-videos mapping
- [ ] Progressive loading for large albums
- [ ] Album editing and management UI
- [ ] Error recovery and retry logic for failed downloads

## License

MIT

## Credits

Built with OpenCV.js, Three.js, and JSZip.
