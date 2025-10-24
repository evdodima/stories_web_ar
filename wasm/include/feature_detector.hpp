/**
 * Feature Detector - BRISK-based feature detection and matching
 * Handles keypoint detection, descriptor computation, and matching
 */

#ifndef FEATURE_DETECTOR_HPP
#define FEATURE_DETECTOR_HPP

#include <opencv2/opencv.hpp>
#include <opencv2/features2d.hpp>
#include <vector>
#include <memory>

namespace webar {

/**
 * Detection match result for a single target
 */
struct DetectionMatch {
  std::string targetId;
  std::vector<cv::Point2f> corners;
  std::vector<cv::Point2f> matchedPoints;
  std::vector<cv::DMatch> inliers;
  float confidence;
  int numInliers;

  DetectionMatch() : confidence(0.0f), numInliers(0) {}
};

/**
 * Feature detector configuration
 */
struct DetectorConfig {
  int maxFeatures = 800;
  float matchRatioThreshold = 0.7f;
  int ransacIterations = 2000;
  float ransacThreshold = 3.0f;
  int minInliers = 10;

  DetectorConfig() = default;
};

/**
 * BRISK-based feature detector
 * Thread-safe, optimized for real-time performance
 */
class FeatureDetector {
public:
  explicit FeatureDetector(const DetectorConfig& config = DetectorConfig());
  ~FeatureDetector();

  // Configuration
  void setConfig(const DetectorConfig& config);
  DetectorConfig getConfig() const { return config_; }

  // Feature extraction
  bool detectAndCompute(const cv::Mat& frame,
                        std::vector<cv::KeyPoint>& keypoints,
                        cv::Mat& descriptors);

  // Matching against a single target
  bool matchTarget(const cv::Mat& frameDescriptors,
                   const std::vector<cv::KeyPoint>& frameKeypoints,
                   const std::vector<cv::KeyPoint>& targetKeypoints,
                   const cv::Mat& targetDescriptors,
                   const std::vector<cv::Point2f>& targetCorners,
                   DetectionMatch& result);

  // Batch matching against multiple targets
  std::vector<DetectionMatch> matchMultipleTargets(
    const cv::Mat& frameDescriptors,
    const std::vector<cv::KeyPoint>& frameKeypoints,
    const std::vector<std::string>& targetIds,
    const std::vector<std::vector<cv::KeyPoint>>& targetKeypoints,
    const std::vector<cv::Mat>& targetDescriptors,
    const std::vector<std::vector<cv::Point2f>>& targetCorners,
    int maxResults = 3);

  // Statistics
  struct DetectionStats {
    int keypointsDetected = 0;
    int matchesFound = 0;
    int inliersFound = 0;
    double detectionTimeMs = 0.0;
    double matchingTimeMs = 0.0;
    double homographyTimeMs = 0.0;
  };

  DetectionStats getLastStats() const { return lastStats_; }

private:
  DetectorConfig config_;
  cv::Ptr<cv::BRISK> detector_;
  cv::Ptr<cv::BFMatcher> matcher_;
  DetectionStats lastStats_;

  // Helper methods
  bool computeHomography(const std::vector<cv::Point2f>& srcPoints,
                        const std::vector<cv::Point2f>& dstPoints,
                        const std::vector<cv::Point2f>& targetCorners,
                        std::vector<cv::Point2f>& transformedCorners,
                        std::vector<uchar>& inlierMask);

  float calculateConfidence(int numInliers, int totalMatches,
                           const std::vector<cv::Point2f>& corners,
                           const cv::Size& frameSize);

  bool validateHomography(const cv::Mat& H,
                         const std::vector<cv::Point2f>& corners);
};

} // namespace webar

#endif // FEATURE_DETECTOR_HPP
