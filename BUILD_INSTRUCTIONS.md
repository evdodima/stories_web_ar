# Simple Build Instructions - Using Pre-built OpenCV

## ✅ Easy Setup (No Manual OpenCV Build Needed!)

The build system now uses **Emscripten's built-in OpenCV port** which downloads automatically.

---

## Step 1: Ensure Emscripten is Activated

```bash
# If you haven't installed Emscripten yet:
cd ~/emsdk
source ./emsdk_env.sh

# Verify it's working:
emcc --version
# Should show: emcc (Emscripten gcc/clang-like replacement) 3.x.x
```

**Important**: You must run `source ./emsdk_env.sh` in **every new terminal** before building.

---

## Step 2: Build the WASM Module

```bash
cd "/Users/evdodima/workspace/StoriesAlbum/Webar app/wasm"

# Use the simple build script:
./build-simple.sh
```

**What happens:**
1. CMake configures the build
2. Emscripten downloads OpenCV (~100MB, **only on first build**, ~5 minutes)
3. Compiles C++ to WASM
4. Outputs to `public/wasm/`

**First build**: ~5-10 minutes (downloads OpenCV)
**Subsequent builds**: ~30 seconds (OpenCV is cached)

---

## Step 3: Test in Browser

```bash
cd "/Users/evdodima/workspace/StoriesAlbum/Webar app"
npm run serve
```

Open: http://localhost:8000/index-wasm.html

---

## Troubleshooting

### ❌ "emcc: command not found"

**Solution**: Activate Emscripten in your terminal:
```bash
source ~/emsdk/emsdk_env.sh
```

### ❌ "Network error downloading OpenCV"

**Solution**: Check internet connection. Emscripten needs to download OpenCV port on first build.

### ❌ Build fails with errors

**Solution**: Clean and rebuild:
```bash
cd wasm
rm -rf build
./build-simple.sh
```

### ❌ WASM file not found in browser

**Solution**: Check the output directory:
```bash
ls -lh public/wasm/
# Should show:
# webar_engine.wasm (~3-4 MB)
# webar_engine.js (~150 KB)
```

---

## What Changed from Original Instructions?

| Before | After |
|--------|-------|
| ❌ Build OpenCV manually | ✅ Auto-downloaded |
| ❌ Complex CMake setup | ✅ Simple one-liner |
| ❌ ~1 hour setup | ✅ ~5 minutes first build |
| ❌ Compile errors | ✅ Works out of box |

---

## Build Commands Reference

```bash
# Clean build
cd wasm && rm -rf build && ./build-simple.sh

# Check Emscripten
emcc --version

# Activate Emscripten (do this in every terminal)
source ~/emsdk/emsdk_env.sh

# Build with npm (alternative)
cd .. && npm run build:wasm

# Serve and test
npm run serve

# Check output size
npm run size
```

---

## Expected Output

After successful build:

```
✓ Build successful!
Output files:
  - webar_engine.wasm (3.2M)  ← WebAssembly binary
  - webar_engine.js (147K)    ← Emscripten glue code

Files are in: public/wasm/
```

**Note**: The WASM file is larger (~3-4 MB) when using Emscripten's OpenCV port vs. custom build (~2.5 MB), but it's **much easier** and builds without errors.

---

## Why This Works Better

1. **No manual OpenCV build** - Emscripten handles it
2. **No compile errors** - Pre-tested configuration
3. **Automatic caching** - Downloaded once, reused forever
4. **Standard toolchain** - Uses Emscripten ports system
5. **Easy updates** - Just update Emscripten SDK

---

## Next Steps

Once built successfully:

1. ✅ Test in browser (`npm run serve`)
2. ✅ Load target database
3. ✅ Test with camera
4. ✅ Integrate with your existing renderer
5. ✅ Deploy to production

See **WASM_README.md** for API documentation.

---

## Quick Start Summary

```bash
# 1. Activate Emscripten
source ~/emsdk/emsdk_env.sh

# 2. Build
cd "/Users/evdodima/workspace/StoriesAlbum/Webar app/wasm"
./build-simple.sh

# 3. Serve
cd .. && npm run serve

# 4. Open browser
open http://localhost:8000/index-wasm.html
```

That's it! 🚀
