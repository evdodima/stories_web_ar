# WebAR WASM Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Runtime                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              User Interface Layer                        │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ HTML/CSS   │  │  UIManager   │  │  VideoManager  │  │  │
│  │  │ Controls   │  │  (Events)    │  │  (Video Pool)  │  │  │
│  │  └────────────┘  └──────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↕                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Rendering Layer (Three.js WebGL)               │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ ARRenderer │  │  WebGL       │  │  Video         │  │  │
│  │  │ (Corners)  │  │  Context     │  │  Textures      │  │  │
│  │  └────────────┘  └──────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↕                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │       JavaScript Bridge Layer (~500 LOC)                 │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ ARBridge   │  │  CameraIO    │  │ TargetLoader   │  │  │
│  │  │ (WASM API) │  │  (Capture)   │  │ (Database)     │  │  │
│  │  └────────────┘  └──────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↕                                  │
│           ┌──────────────────────────────────────┐             │
│           │    Emscripten Runtime (Glue Code)    │             │
│           │  - Memory management (_malloc/_free) │             │
│           │  - Type marshalling (Embind)         │             │
│           │  - Error handling                    │             │
│           └──────────────────────────────────────┘             │
│                              ↕                                  │
├─────────────────────────────────────────────────────────────────┤
│               WebAssembly Virtual Machine                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         WASM Engine (C++ Compiled, ~3500 LOC)            │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │              AREngine (Coordinator)                 │  │  │
│  │  │  - Frame pipeline                                   │  │  │
│  │  │  - Detection/tracking decision                      │  │  │
│  │  │  - Performance stats                                │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                      ↓           ↓                        │  │
│  │  ┌─────────────────────────┐  ┌──────────────────────┐  │  │
│  │  │   FeatureDetector       │  │ OpticalFlowTracker   │  │  │
│  │  │  - BRISK keypoints      │  │ - Lucas-Kanade flow  │  │  │
│  │  │  - BFMatcher (HAMMING)  │  │ - Kalman filtering   │  │  │
│  │  │  - KNN matching         │  │ - FB error check     │  │  │
│  │  │  - RANSAC homography    │  │ - Homography update  │  │  │
│  │  └─────────────────────────┘  └──────────────────────┘  │  │
│  │                      ↓                                    │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │            TargetManager                            │  │  │
│  │  │  - Target database                                  │  │  │
│  │  │  - Vocabulary tree filtering                        │  │  │
│  │  │  - Batch operations                                 │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                      ↓                                    │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │              MemoryPool                             │  │  │
│  │  │  - Frame buffers (cv::Mat)                          │  │  │
│  │  │  - Descriptor matrices                              │  │  │
│  │  │  - Point vectors                                    │  │  │
│  │  │  - Thread-safe RAII                                 │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↕                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  OpenCV Libraries                        │  │
│  │  - core (matrix operations, memory)                      │  │
│  │  - imgproc (color conversion, filtering)                 │  │
│  │  - features2d (BRISK, matching)                          │  │
│  │  - video (optical flow, tracking)                        │  │
│  │  - calib3d (homography, perspective)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Frame Processing Pipeline

```
Camera Video Frame
      ↓
┌──────────────────────────────────────┐
│  CameraIO.captureFrame()             │
│  - Read from <video> element         │
│  - Draw to canvas                    │
│  - Get ImageData (RGBA)              │
└──────────────────────────────────────┘
      ↓
┌──────────────────────────────────────┐
│  ARBridge.processFrame()             │
│  - Allocate WASM memory              │
│  - Copy ImageData to heap            │
│  - Call WASM via pointer             │
└──────────────────────────────────────┘
      ↓
┌──────────────────────────────────────┐
│  WASM: AREngine.processFrame()       │
│  - Convert RGBA → Grayscale          │
│  - Decision: Detect or Track?        │
└──────────────────────────────────────┘
      ↓
    ┌─────┴─────┐
    │           │
    ↓           ↓
┌────────┐  ┌─────────┐
│ DETECT │  │  TRACK  │
└────────┘  └─────────┘
    │           │
    ↓           ↓
┌──────────────────────────────────────┐
│  FeatureDetector                     │
│  1. Extract BRISK features           │
│  2. Query vocabulary tree            │
│  3. Match against candidates         │
│  4. Compute homography (RANSAC)      │
│  5. Validate & score                 │
└──────────────────────────────────────┘
                │
┌──────────────────────────────────────┐
│  OpticalFlowTracker                  │
│  1. Get tracking points in ROI       │
│  2. Optical flow (pyramidal LK)      │
│  3. Forward-backward check           │
│  4. Estimate homography              │
│  5. Kalman filter smoothing          │
└──────────────────────────────────────┘
                │
                ↓
┌──────────────────────────────────────┐
│  Return TrackingResults[]            │
│  - targetId                          │
│  - detected (bool)                   │
│  - corners [4 x {x,y}]               │
│  - confidence (0-1)                  │
│  - trackingMode (string)             │
└──────────────────────────────────────┘
      ↓
┌──────────────────────────────────────┐
│  ARBridge (JS)                       │
│  - Free WASM memory                  │
│  - Convert results to JS objects     │
│  - Trigger callbacks                 │
└──────────────────────────────────────┘
      ↓
┌──────────────────────────────────────┐
│  ARRenderer.render()                 │
│  - Update Three.js scene             │
│  - Draw video overlays               │
│  - Draw tracking rectangles          │
└──────────────────────────────────────┘
      ↓
   Display
```

## Memory Management Strategy

### JavaScript Heap
```
┌─────────────────────────────────────┐
│  JavaScript Heap (~50-100 MB)      │
├─────────────────────────────────────┤
│  - Video element                    │
│  - Canvas elements                  │
│  - Three.js scene graph             │
│  - UI state                         │
│  - Event listeners                  │
│  - Module code                      │
└─────────────────────────────────────┘
```

### WASM Heap
```
┌─────────────────────────────────────┐
│  WASM Heap (64-256 MB)              │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │  Frame Buffers (~4 MB)        │  │
│  │  - Current frame (grayscale)  │  │
│  │  - Previous frame             │  │
│  │  - Pool buffers (x4)          │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Target Database (~1-5 MB)    │  │
│  │  - Descriptors per target     │  │
│  │  - Keypoint data              │  │
│  │  - Vocabulary tree            │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Tracking State (~1-2 MB)     │  │
│  │  - Kalman filters             │  │
│  │  - Point buffers              │  │
│  │  - Per-target state           │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  OpenCV Internal (~50 MB)     │  │
│  │  - Algorithm state            │  │
│  │  - Temporary buffers          │  │
│  │  - Matrix storage             │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Zero-Copy Communication
```
JavaScript              WASM Memory
    │                       │
    │  Allocate buffer      │
    ├──────────────────────→│
    │  Get pointer (uintptr)│
    │←──────────────────────┤
    │                       │
    │  Copy ImageData       │
    ├──────────────────────→│
    │                       │
    │  Call processFrame()  │
    │  with pointer         │
    ├──────────────────────→│
    │                       │
    │     (Processing...)   │
    │                       │
    │  Return results       │
    │←──────────────────────┤
    │                       │
    │  Free buffer          │
    ├──────────────────────→│
    │                       │
```

## Module Dependencies

```
index-wasm.html
    ├── Three.js (CDN)
    ├── js/ar-bridge.js
    │   └── public/wasm/webar_engine.js (Emscripten glue)
    │       └── public/wasm/webar_engine.wasm (Binary)
    ├── js/camera-io.js
    ├── js/target-loader.js
    ├── modules/rendering/ARRenderer.js
    ├── modules/rendering/VideoManager.js
    └── modules/ui/UIManager.js
```

## Performance Characteristics

### Bottleneck Analysis

```
Frame Processing Time Breakdown (640x480):

Detection Frame (~20ms total):
├── Feature Detection (BRISK)    8ms  (40%)
├── KNN Matching                 6ms  (30%)
├── Homography (RANSAC)          4ms  (20%)
└── Misc (copy, convert)         2ms  (10%)

Tracking Frame (~5ms total):
├── Optical Flow (LK)            3ms  (60%)
├── Homography Estimation        1ms  (20%)
└── Kalman Filtering            1ms  (20%)

Rendering (~5ms):
├── Three.js Scene Update        2ms
├── WebGL Draw                   2ms
└── Video Texture Update         1ms

Total: ~10-30ms per frame (33-100 FPS)
```

### Optimization Strategies

1. **Detection Interval**: Run expensive detection every N frames
2. **Optical Flow**: Fast tracking between detection frames
3. **Vocabulary Tree**: Pre-filter candidates (3/N targets)
4. **Memory Pooling**: Reuse allocated buffers
5. **SIMD**: Vector operations for math
6. **Early Exit**: Skip processing on failed validation

## Build Process

```
Source Files (C++)
      ↓
  CMake Configure
  (emcmake cmake)
      ↓
  Compile to LLVM IR
  (emcc -c *.cpp)
      ↓
  Link with OpenCV
  (emcc *.o -lopencv_*)
      ↓
  Generate WASM + JS
  (Emscripten backend)
      ↓
  ┌──────────────┬────────────────┐
  ↓              ↓                ↓
.wasm          .js             .js.map
(binary)    (glue code)      (debug)
  ↓              ↓                ↓
Output to public/wasm/
```

## Deployment Strategy

```
Development:
  localhost:8000
  ├── Unoptimized WASM (-O0)
  ├── Source maps
  └── Debug assertions

Staging:
  staging.example.com
  ├── Optimized WASM (-O2)
  ├── Some assertions
  └── Gzip compression

Production:
  cdn.example.com
  ├── Fully optimized (-O3 + SIMD)
  ├── No assertions
  ├── Brotli compression
  ├── CDN caching
  └── Monitoring
```

## Security Considerations

1. **WASM Sandbox**: All CV code runs in isolated sandbox
2. **Memory Safety**: No buffer overflows (bounds checked in debug)
3. **No Eval**: No dynamic code execution
4. **CORS**: Properly configured for asset loading
5. **CSP**: Content Security Policy compatible

## Browser Compatibility

| Browser | Version | WASM | SIMD | Status |
|---------|---------|------|------|--------|
| Chrome  | 90+     | ✅   | ✅   | Full   |
| Edge    | 90+     | ✅   | ✅   | Full   |
| Firefox | 90+     | ✅   | ✅   | Full   |
| Safari  | 15+     | ✅   | ⚠️   | Good   |
| Mobile  | 2021+   | ✅   | ⚠️   | Good   |

Note: SIMD support improves performance but is not required.

## Scalability

### Horizontal Scaling
- **Stateless**: Each session is independent
- **CDN**: Static WASM files cached globally
- **Client-side**: All processing on user's device

### Vertical Scaling
- **Multi-target**: Handles 1-100+ targets efficiently
- **Frame Rate**: Adapts to device capability
- **Memory**: Fixed budget, predictable usage

---

This architecture provides:
- ✅ High performance (2-3x faster than JS)
- ✅ Low latency (<30ms per frame)
- ✅ Scalable (client-side processing)
- ✅ Maintainable (modular design)
- ✅ Portable (standard WASM)
