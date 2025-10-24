# Quick Start Guide - WebAR WASM Engine

## 5-Minute Setup (Without Building)

If you want to test without building from source, you can use pre-built OpenCV.js:

### 1. Install Dependencies

```bash
npm install
```

### 2. Temporary Setup (Without Building)

For quick testing, modify `CMakeLists.txt` to use OpenCV.js from CDN:

```cmake
# Use emscripten ports for OpenCV
set(EMSCRIPTEN_LINK_FLAGS
    ...
    "-s USE_OPENCV=1"  # Add this line
)
```

### 3. Build

```bash
npm run build:wasm
```

**Note**: This will download OpenCV automatically (takes a few minutes first time).

### 4. Run

```bash
npm run serve
```

Open `http://localhost:8000/index-wasm.html`

---

## Production Setup (Recommended)

For production with optimized binary size:

### 1. Install Emscripten

```bash
# Clone Emscripten
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk

# Install latest
./emsdk install latest
./emsdk activate latest

# Activate in current shell
source ./emsdk_env.sh

# Verify
emcc --version
```

Add to `~/.bashrc` or `~/.zshrc`:
```bash
source "$HOME/emsdk/emsdk_env.sh"
```

### 2. Build Minimal OpenCV

```bash
cd wasm
./setup-opencv.sh  # Creates this script below
```

**Create `wasm/setup-opencv.sh`:**

```bash
#!/bin/bash
set -e

echo "Building OpenCV for Emscripten..."

# Clone OpenCV
git clone --depth 1 --branch 4.8.0 https://github.com/opencv/opencv.git opencv-src
cd opencv-src
mkdir build && cd build

# Configure with minimal modules
emcmake cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=../../opencv \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_opencv_apps=OFF \
  -DBUILD_opencv_python=OFF \
  -DBUILD_opencv_python2=OFF \
  -DBUILD_opencv_python3=OFF \
  -DBUILD_EXAMPLES=OFF \
  -DBUILD_TESTS=OFF \
  -DBUILD_PERF_TESTS=OFF \
  -DBUILD_DOCS=OFF \
  -DWITH_PNG=OFF \
  -DWITH_JPEG=OFF \
  -DWITH_TIFF=OFF \
  -DWITH_WEBP=OFF \
  -DWITH_OPENJPEG=OFF \
  -DWITH_JASPER=OFF \
  -DWITH_OPENEXR=OFF \
  -DBUILD_LIST=core,imgproc,features2d,video,calib3d \
  -DCPU_BASELINE='' \
  -DCPU_DISPATCH='' \
  ..

# Build (use all CPU cores)
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Install
make install

cd ../..
rm -rf opencv-src

echo "OpenCV installed to: $(pwd)/opencv"
ls -lh opencv/lib/
```

Make executable:
```bash
chmod +x wasm/setup-opencv.sh
```

### 3. Build Engine

```bash
npm run build:wasm
```

### 4. Verify Output

```bash
npm run size
```

Should show:
```
webar_engine.wasm: ~2.5MB
webar_engine.js:   ~150KB
```

---

## Usage Example

### Minimal Example

```html
<!DOCTYPE html>
<html>
<head>
    <script src="js/ar-bridge.js"></script>
    <script src="js/camera-io.js"></script>
</head>
<body>
    <video id="video" autoplay></video>
    <canvas id="canvas"></canvas>

    <script>
        (async () => {
            // Initialize
            const bridge = new ARBridge();
            await bridge.initialize();

            const camera = new CameraIO();
            await camera.initialize(document.getElementById('video'));

            // Add test target (requires descriptors from database)
            // bridge.addTarget(...);

            // Start tracking
            bridge.startTracking();

            // Process loop
            function loop() {
                const frame = camera.captureFrameRaw();
                if (frame) {
                    const results = bridge.processFrame(
                        frame.data, frame.width, frame.height, 4
                    );
                    console.log('Detected:', results.length);
                }
                requestAnimationFrame(loop);
            }
            loop();
        })();
    </script>
</body>
</html>
```

---

## Creating Target Database

### Using Existing JS Tools

Your current codebase may have tools to extract features. If not:

```javascript
// Pseudo-code for offline target extraction
// Run this in Node.js with opencv4nodejs or similar

const cv = require('opencv4nodejs');
const fs = require('fs');

async function extractTarget(imagePath) {
    // Load image
    const img = cv.imread(imagePath);
    const gray = img.cvtColor(cv.COLOR_BGR2GRAY);

    // Detect BRISK features
    const detector = new cv.BRISKDetector();
    const keypoints = detector.detect(gray);
    const descriptors = detector.compute(gray, keypoints);

    // Get image corners
    const corners = [
        0, 0,
        gray.cols, 0,
        gray.cols, gray.rows,
        0, gray.rows
    ];

    return {
        id: path.basename(imagePath, '.jpg'),
        descriptors: {
            data: Array.from(descriptors.getData()),
            rows: descriptors.rows,
            cols: descriptors.cols
        },
        corners: corners
    };
}

// Extract all targets
const targets = await Promise.all([
    extractTarget('./targets/marker1.jpg'),
    extractTarget('./targets/marker2.jpg')
]);

// Save database
const database = {
    version: '2.0',
    created: new Date().toISOString(),
    targets: targets
};

fs.writeFileSync('target_database.json', JSON.stringify(database, null, 2));
```

---

## Debugging Tips

### 1. Check WASM Loading

```javascript
const bridge = new ARBridge();
bridge.initialize().then(() => {
    console.log('✓ WASM loaded');
    console.log('Memory:', bridge.getMemoryInfo());
}).catch(err => {
    console.error('✗ WASM failed:', err);
});
```

### 2. Enable Browser DevTools

Chrome/Edge:
- F12 → Sources → Enable source maps
- Check Console for errors
- Network tab: verify .wasm file loads (should be ~2.5MB)

### 3. Test Without Camera

```javascript
// Create test image data
const width = 640, height = 480;
const testData = new Uint8Array(width * height * 4);
testData.fill(128); // Gray image

const results = bridge.processFrame(testData, width, height, 4);
console.log('Process test:', results);
```

### 4. Performance Profiling

```javascript
let frameTimes = [];

function processLoop() {
    const start = performance.now();

    const frame = camera.captureFrameRaw();
    const results = bridge.processFrame(
        frame.data, frame.width, frame.height, 4
    );

    const elapsed = performance.now() - start;
    frameTimes.push(elapsed);

    if (frameTimes.length === 100) {
        const avg = frameTimes.reduce((a,b) => a+b) / frameTimes.length;
        console.log('Avg frame time:', avg.toFixed(2), 'ms');
        console.log('Avg FPS:', (1000/avg).toFixed(1));
        frameTimes = [];
    }

    requestAnimationFrame(processLoop);
}
```

---

## Common Issues

### "Module not found" error

**Cause**: WASM files not in correct location

**Fix**:
```bash
ls -la public/wasm/
# Should show:
# webar_engine.wasm
# webar_engine.js
```

### "Failed to compile" error

**Cause**: Missing OpenCV or Emscripten not activated

**Fix**:
```bash
source ~/emsdk/emsdk_env.sh
emcc --version  # Should show version, not error
```

### Slow first load

**Cause**: WASM compilation + OpenCV download

**Fix**: This is normal. Subsequent loads are cached. For production:
- Enable gzip compression on server
- Use CDN for static files
- Consider streaming compilation

### High memory usage

**Cause**: Multiple WASM heaps or memory leaks

**Fix**: Call `bridge.destroy()` when done:
```javascript
window.addEventListener('beforeunload', () => {
    bridge.destroy();
    camera.destroy();
});
```

---

## Next Steps

1. ✅ Build WASM engine
2. ✅ Test with camera
3. ✅ Load target database
4. ⬜ Integrate with Three.js renderer
5. ⬜ Add video overlays
6. ⬜ Deploy to production

See **WASM_README.md** for complete API documentation.

---

## Getting Help

**Build Issues**:
- Emscripten: https://emscripten.org/docs/compiling/Building-Projects.html
- OpenCV: https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html

**Runtime Issues**:
- Check browser console (F12)
- Enable verbose logging in ar-bridge.js
- Test with simple example first

**Performance Issues**:
- Reduce frame resolution
- Increase detection interval
- Lower maxFeatures setting

---

Built with ❤️ using C++, OpenCV, and WebAssembly
