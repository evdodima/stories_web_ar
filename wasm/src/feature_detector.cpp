/**
 * Feature Detector Implementation
 */

#include "feature_detector.hpp"
#include <chrono>
#include <algorithm>

namespace webar {

FeatureDetector::FeatureDetector(const DetectorConfig& config)
  : config_(config) {
  // Initialize BRISK detector
  detector_ = cv::BRISK::create();

  // Initialize BFMatcher with HAMMING distance for binary descriptors
  matcher_ = cv::BFMatcher::create(cv::NORM_HAMMING, false);
}

FeatureDetector::~FeatureDetector() = default;

void FeatureDetector::setConfig(const DetectorConfig& config) {
  config_ = config;
}

bool FeatureDetector::detectAndCompute(
    const cv::Mat& frame,
    std::vector<cv::KeyPoint>& keypoints,
    cv::Mat& descriptors) {

  auto start = std::chrono::high_resolution_clock::now();

  keypoints.clear();
  descriptors.release();

  if (frame.empty()) {
    return false;
  }

  try {
    // Detect keypoints and compute descriptors
    detector_->detectAndCompute(frame, cv::noArray(),
                                keypoints, descriptors);

    // Limit number of features if needed
    if (static_cast<int>(keypoints.size()) > config_.maxFeatures) {
      // Sort by response (strongest features first)
      std::partial_sort(
        keypoints.begin(),
        keypoints.begin() + config_.maxFeatures,
        keypoints.end(),
        [](const cv::KeyPoint& a, const cv::KeyPoint& b) {
          return a.response > b.response;
        });

      keypoints.resize(config_.maxFeatures);
      descriptors = descriptors.rowRange(0, config_.maxFeatures);
    }

    auto end = std::chrono::high_resolution_clock::now();
    lastStats_.detectionTimeMs =
      std::chrono::duration<double, std::milli>(end - start).count();
    lastStats_.keypointsDetected = keypoints.size();

    return !keypoints.empty();
  } catch (const cv::Exception& e) {
    return false;
  }
}

bool FeatureDetector::matchTarget(
    const cv::Mat& frameDescriptors,
    const std::vector<cv::KeyPoint>& frameKeypoints,
    const std::vector<cv::KeyPoint>& targetKeypoints,
    const cv::Mat& targetDescriptors,
    const std::vector<cv::Point2f>& targetCorners,
    DetectionMatch& result) {

  auto matchStart = std::chrono::high_resolution_clock::now();

  if (frameDescriptors.empty() || targetDescriptors.empty()) {
    std::cerr << "[Detector] Empty descriptors!" << std::endl;
    return false;
  }

  if (targetKeypoints.empty()) {
    std::cerr << "[Detector] Warning: No target keypoints! Using fallback positions" << std::endl;
  }

  try {
    // KNN matching with k=2 for Lowe's ratio test
    std::vector<std::vector<cv::DMatch>> knnMatches;
    matcher_->knnMatch(targetDescriptors, frameDescriptors, knnMatches, 2);

    // Apply Lowe's ratio test
    std::vector<cv::DMatch> goodMatches;
    std::vector<cv::Point2f> srcPoints, dstPoints;

    for (const auto& match : knnMatches) {
      if (match.size() >= 2) {
        if (match[0].distance < config_.matchRatioThreshold * match[1].distance) {
          goodMatches.push_back(match[0]);

          // Use actual target keypoint positions
          int targetIdx = match[0].queryIdx;
          int frameIdx = match[0].trainIdx;

          if (!targetKeypoints.empty() && targetIdx < static_cast<int>(targetKeypoints.size())) {
            srcPoints.push_back(targetKeypoints[targetIdx].pt);
          } else {
            // Fallback to dummy positions if keypoints not available
            srcPoints.push_back(cv::Point2f(targetIdx % 100, targetIdx / 100));
          }

          if (frameIdx < static_cast<int>(frameKeypoints.size())) {
            dstPoints.push_back(frameKeypoints[frameIdx].pt);
          }
        }
      }
    }

    auto matchEnd = std::chrono::high_resolution_clock::now();
    lastStats_.matchingTimeMs =
      std::chrono::duration<double, std::milli>(matchEnd - matchStart).count();
    lastStats_.matchesFound = goodMatches.size();

    if (goodMatches.size() < static_cast<size_t>(config_.minInliers)) {
      return false;
    }

    // Compute homography
    auto homStart = std::chrono::high_resolution_clock::now();

    std::vector<cv::Point2f> transformedCorners;
    std::vector<uchar> inlierMask;

    if (!computeHomography(srcPoints, dstPoints, targetCorners,
                          transformedCorners, inlierMask)) {
      return false;
    }

    auto homEnd = std::chrono::high_resolution_clock::now();
    lastStats_.homographyTimeMs =
      std::chrono::duration<double, std::milli>(homEnd - homStart).count();

    // Count inliers
    int numInliers = std::count(inlierMask.begin(), inlierMask.end(), 1);
    lastStats_.inliersFound = numInliers;

    if (numInliers < config_.minInliers) {
      return false;
    }

    // Build result
    result.corners = transformedCorners;
    result.numInliers = numInliers;
    result.confidence = calculateConfidence(
      numInliers,
      goodMatches.size(),
      transformedCorners,
      cv::Size(frameKeypoints.empty() ? 640 :
              static_cast<int>(frameKeypoints.back().pt.x),
              frameKeypoints.empty() ? 480 :
              static_cast<int>(frameKeypoints.back().pt.y)));

    // Store inlier matches
    for (size_t i = 0; i < goodMatches.size() && i < inlierMask.size(); ++i) {
      if (inlierMask[i]) {
        result.inliers.push_back(goodMatches[i]);
      }
    }

    return true;
  } catch (const cv::Exception& e) {
    return false;
  }
}

std::vector<DetectionMatch> FeatureDetector::matchMultipleTargets(
    const cv::Mat& frameDescriptors,
    const std::vector<cv::KeyPoint>& frameKeypoints,
    const std::vector<std::string>& targetIds,
    const std::vector<std::vector<cv::KeyPoint>>& targetKeypoints,
    const std::vector<cv::Mat>& targetDescriptors,
    const std::vector<std::vector<cv::Point2f>>& targetCorners,
    int maxResults) {

  std::vector<DetectionMatch> results;

  for (size_t i = 0; i < targetIds.size(); ++i) {
    DetectionMatch match;
    match.targetId = targetIds[i];

    if (matchTarget(frameDescriptors, frameKeypoints,
                   targetKeypoints[i], targetDescriptors[i],
                   targetCorners[i], match)) {
      results.push_back(match);
    }
  }

  // Sort by confidence (highest first)
  std::sort(results.begin(), results.end(),
           [](const DetectionMatch& a, const DetectionMatch& b) {
             return a.confidence > b.confidence;
           });

  // Limit results
  if (results.size() > static_cast<size_t>(maxResults)) {
    results.resize(maxResults);
  }

  return results;
}

bool FeatureDetector::computeHomography(
    const std::vector<cv::Point2f>& srcPoints,
    const std::vector<cv::Point2f>& dstPoints,
    const std::vector<cv::Point2f>& targetCorners,
    std::vector<cv::Point2f>& transformedCorners,
    std::vector<uchar>& inlierMask) {

  if (srcPoints.size() < 4 || srcPoints.size() != dstPoints.size()) {
    return false;
  }

  try {
    // Find homography with RANSAC
    cv::Mat H = cv::findHomography(
      srcPoints,
      dstPoints,
      cv::RANSAC,
      config_.ransacThreshold,
      inlierMask,
      config_.ransacIterations);

    if (H.empty()) {
      return false;
    }

    // Validate homography
    if (!validateHomography(H, targetCorners)) {
      return false;
    }

    // Transform target corners
    cv::perspectiveTransform(targetCorners, transformedCorners, H);

    return true;
  } catch (const cv::Exception& e) {
    return false;
  }
}

float FeatureDetector::calculateConfidence(
    int numInliers,
    int totalMatches,
    const std::vector<cv::Point2f>& corners,
    const cv::Size& frameSize) {

  if (totalMatches == 0 || corners.size() != 4) {
    return 0.0f;
  }

  // Inlier ratio component (0-1)
  float inlierRatio = static_cast<float>(numInliers) /
                      static_cast<float>(totalMatches);

  // Geometry component: check if corners form a reasonable quadrilateral
  float geometryScore = 1.0f;

  // Check if corners are in frame bounds
  for (const auto& corner : corners) {
    if (corner.x < 0 || corner.x > frameSize.width ||
        corner.y < 0 || corner.y > frameSize.height) {
      geometryScore *= 0.5f;
    }
  }

  // Check for reasonable aspect ratio and area
  float width = cv::norm(corners[1] - corners[0]);
  float height = cv::norm(corners[3] - corners[0]);
  if (width > 0 && height > 0) {
    float aspectRatio = std::max(width / height, height / width);
    if (aspectRatio > 5.0f) {
      geometryScore *= 0.5f;
    }
  }

  return inlierRatio * geometryScore;
}

bool FeatureDetector::validateHomography(
    const cv::Mat& H,
    const std::vector<cv::Point2f>& corners) {

  if (H.rows != 3 || H.cols != 3) {
    return false;
  }

  // Check for nan or inf
  for (int i = 0; i < 3; ++i) {
    for (int j = 0; j < 3; ++j) {
      double val = H.at<double>(i, j);
      if (std::isnan(val) || std::isinf(val)) {
        return false;
      }
    }
  }

  // Check determinant (should not be too small)
  double det = cv::determinant(H);
  if (std::abs(det) < 1e-6) {
    return false;
  }

  return true;
}

} // namespace webar
