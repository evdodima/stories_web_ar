/**
 * Optical Flow Tracker - Lucas-Kanade tracking with Kalman filtering
 * Tracks targets between detection frames for smooth, efficient tracking
 */

#ifndef OPTICAL_FLOW_TRACKER_HPP
#define OPTICAL_FLOW_TRACKER_HPP

#include <opencv2/opencv.hpp>
#include <opencv2/video/tracking.hpp>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>

namespace webar {

/**
 * Tracking state for a single target
 */
struct TrackingState {
  std::string targetId;
  std::vector<cv::Point2f> corners;
  std::vector<cv::Point2f> trackingPoints;
  std::vector<cv::Point2f> predictedCorners;
  std::vector<cv::KalmanFilter> kalmanFilters;  // One per corner
  float confidence;
  int framesTracked;
  int framesSinceDetection;
  bool isActive;

  TrackingState() : confidence(0.0f), framesTracked(0),
                   framesSinceDetection(0), isActive(false) {}
};

/**
 * Optical flow tracker configuration
 */
struct TrackerConfig {
  int maxTrackingPoints = 100;
  int maxFramesWithoutDetection = 30;
  float minTrackingConfidence = 0.5f;
  cv::Size windowSize = cv::Size(21, 21);
  int maxPyramidLevel = 4;
  int maxIterations = 30;
  double epsilon = 0.01;
  float forwardBackwardThreshold = 1.0f;
  int minInliers = 8;

  TrackerConfig() = default;
};

/**
 * Lucas-Kanade optical flow tracker with Kalman filtering
 * Provides smooth, efficient tracking between detection frames
 */
class OpticalFlowTracker {
public:
  explicit OpticalFlowTracker(const TrackerConfig& config = TrackerConfig());
  ~OpticalFlowTracker();

  // Configuration
  void setConfig(const TrackerConfig& config);
  TrackerConfig getConfig() const { return config_; }

  // Tracking state management
  void initializeTarget(const std::string& targetId,
                       const std::vector<cv::Point2f>& corners,
                       const cv::Mat& frame);

  void updateTarget(const std::string& targetId,
                   const std::vector<cv::Point2f>& corners);

  void removeTarget(const std::string& targetId);
  void clearTargets();

  // Tracking
  struct TrackingResult {
    std::string targetId;
    bool success;
    std::vector<cv::Point2f> corners;
    float confidence;
    int numTrackedPoints;
  };

  std::vector<TrackingResult> trackFrame(const cv::Mat& currentFrame,
                                         const cv::Mat& previousFrame);

  TrackingResult trackSingleTarget(const std::string& targetId,
                                   const cv::Mat& currentFrame,
                                   const cv::Mat& previousFrame);

  // State queries
  bool isTargetActive(const std::string& targetId) const;
  int getActiveTargetCount() const;
  std::vector<std::string> getActiveTargetIds() const;

  // Statistics
  struct TrackingStats {
    int pointsTracked = 0;
    int pointsLost = 0;
    int inliersFound = 0;
    double flowTimeMs = 0.0;
    double validationTimeMs = 0.0;
    double kalmanTimeMs = 0.0;
  };

  TrackingStats getLastStats() const { return lastStats_; }

private:
  TrackerConfig config_;
  std::unordered_map<std::string, TrackingState> trackingStates_;
  TrackingStats lastStats_;

  // Helper methods
  bool detectTrackingPoints(const cv::Mat& frame,
                           const std::vector<cv::Point2f>& corners,
                           std::vector<cv::Point2f>& points);

  bool trackPoints(const cv::Mat& prevFrame,
                  const cv::Mat& currFrame,
                  const std::vector<cv::Point2f>& prevPoints,
                  std::vector<cv::Point2f>& currPoints,
                  std::vector<uchar>& status);

  bool forwardBackwardCheck(const cv::Mat& prevFrame,
                            const cv::Mat& currFrame,
                            const std::vector<cv::Point2f>& prevPoints,
                            const std::vector<cv::Point2f>& currPoints,
                            std::vector<uchar>& status);

  bool estimateHomographyFromPoints(const std::vector<cv::Point2f>& srcPoints,
                                    const std::vector<cv::Point2f>& dstPoints,
                                    cv::Mat& H,
                                    std::vector<uchar>& inlierMask);

  void transformCorners(const cv::Mat& H,
                       const std::vector<cv::Point2f>& srcCorners,
                       std::vector<cv::Point2f>& dstCorners);

  void applyKalmanFiltering(TrackingState& state);

  void initializeKalmanFilters(TrackingState& state);

  bool validateTracking(const TrackingState& state,
                       const cv::Size& frameSize);

  float calculateTrackingConfidence(const TrackingState& state,
                                   int numInliers,
                                   int totalPoints);
};

} // namespace webar

#endif // OPTICAL_FLOW_TRACKER_HPP
