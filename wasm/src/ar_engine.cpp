/**
 * AR Engine Implementation
 */

#include "ar_engine.hpp"
#include <chrono>
#include <algorithm>

namespace webar {

AREngine::AREngine()
  : isTracking_(false), frameCounter_(0) {

  // Initialize components with default configs
  DetectorConfig detectorConfig;
  detector_ = std::make_unique<FeatureDetector>(detectorConfig);

  TrackerConfig trackerConfig;
  tracker_ = std::make_unique<OpticalFlowTracker>(trackerConfig);

  TargetManagerConfig targetConfig;
  targetManager_ = std::make_unique<TargetManager>(targetConfig);

  MemoryPoolConfig poolConfig;
  memoryPool_ = std::make_unique<MemoryPool>(poolConfig);

  resetStats();
}

AREngine::~AREngine() {
  stopTracking();
  cleanupFrame();
}

void AREngine::setConfig(const EngineConfig& config) {
  config_ = config;

  // Update component configs
  DetectorConfig detectorConfig = detector_->getConfig();
  detectorConfig.maxFeatures = config.maxFeatures;
  detectorConfig.matchRatioThreshold = config.matchRatioThreshold;
  detectorConfig.ransacIterations = config.ransacIterations;
  detectorConfig.ransacThreshold = config.ransacThreshold;
  detector_->setConfig(detectorConfig);

  TrackerConfig trackerConfig = tracker_->getConfig();
  trackerConfig.maxTrackingPoints = config.maxTrackingPoints;
  tracker_->setConfig(trackerConfig);
}

bool AREngine::addTarget(const std::string& id,
                         const cv::Mat& descriptors,
                         const std::vector<cv::Point2f>& corners,
                         const std::vector<uint8_t>& vocabData) {
  return targetManager_->addTarget(id, descriptors, corners, vocabData);
}

bool AREngine::addTarget(const std::string& id,
                         const std::vector<cv::KeyPoint>& keypoints,
                         const cv::Mat& descriptors,
                         const std::vector<cv::Point2f>& corners,
                         const std::vector<uint8_t>& vocabData) {
  return targetManager_->addTarget(id, keypoints, descriptors, corners, vocabData);
}

void AREngine::removeTarget(const std::string& id) {
  targetManager_->removeTarget(id);
  tracker_->removeTarget(id);
  lastResults_.erase(id);
}

void AREngine::clearTargets() {
  targetManager_->clearTargets();
  tracker_->clearTargets();
  lastResults_.clear();
}

int AREngine::getTargetCount() const {
  return targetManager_->getTargetCount();
}

std::vector<TrackingResult> AREngine::processFrame(
    const uint8_t* imageData,
    int width,
    int height,
    int channels) {

  if (!isTracking_) {
    std::cerr << "[Engine] Not tracking - call startTracking() first!" << std::endl;
    return std::vector<TrackingResult>();
  }

  auto frameStart = std::chrono::high_resolution_clock::now();

  // Create cv::Mat from raw data (no copy, just wrap)
  cv::Mat frame(height, width,
               channels == 4 ? CV_8UC4 : CV_8UC3,
               const_cast<uint8_t*>(imageData));

  // Convert to grayscale for processing
  auto grayFrame = memoryPool_->acquireFrame(width, height, CV_8UC1);
  if (channels == 4) {
    cv::cvtColor(frame, *grayFrame, cv::COLOR_RGBA2GRAY);
  } else {
    cv::cvtColor(frame, *grayFrame, cv::COLOR_RGB2GRAY);
  }

  std::vector<TrackingResult> results;
  FrameStats stats;
  stats.frameNumber = frameCounter_++;

  // Decide whether to detect or track
  if (shouldDetect()) {
    // Detection frame
    if (config_.enableProfiling && frameCounter_ % 30 == 0) {
      std::cout << "[Engine] Frame " << stats.frameNumber
                << " - Running detection (targets: "
                << targetManager_->getTargetCount() << ")" << std::endl;
    }

    auto detectStart = std::chrono::high_resolution_clock::now();
    detectTargets(*grayFrame, results);
    auto detectEnd = std::chrono::high_resolution_clock::now();

    stats.detectionMs = std::chrono::duration<double, std::milli>(
      detectEnd - detectStart).count();
    stats.detectedTargets = results.size();

    if (config_.enableProfiling && frameCounter_ % 30 == 0) {
      std::cout << "[Engine] Detection complete - found " << results.size()
                << " targets in " << stats.detectionMs << "ms" << std::endl;
    }

    // Update tracking states for detected targets
    if (config_.useOpticalFlow) {
      for (const auto& result : results) {
        if (result.detected) {
          tracker_->updateTarget(result.targetId, result.corners);
        }
      }
    }
  } else if (config_.useOpticalFlow && !previousFrame_.empty()) {
    // Tracking frame
    auto trackStart = std::chrono::high_resolution_clock::now();
    trackTargets(*grayFrame, results);
    auto trackEnd = std::chrono::high_resolution_clock::now();

    stats.trackingMs = std::chrono::duration<double, std::milli>(
      trackEnd - trackStart).count();
    stats.trackedTargets = results.size();
  }

  // Store current frame for next iteration
  grayFrame->copyTo(previousFrame_);

  // Update last results cache
  for (const auto& result : results) {
    lastResults_[result.targetId] = result;
  }

  auto frameEnd = std::chrono::high_resolution_clock::now();
  stats.totalMs = std::chrono::duration<double, std::milli>(
    frameEnd - frameStart).count();

  updateStats(stats);

  return results;
}

void AREngine::detectTargets(const cv::Mat& frame,
                              std::vector<TrackingResult>& results) {
  // Extract features from current frame
  std::vector<cv::KeyPoint> frameKeypoints;
  cv::Mat frameDescriptors;

  if (!detector_->detectAndCompute(frame, frameKeypoints, frameDescriptors)) {
    if (config_.enableProfiling) {
      std::cerr << "[Engine] detectAndCompute failed!" << std::endl;
    }
    return;
  }

  if (frameDescriptors.empty()) {
    if (config_.enableProfiling) {
      std::cerr << "[Engine] No features detected in frame!" << std::endl;
    }
    return;
  }

  if (config_.enableProfiling && frameCounter_ % 30 == 0) {
    std::cout << "[Engine] Frame features: " << frameKeypoints.size()
              << " keypoints, " << frameDescriptors.rows << " descriptors" << std::endl;
  }

  // Query candidate targets using vocabulary tree
  std::vector<std::string> candidates;
  if (targetManager_->getConfig().useVocabularyTree &&
      targetManager_->getTargetCount() > 3) {
    candidates = targetManager_->queryCandidates(
      frameDescriptors,
      targetManager_->getConfig().maxCandidates);
  } else {
    // No vocabulary tree or few targets, use all
    candidates = targetManager_->getAllTargetIds();
  }

  if (candidates.empty()) {
    if (config_.enableProfiling) {
      std::cerr << "[Engine] No candidate targets!" << std::endl;
    }
    return;
  }

  if (config_.enableProfiling && frameCounter_ % 30 == 0) {
    std::cout << "[Engine] Matching against " << candidates.size() << " candidates: ";
    for (size_t i = 0; i < candidates.size() && i < 3; i++) {
      std::cout << candidates[i] << " ";
    }
    std::cout << std::endl;
  }

  // Get target batch for matching
  auto targetBatch = targetManager_->getTargetBatch(candidates);

  // Match against candidates
  auto matches = detector_->matchMultipleTargets(
    frameDescriptors,
    frameKeypoints,
    targetBatch.ids,
    targetBatch.keypoints,
    targetBatch.descriptors,
    targetBatch.corners,
    cv::Size(frame.cols, frame.rows),
    targetManager_->getConfig().maxCandidates);

  if (config_.enableProfiling && frameCounter_ % 30 == 0) {
    std::cout << "[Engine] Matches found: " << matches.size() << std::endl;
    for (const auto& match : matches) {
      std::cout << "[Engine]   - " << match.targetId
                << ": inliers=" << match.numInliers
                << ", conf=" << match.confidence << std::endl;
    }
  }

  // Convert detection matches to tracking results
  for (const auto& match : matches) {
    TrackingResult result;
    result.targetId = match.targetId;
    result.detected = match.numInliers >= 10;
    result.corners = match.corners;
    result.confidence = match.confidence;
    result.trackingMode = "detection";
    results.push_back(result);
  }
}

void AREngine::trackTargets(const cv::Mat& frame,
                             std::vector<TrackingResult>& results) {
  auto trackingResults = tracker_->trackFrame(frame, previousFrame_);

  for (const auto& tr : trackingResults) {
    if (tr.success) {
      TrackingResult result;
      result.targetId = tr.targetId;
      result.detected = true;
      result.corners = tr.corners;
      result.confidence = tr.confidence;
      result.trackingMode = "optical_flow";
      results.push_back(result);
    }
  }
}

bool AREngine::shouldDetect() const {
  return (frameCounter_ % config_.detectionInterval) == 0;
}

void AREngine::updateStats(const FrameStats& stats) {
  lastStats_ = stats;
  lastFrameTime_ = std::chrono::high_resolution_clock::now();
}

void AREngine::reset() {
  frameCounter_ = 0;
  lastResults_.clear();
  previousFrame_.release();
  tracker_->clearTargets();
  resetStats();
}

void AREngine::startTracking() {
  isTracking_ = true;
  frameCounter_ = 0;
  resetStats();
}

void AREngine::stopTracking() {
  isTracking_ = false;
  cleanupFrame();
}

void AREngine::resetStats() {
  lastStats_ = FrameStats();
  lastFrameTime_ = std::chrono::high_resolution_clock::now();
}

void AREngine::cleanupFrame() {
  if (!currentFrame_.empty()) {
    currentFrame_.release();
  }
  if (!previousFrame_.empty()) {
    previousFrame_.release();
  }
}

} // namespace webar
