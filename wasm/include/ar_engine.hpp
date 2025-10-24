/**
 * AR Engine - Main coordinator for WebAR tracking pipeline
 * Handles frame processing, detection, and tracking orchestration
 */

#ifndef AR_ENGINE_HPP
#define AR_ENGINE_HPP

#include <opencv2/opencv.hpp>
#include <memory>
#include <vector>
#include <string>
#include <unordered_map>
#include "feature_detector.hpp"
#include "optical_flow_tracker.hpp"
#include "target_manager.hpp"
#include "memory_pool.hpp"

namespace webar {

/**
 * Tracking result for a single target
 */
struct TrackingResult {
  std::string targetId;
  bool detected;
  std::vector<cv::Point2f> corners;  // 4 corners in image coordinates
  float confidence;
  std::string trackingMode;  // "detection" or "optical_flow"

  TrackingResult() : detected(false), confidence(0.0f),
                     trackingMode("none") {}
};

/**
 * Configuration for AR engine
 */
struct EngineConfig {
  bool useOpticalFlow = true;
  int detectionInterval = 15;      // Detect every N frames
  int maxFeatures = 800;            // Max features for detection
  int maxTrackingPoints = 100;      // Max points for optical flow
  float matchRatioThreshold = 0.7f; // Lowe's ratio test
  int ransacIterations = 2000;
  float ransacThreshold = 3.0f;
  bool enableProfiling = false;

  EngineConfig() = default;
};

/**
 * Main AR Engine class
 * Coordinates detection, tracking, and resource management
 */
class AREngine {
public:
  AREngine();
  ~AREngine();

  // Configuration
  void setConfig(const EngineConfig& config);
  EngineConfig getConfig() const { return config_; }

  // Target management
  bool addTarget(const std::string& id,
                 const cv::Mat& descriptors,
                 const std::vector<cv::Point2f>& corners,
                 const std::vector<uint8_t>& vocabData);

  // Add target with keypoints (preferred)
  bool addTarget(const std::string& id,
                 const std::vector<cv::KeyPoint>& keypoints,
                 const cv::Mat& descriptors,
                 const std::vector<cv::Point2f>& corners,
                 const std::vector<uint8_t>& vocabData);
  void removeTarget(const std::string& id);
  void clearTargets();
  int getTargetCount() const;

  // Frame processing
  std::vector<TrackingResult> processFrame(const uint8_t* imageData,
                                            int width,
                                            int height,
                                            int channels);

  // State management
  void reset();
  void startTracking();
  void stopTracking();
  bool isTracking() const { return isTracking_; }

  // Performance profiling
  struct FrameStats {
    double detectionMs = 0.0;
    double trackingMs = 0.0;
    double totalMs = 0.0;
    int frameNumber = 0;
    int detectedTargets = 0;
    int trackedTargets = 0;
  };

  FrameStats getLastFrameStats() const { return lastStats_; }
  void resetStats();

private:
  // Configuration
  EngineConfig config_;

  // Components
  std::unique_ptr<FeatureDetector> detector_;
  std::unique_ptr<OpticalFlowTracker> tracker_;
  std::unique_ptr<TargetManager> targetManager_;
  std::unique_ptr<MemoryPool> memoryPool_;

  // State
  bool isTracking_;
  int frameCounter_;
  cv::Mat currentFrame_;
  cv::Mat previousFrame_;

  // Results cache
  std::unordered_map<std::string, TrackingResult> lastResults_;

  // Performance tracking
  FrameStats lastStats_;
  std::chrono::high_resolution_clock::time_point lastFrameTime_;

  // Helper methods
  void detectTargets(const cv::Mat& frame,
                     std::vector<TrackingResult>& results);
  void trackTargets(const cv::Mat& frame,
                    std::vector<TrackingResult>& results);
  bool shouldDetect() const;
  void updateStats(const FrameStats& stats);

  // Memory management
  void cleanupFrame();
};

} // namespace webar

#endif // AR_ENGINE_HPP
