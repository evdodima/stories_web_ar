/**
 * Emscripten Embind API - JavaScript Interface
 * Exposes WebAR engine to JavaScript with efficient memory management
 */

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <emscripten.h>
#include "ar_engine.hpp"

using namespace emscripten;
using namespace webar;

// Global engine instance (singleton)
static std::unique_ptr<AREngine> g_engine;

/**
 * Initialize the AR engine
 */
void initEngine() {
  if (!g_engine) {
    g_engine = std::make_unique<AREngine>();
  }
}

/**
 * Set engine configuration
 */
void setEngineConfig(
    bool useOpticalFlow,
    int detectionInterval,
    int maxFeatures,
    int maxTrackingPoints,
    float matchRatioThreshold) {

  if (!g_engine) {
    initEngine();
  }

  EngineConfig config;
  config.useOpticalFlow = useOpticalFlow;
  config.detectionInterval = detectionInterval;
  config.maxFeatures = maxFeatures;
  config.maxTrackingPoints = maxTrackingPoints;
  config.matchRatioThreshold = matchRatioThreshold;

  g_engine->setConfig(config);
}

/**
 * Add a target to the database
 * @param id Target identifier
 * @param descriptorsPtr Pointer to descriptor data (rows * cols bytes)
 * @param descriptorRows Number of rows in descriptor matrix
 * @param descriptorCols Number of columns in descriptor matrix
 * @param corners Array of 8 floats [x0,y0, x1,y1, x2,y2, x3,y3]
 */
bool addTarget(
    const std::string& id,
    uintptr_t descriptorsPtr,
    int descriptorRows,
    int descriptorCols,
    val cornersArray) {

  if (!g_engine) {
    initEngine();
  }

  // Create cv::Mat from memory pointer (no copy)
  cv::Mat descriptors(descriptorRows, descriptorCols, CV_8U,
                     reinterpret_cast<void*>(descriptorsPtr));

  // Extract corners from JavaScript array
  std::vector<cv::Point2f> corners;
  corners.reserve(4);

  for (int i = 0; i < 4; ++i) {
    float x = cornersArray[i * 2].as<float>();
    float y = cornersArray[i * 2 + 1].as<float>();
    corners.push_back(cv::Point2f(x, y));
  }

  // Add target (this will make a copy of descriptors)
  std::vector<uint8_t> emptyVocabData;  // No vocab data for now
  return g_engine->addTarget(id, descriptors, corners, emptyVocabData);
}

/**
 * Remove a target from the database
 */
void removeTarget(const std::string& id) {
  if (g_engine) {
    g_engine->removeTarget(id);
  }
}

/**
 * Clear all targets
 */
void clearTargets() {
  if (g_engine) {
    g_engine->clearTargets();
  }
}

/**
 * Get number of loaded targets
 */
int getTargetCount() {
  if (!g_engine) {
    return 0;
  }
  return g_engine->getTargetCount();
}

/**
 * Process a video frame
 * @param imageDataPtr Pointer to image data (width * height * channels bytes)
 * @param width Image width
 * @param height Image height
 * @param channels Number of channels (3 for RGB, 4 for RGBA)
 * @return JavaScript array of tracking results
 */
val processFrame(
    uintptr_t imageDataPtr,
    int width,
    int height,
    int channels) {

  if (!g_engine) {
    initEngine();
  }

  // Process frame
  auto results = g_engine->processFrame(
    reinterpret_cast<const uint8_t*>(imageDataPtr),
    width, height, channels);

  // Convert results to JavaScript array
  val jsResults = val::array();

  for (size_t i = 0; i < results.size(); ++i) {
    const auto& result = results[i];

    val jsResult = val::object();
    jsResult.set("targetId", result.targetId);
    jsResult.set("detected", result.detected);
    jsResult.set("confidence", result.confidence);
    jsResult.set("trackingMode", result.trackingMode);

    // Convert corners to flat array [x0,y0, x1,y1, x2,y2, x3,y3]
    val jsCorners = val::array();
    for (size_t j = 0; j < result.corners.size(); ++j) {
      jsCorners.set(j * 2, result.corners[j].x);
      jsCorners.set(j * 2 + 1, result.corners[j].y);
    }
    jsResult.set("corners", jsCorners);

    jsResults.set(i, jsResult);
  }

  return jsResults;
}

/**
 * Start tracking session
 */
void startTracking() {
  if (g_engine) {
    g_engine->startTracking();
  }
}

/**
 * Stop tracking session
 */
void stopTracking() {
  if (g_engine) {
    g_engine->stopTracking();
  }
}

/**
 * Check if engine is tracking
 */
bool isTracking() {
  if (!g_engine) {
    return false;
  }
  return g_engine->isTracking();
}

/**
 * Reset engine state
 */
void reset() {
  if (g_engine) {
    g_engine->reset();
  }
}

/**
 * Get last frame statistics
 */
val getFrameStats() {
  if (!g_engine) {
    return val::object();
  }

  auto stats = g_engine->getLastFrameStats();

  val jsStats = val::object();
  jsStats.set("detectionMs", stats.detectionMs);
  jsStats.set("trackingMs", stats.trackingMs);
  jsStats.set("totalMs", stats.totalMs);
  jsStats.set("frameNumber", stats.frameNumber);
  jsStats.set("detectedTargets", stats.detectedTargets);
  jsStats.set("trackedTargets", stats.trackedTargets);

  return jsStats;
}

/**
 * Reset performance statistics
 */
void resetStats() {
  if (g_engine) {
    g_engine->resetStats();
  }
}

/**
 * Get WASM memory info (for debugging)
 */
val getMemoryInfo() {
  val info = val::object();
  // Get heap size from Emscripten
  size_t heapSize = 0;
  EM_ASM({
    heapSize = HEAP8.length;
  });
  info.set("heapSize", static_cast<double>(heapSize));
  info.set("freeMemory", 0);  // Not easily available, simplified
  return info;
}

// Embind bindings
EMSCRIPTEN_BINDINGS(webar_module) {
  // Engine initialization and configuration
  function("initEngine", &initEngine);
  function("setEngineConfig", &setEngineConfig);

  // Target management
  function("addTarget", &addTarget,
          allow_raw_pointers());
  function("removeTarget", &removeTarget);
  function("clearTargets", &clearTargets);
  function("getTargetCount", &getTargetCount);

  // Frame processing
  function("processFrame", &processFrame,
          allow_raw_pointers());

  // Tracking control
  function("startTracking", &startTracking);
  function("stopTracking", &stopTracking);
  function("isTracking", &isTracking);
  function("reset", &reset);

  // Statistics and debugging
  function("getFrameStats", &getFrameStats);
  function("resetStats", &resetStats);
  function("getMemoryInfo", &getMemoryInfo);
}

// Module initialization callback
EMSCRIPTEN_KEEPALIVE
extern "C" void onModuleLoaded() {
  // Called when WASM module is loaded
  // Initialize engine with default config
  initEngine();
}
