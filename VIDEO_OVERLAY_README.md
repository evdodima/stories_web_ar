# Video Overlay Feature

## Overview
This WebAR application now supports streaming video overlays on tracked image targets, making photos "come to life" with AR video content.

## Architecture

### Clean Separation of Concerns
```
Image Tracking Engine (OpenCV-based)
    ↓ provides pose data (4 corner points, targetId)
Video AR Renderer (Three.js-based)
    ↓ renders video textures with perspective transforms
Camera Feed + Video Overlays
```

### Key Components

1. **VideoManager** (`modules/rendering/VideoManager.js`)
   - Video element pooling and lifecycle management
   - Automatic cleanup for lost targets (after 3s)
   - Memory-efficient video preloading
   - Mute/unmute controls

2. **VideoARRenderer** (`modules/rendering/VideoARRenderer.js`)
   - Three.js WebGL renderer for video overlays
   - Perspective-correct transforms from 4 corner points
   - Aspect-fit video scaling (letterbox/pillarbox)
   - Hardware-accelerated rendering

3. **Integration** (`modules/core/ImageTracker.js`)
   - Tracking engine passes corner points to renderer
   - Renderer updates video overlay positions each frame
   - Clean lifecycle management (start/stop/cleanup)

## Configuration

### Adding Videos to Targets

Videos are configured in `target_database.json`. Each target has a `videoUrl` field:

```json
{
  "targets": [
    {
      "id": "my-target",
      "videoUrl": "https://example.com/videos/my-video.mp4"
    }
  ]
}
```

**Supported Video Formats:**
- MP4 (H.264) - Recommended for best compatibility
- WebM (VP8/VP9) - Good for web optimization
- OGG - Fallback option

**Video Hosting Options:**
- Cloud storage (AWS S3, Google Cloud Storage, Azure Blob)
- CDN (Cloudflare, CloudFront, Fastly)
- Local server (for development)

### Example Video URLs

For testing, you can use:
- **Local videos**: `./videos/my-video.mp4`
- **Public URLs**: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`

## UI Controls

The application provides these video controls in the settings panel:

1. **Enable video overlay** (checkbox)
   - Toggle video overlays on/off
   - Default: ON

2. **Mute videos** (checkbox)
   - Mute/unmute all video audio
   - Default: MUTED

## Performance Considerations

### Optimization Features
- **Video pooling**: Reuses video elements for efficiency
- **Lazy loading**: Videos load only when target is first detected
- **Auto-cleanup**: Videos released 3 seconds after target lost
- **Hardware acceleration**: Uses CSS 3D transforms and WebGL
- **Target limit**: Maximum 2 simultaneous tracked targets

### Recommended Video Specs
- Resolution: 720p or 1080p (higher uses more bandwidth)
- Bitrate: 2-5 Mbps for good quality
- Duration: Keep loops short (5-15 seconds) for smooth experience
- Codec: H.264 with baseline profile for compatibility

## Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+ (iOS/macOS)
- ✅ Samsung Internet 14+

**Note**: Mobile browsers require user interaction before video playback (handled automatically on tracking start).

## Troubleshooting

### Videos Not Playing
1. Check browser console for errors
2. Verify video URL is accessible (CORS enabled)
3. Ensure video format is supported
4. Check if videos are muted (required for autoplay on mobile)

### Performance Issues
1. Reduce video resolution
2. Lower video bitrate
3. Use shorter video loops
4. Limit number of simultaneous targets

### CORS Issues
If hosting videos on separate domain, ensure CORS headers are set:
```
Access-Control-Allow-Origin: *
```

## Development

### Testing Locally
1. Place test videos in `./videos/` directory
2. Update `target_database.json` with local video paths
3. Run local server: `python -m http.server 8000`
4. Open `http://localhost:8000` in browser

### Adding New Targets
1. Use the vocabulary tree builder tool to add target images
2. Add `videoUrl` field to target in `target_database.json`
3. Reload application

## Future Enhancements

Potential improvements:
- Video playback controls (play/pause/seek)
- Multiple video formats per target (resolution adaptive)
- Video transitions and effects
- 3D model overlays (using Three.js)
- Audio spatialization based on target distance
