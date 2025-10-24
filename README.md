# WebAR Image Tracking - WASM Edition

Production-ready WebAR image tracking with all computer vision in WebAssembly.

## 🚀 Quick Start (5 Minutes)

### 1. Activate Emscripten

```bash
source ~/emsdk/emsdk_env.sh
```

### 2. Build WASM Module

```bash
npm install
npm run build:wasm
```

**First build takes ~5 minutes** (downloads OpenCV automatically)
**Subsequent builds take ~30 seconds**

### 3. Run

```bash
npm run serve
```

Open: http://localhost:8000/index-wasm.html

---

## 📖 Documentation

- **New here?** → Read [BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md)
- **Need details?** → See [WASM_README.md](WASM_README.md)
- **Want architecture?** → Check [ARCHITECTURE.md](ARCHITECTURE.md)
- **API reference?** → [WASM_README.md](WASM_README.md#api-reference)

---

## 🛠️ Commands

```bash
# Build WASM module (uses pre-built OpenCV)
npm run build:wasm

# Build and serve
npm run dev

# Just serve (no build)
npm run serve

# Watch for changes and rebuild
npm run watch:wasm

# Clean build artifacts
npm run clean

# Check WASM file sizes
npm run size
```

---

## 📂 Project Structure

```
webar-app/
├── wasm/              # C++ WASM engine
├── js/                # JavaScript bridge
├── public/wasm/       # Built WASM output
├── index-wasm.html    # WASM version
└── BUILD_INSTRUCTIONS.md
```

---

## 🔧 Quick Troubleshooting

**"emcc not found"** → Run: `source ~/emsdk/emsdk_env.sh`
**Build fails** → Run: `npm run clean && npm run build:wasm`

See [BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md) for details.

---

**Status**: ✅ Ready to build!
