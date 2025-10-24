/**
 * Optical Flow Tracker Implementation
 */

#include "optical_flow_tracker.hpp"
#include <chrono>
#include <algorithm>

namespace webar {

OpticalFlowTracker::OpticalFlowTracker(const TrackerConfig& config)
  : config_(config) {}

OpticalFlowTracker::~OpticalFlowTracker() = default;

void OpticalFlowTracker::setConfig(const TrackerConfig& config) {
  config_ = config;
}

void OpticalFlowTracker::initializeTarget(
    const std::string& targetId,
    const std::vector<cv::Point2f>& corners,
    const cv::Mat& frame) {

  TrackingState state;
  state.targetId = targetId;
  state.corners = corners;
  state.isActive = true;
  state.confidence = 1.0f;
  state.framesTracked = 0;
  state.framesSinceDetection = 0;

  // Initialize Kalman filters for each corner
  initializeKalmanFilters(state);

  // Detect tracking points in the target region
  detectTrackingPoints(frame, corners, state.trackingPoints);

  trackingStates_[targetId] = state;
}

void OpticalFlowTracker::updateTarget(
    const std::string& targetId,
    const std::vector<cv::Point2f>& corners) {

  auto it = trackingStates_.find(targetId);
  if (it != trackingStates_.end()) {
    it->second.corners = corners;
    it->second.confidence = 1.0f;
    it->second.framesSinceDetection = 0;
    it->second.isActive = true;

    // Reset Kalman filters
    initializeKalmanFilters(it->second);
  } else {
    // Target not found, will be initialized on next tracking frame
    TrackingState state;
    state.targetId = targetId;
    state.corners = corners;
    state.isActive = true;
    state.confidence = 1.0f;
    state.framesTracked = 0;
    state.framesSinceDetection = 0;
    trackingStates_[targetId] = state;
  }
}

void OpticalFlowTracker::removeTarget(const std::string& targetId) {
  trackingStates_.erase(targetId);
}

void OpticalFlowTracker::clearTargets() {
  trackingStates_.clear();
}

std::vector<OpticalFlowTracker::TrackingResult>
OpticalFlowTracker::trackFrame(
    const cv::Mat& currentFrame,
    const cv::Mat& previousFrame) {

  std::vector<TrackingResult> results;

  if (currentFrame.empty() || previousFrame.empty()) {
    return results;
  }

  lastStats_ = TrackingStats();
  auto frameStart = std::chrono::high_resolution_clock::now();

  for (auto& [targetId, state] : trackingStates_) {
    if (!state.isActive) {
      continue;
    }

    TrackingResult result;
    result.targetId = targetId;
    result.success = false;

    // Check if tracking points need redetection
    if (state.trackingPoints.empty() ||
        state.framesSinceDetection > config_.maxFramesWithoutDetection) {
      detectTrackingPoints(previousFrame, state.corners,
                          state.trackingPoints);
      state.framesSinceDetection = 0;
    }

    if (state.trackingPoints.empty()) {
      state.isActive = false;
      continue;
    }

    // Track points with optical flow
    std::vector<cv::Point2f> trackedPoints;
    std::vector<uchar> status;

    auto flowStart = std::chrono::high_resolution_clock::now();
    bool trackSuccess = trackPoints(previousFrame, currentFrame,
                                    state.trackingPoints,
                                    trackedPoints, status);
    auto flowEnd = std::chrono::high_resolution_clock::now();
    lastStats_.flowTimeMs +=
      std::chrono::duration<double, std::milli>(flowEnd - flowStart).count();

    if (!trackSuccess) {
      state.isActive = false;
      continue;
    }

    // Filter good points
    std::vector<cv::Point2f> goodPrev, goodCurr;
    for (size_t i = 0; i < status.size(); ++i) {
      if (status[i]) {
        goodPrev.push_back(state.trackingPoints[i]);
        goodCurr.push_back(trackedPoints[i]);
      }
    }

    lastStats_.pointsTracked += goodCurr.size();
    lastStats_.pointsLost += (state.trackingPoints.size() - goodCurr.size());

    if (goodCurr.size() < static_cast<size_t>(config_.minInliers)) {
      state.isActive = false;
      continue;
    }

    // Estimate homography from tracked points
    auto valStart = std::chrono::high_resolution_clock::now();
    cv::Mat H;
    std::vector<uchar> inlierMask;
    bool homSuccess = estimateHomographyFromPoints(
      goodPrev, goodCurr, H, inlierMask);
    auto valEnd = std::chrono::high_resolution_clock::now();
    lastStats_.validationTimeMs +=
      std::chrono::duration<double, std::milli>(valEnd - valStart).count();

    if (!homSuccess) {
      state.isActive = false;
      continue;
    }

    int numInliers = std::count(inlierMask.begin(), inlierMask.end(), 1);
    lastStats_.inliersFound += numInliers;

    if (numInliers < config_.minInliers) {
      state.isActive = false;
      continue;
    }

    // Transform corners
    std::vector<cv::Point2f> newCorners;
    transformCorners(H, state.corners, newCorners);

    // Validate tracking
    state.corners = newCorners;
    if (!validateTracking(state, currentFrame.size())) {
      state.isActive = false;
      continue;
    }

    // Apply Kalman filtering
    auto kalmanStart = std::chrono::high_resolution_clock::now();
    applyKalmanFiltering(state);
    auto kalmanEnd = std::chrono::high_resolution_clock::now();
    lastStats_.kalmanTimeMs +=
      std::chrono::duration<double, std::milli>(kalmanEnd - kalmanStart).count();

    // Update tracking state
    state.trackingPoints = goodCurr;
    state.framesTracked++;
    state.framesSinceDetection++;
    state.confidence = calculateTrackingConfidence(
      state, numInliers, goodCurr.size());

    // Build result
    result.success = true;
    result.corners = state.predictedCorners.empty() ?
                    state.corners : state.predictedCorners;
    result.confidence = state.confidence;
    result.numTrackedPoints = goodCurr.size();

    results.push_back(result);
  }

  auto frameEnd = std::chrono::high_resolution_clock::now();

  return results;
}

OpticalFlowTracker::TrackingResult
OpticalFlowTracker::trackSingleTarget(
    const std::string& targetId,
    const cv::Mat& currentFrame,
    const cv::Mat& previousFrame) {

  auto results = trackFrame(currentFrame, previousFrame);

  for (const auto& result : results) {
    if (result.targetId == targetId) {
      return result;
    }
  }

  TrackingResult result;
  result.targetId = targetId;
  result.success = false;
  return result;
}

bool OpticalFlowTracker::isTargetActive(const std::string& targetId) const {
  auto it = trackingStates_.find(targetId);
  return it != trackingStates_.end() && it->second.isActive;
}

int OpticalFlowTracker::getActiveTargetCount() const {
  int count = 0;
  for (const auto& [id, state] : trackingStates_) {
    if (state.isActive) {
      ++count;
    }
  }
  return count;
}

std::vector<std::string> OpticalFlowTracker::getActiveTargetIds() const {
  std::vector<std::string> ids;
  for (const auto& [id, state] : trackingStates_) {
    if (state.isActive) {
      ids.push_back(id);
    }
  }
  return ids;
}

bool OpticalFlowTracker::detectTrackingPoints(
    const cv::Mat& frame,
    const std::vector<cv::Point2f>& corners,
    std::vector<cv::Point2f>& points) {

  if (frame.empty() || corners.size() != 4) {
    return false;
  }

  try {
    // Create mask for region of interest
    cv::Mat mask = cv::Mat::zeros(frame.size(), CV_8U);
    std::vector<cv::Point> poly(corners.begin(), corners.end());
    cv::fillConvexPoly(mask, poly, cv::Scalar(255));

    // Detect good features to track
    cv::goodFeaturesToTrack(frame, points, config_.maxTrackingPoints,
                           0.01, 10.0, mask);

    return !points.empty();
  } catch (const cv::Exception& e) {
    return false;
  }
}

bool OpticalFlowTracker::trackPoints(
    const cv::Mat& prevFrame,
    const cv::Mat& currFrame,
    const std::vector<cv::Point2f>& prevPoints,
    std::vector<cv::Point2f>& currPoints,
    std::vector<uchar>& status) {

  if (prevFrame.empty() || currFrame.empty() || prevPoints.empty()) {
    return false;
  }

  try {
    std::vector<float> err;
    cv::calcOpticalFlowPyrLK(
      prevFrame, currFrame, prevPoints, currPoints,
      status, err, config_.windowSize,
      config_.maxPyramidLevel,
      cv::TermCriteria(cv::TermCriteria::COUNT | cv::TermCriteria::EPS,
                      config_.maxIterations, config_.epsilon));

    // Forward-backward error check
    return forwardBackwardCheck(prevFrame, currFrame,
                               prevPoints, currPoints, status);
  } catch (const cv::Exception& e) {
    return false;
  }
}

bool OpticalFlowTracker::forwardBackwardCheck(
    const cv::Mat& prevFrame,
    const cv::Mat& currFrame,
    const std::vector<cv::Point2f>& prevPoints,
    const std::vector<cv::Point2f>& currPoints,
    std::vector<uchar>& status) {

  if (currPoints.empty()) {
    return false;
  }

  try {
    // Backward flow
    std::vector<cv::Point2f> backPoints;
    std::vector<uchar> backStatus;
    std::vector<float> backErr;

    cv::calcOpticalFlowPyrLK(
      currFrame, prevFrame, currPoints, backPoints,
      backStatus, backErr, config_.windowSize,
      config_.maxPyramidLevel,
      cv::TermCriteria(cv::TermCriteria::COUNT | cv::TermCriteria::EPS,
                      config_.maxIterations, config_.epsilon));

    // Check forward-backward error
    for (size_t i = 0; i < prevPoints.size(); ++i) {
      if (status[i] && backStatus[i]) {
        float fbError = cv::norm(prevPoints[i] - backPoints[i]);
        if (fbError > config_.forwardBackwardThreshold) {
          status[i] = 0;
        }
      } else {
        status[i] = 0;
      }
    }

    return true;
  } catch (const cv::Exception& e) {
    return false;
  }
}

bool OpticalFlowTracker::estimateHomographyFromPoints(
    const std::vector<cv::Point2f>& srcPoints,
    const std::vector<cv::Point2f>& dstPoints,
    cv::Mat& H,
    std::vector<uchar>& inlierMask) {

  if (srcPoints.size() < 4 || srcPoints.size() != dstPoints.size()) {
    return false;
  }

  try {
    H = cv::findHomography(srcPoints, dstPoints, cv::RANSAC, 3.0, inlierMask);
    return !H.empty();
  } catch (const cv::Exception& e) {
    return false;
  }
}

void OpticalFlowTracker::transformCorners(
    const cv::Mat& H,
    const std::vector<cv::Point2f>& srcCorners,
    std::vector<cv::Point2f>& dstCorners) {

  if (H.empty() || srcCorners.size() != 4) {
    dstCorners = srcCorners;
    return;
  }

  try {
    cv::perspectiveTransform(srcCorners, dstCorners, H);
  } catch (const cv::Exception& e) {
    dstCorners = srcCorners;
  }
}

void OpticalFlowTracker::applyKalmanFiltering(TrackingState& state) {
  if (state.kalmanFilters.empty()) {
    initializeKalmanFilters(state);
  }

  state.predictedCorners.resize(4);

  for (size_t i = 0; i < 4 && i < state.corners.size(); ++i) {
    cv::Mat measurement = (cv::Mat_<float>(2, 1) <<
                          state.corners[i].x, state.corners[i].y);
    state.kalmanFilters[i].correct(measurement);

    cv::Mat prediction = state.kalmanFilters[i].predict();
    state.predictedCorners[i] = cv::Point2f(
      prediction.at<float>(0), prediction.at<float>(1));
  }
}

void OpticalFlowTracker::initializeKalmanFilters(TrackingState& state) {
  state.kalmanFilters.clear();
  state.kalmanFilters.resize(4);

  for (size_t i = 0; i < 4 && i < state.corners.size(); ++i) {
    cv::KalmanFilter& kf = state.kalmanFilters[i];
    kf.init(4, 2, 0);

    // State: [x, y, vx, vy]
    kf.transitionMatrix = (cv::Mat_<float>(4, 4) <<
      1, 0, 1, 0,
      0, 1, 0, 1,
      0, 0, 1, 0,
      0, 0, 0, 1);

    kf.measurementMatrix = (cv::Mat_<float>(2, 4) <<
      1, 0, 0, 0,
      0, 1, 0, 0);

    kf.processNoiseCov = cv::Mat::eye(4, 4, CV_32F) * 0.03f;
    kf.measurementNoiseCov = cv::Mat::eye(2, 2, CV_32F) * 0.1f;
    kf.errorCovPost = cv::Mat::eye(4, 4, CV_32F);

    kf.statePost = (cv::Mat_<float>(4, 1) <<
      state.corners[i].x, state.corners[i].y, 0, 0);
  }
}

bool OpticalFlowTracker::validateTracking(
    const TrackingState& state,
    const cv::Size& frameSize) {

  if (state.corners.size() != 4) {
    return false;
  }

  // Check if corners are in frame bounds (with margin)
  const float margin = 50.0f;
  for (const auto& corner : state.corners) {
    if (corner.x < -margin || corner.x > frameSize.width + margin ||
        corner.y < -margin || corner.y > frameSize.height + margin) {
      return false;
    }
  }

  // Check for reasonable geometry
  float width = cv::norm(state.corners[1] - state.corners[0]);
  float height = cv::norm(state.corners[3] - state.corners[0]);

  if (width < 20.0f || height < 20.0f || width > frameSize.width * 2 ||
      height > frameSize.height * 2) {
    return false;
  }

  return true;
}

float OpticalFlowTracker::calculateTrackingConfidence(
    const TrackingState& state,
    int numInliers,
    int totalPoints) {

  if (totalPoints == 0) {
    return 0.0f;
  }

  float inlierRatio = static_cast<float>(numInliers) /
                     static_cast<float>(totalPoints);

  // Decay confidence over time without detection
  float decayFactor = 1.0f - (static_cast<float>(state.framesSinceDetection) /
                             static_cast<float>(config_.maxFramesWithoutDetection));

  return inlierRatio * decayFactor;
}

} // namespace webar
