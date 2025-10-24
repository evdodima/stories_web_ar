/**
 * Feature Detector Implementation
 */

#include "feature_detector.hpp"
#include <chrono>
#include <algorithm>

namespace webar {

FeatureDetector::FeatureDetector(const DetectorConfig& config)
  : config_(config) {
  // Initialize BRISK detector with lower threshold for more features
  // Parameters: threshold, octaves, patternScale
  // Lower threshold (10-20) detects more features
  // Default is 30 which is too conservative for AR tracking
  detector_ = cv::BRISK::create(
    15,    // threshold: lower = more features (default: 30)
    4,     // octaves: scale pyramid levels (default: 3)
    1.0f   // patternScale: sampling pattern scale
  );

  std::cerr << "[Detector] BRISK initialized with threshold=15, octaves=4" << std::endl;

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

    int detectedCount = keypoints.size();
    std::cerr << "[Detector] BRISK detected " << detectedCount
              << " features in " << frame.cols << "x" << frame.rows
              << " frame (max allowed: " << config_.maxFeatures << ")" << std::endl;

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
      std::cerr << "[Detector] Limited to " << config_.maxFeatures << " strongest features" << std::endl;
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
    const cv::Size& frameSize,
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

    std::cerr << "[Detector] Matching: target=" << targetDescriptors.rows
              << " descriptors, frame=" << frameDescriptors.rows
              << " descriptors, targetKpts=" << targetKeypoints.size() << std::endl;

    // Apply Lowe's ratio test
    std::vector<cv::DMatch> goodMatches;
    std::vector<cv::Point2f> srcPoints, dstPoints;

    int fallbackCount = 0;
    for (const auto& match : knnMatches) {
      if (match.size() >= 2) {
        if (match[0].distance < config_.matchRatioThreshold * match[1].distance) {
          goodMatches.push_back(match[0]);

          // Use actual target keypoint positions
          int targetIdx = match[0].queryIdx;
          int frameIdx = match[0].trainIdx;

          // IMPORTANT: Only add to srcPoints if we can also add to dstPoints
          // Otherwise we get size mismatch!
          bool validFrame = (frameIdx < static_cast<int>(frameKeypoints.size()));
          bool validTarget = (!targetKeypoints.empty() &&
                             targetIdx < static_cast<int>(targetKeypoints.size()));

          if (validFrame) {
            dstPoints.push_back(frameKeypoints[frameIdx].pt);

            if (validTarget) {
              srcPoints.push_back(targetKeypoints[targetIdx].pt);
            } else {
              // Fallback to dummy positions if keypoints not available
              srcPoints.push_back(cv::Point2f(targetIdx % 100, targetIdx / 100));
              fallbackCount++;
            }
          }
        }
      }
    }

    std::cerr << "[Detector] KNN matches: " << knnMatches.size()
              << ", good matches: " << goodMatches.size()
              << ", fallback positions: " << fallbackCount << std::endl;

    // Validate srcPoints and dstPoints have same size
    if (srcPoints.size() != dstPoints.size()) {
      std::cerr << "[Detector] ERROR: Point size mismatch! src=" << srcPoints.size()
                << ", dst=" << dstPoints.size() << std::endl;
      return false;
    }

    auto matchEnd = std::chrono::high_resolution_clock::now();
    lastStats_.matchingTimeMs =
      std::chrono::duration<double, std::milli>(matchEnd - matchStart).count();
    lastStats_.matchesFound = goodMatches.size();

    // Debug logging
    #ifdef DEBUG_MATCHING
    std::cout << "[Detector] KNN matches: " << knnMatches.size()
              << " -> Good matches after ratio test: " << goodMatches.size()
              << " (ratio=" << config_.matchRatioThreshold << ")" << std::endl;
    std::cout << "[Detector] Frame size for confidence: "
              << frameSize.width << "x" << frameSize.height << std::endl;
    #endif

    if (goodMatches.size() < static_cast<size_t>(config_.minInliers)) {
      return false;
    }

    // Compute homography
    auto homStart = std::chrono::high_resolution_clock::now();

    std::cerr << "[Detector] Target corners before transform: ["
              << targetCorners[0] << ", " << targetCorners[1] << ", "
              << targetCorners[2] << ", " << targetCorners[3] << "]" << std::endl;

    // Sample a few matches to verify
    if (srcPoints.size() >= 3) {
      std::cerr << "[Detector] Sample matches (target->frame):" << std::endl;
      for (size_t i = 0; i < std::min(size_t(3), srcPoints.size()); i++) {
        std::cerr << "  " << srcPoints[i] << " -> " << dstPoints[i] << std::endl;
      }
    }

    std::vector<cv::Point2f> transformedCorners;
    std::vector<uchar> inlierMask;

    if (!computeHomography(srcPoints, dstPoints, targetCorners,
                          transformedCorners, inlierMask)) {
      std::cerr << "[Detector] Homography computation failed!" << std::endl;
      return false;
    }

    auto homEnd = std::chrono::high_resolution_clock::now();
    lastStats_.homographyTimeMs =
      std::chrono::duration<double, std::milli>(homEnd - homStart).count();

    // Count inliers
    int numInliers = std::count(inlierMask.begin(), inlierMask.end(), 1);
    lastStats_.inliersFound = numInliers;

    std::cerr << "[Detector] Inliers: " << numInliers << "/" << goodMatches.size()
              << ", transformed corners: ["
              << transformedCorners[0] << ", " << transformedCorners[1] << ", "
              << transformedCorners[2] << ", " << transformedCorners[3] << "]" << std::endl;

    if (numInliers < config_.minInliers) {
      std::cerr << "[Detector] Too few inliers!" << std::endl;
      return false;
    }

    // Build result
    result.corners = transformedCorners;
    result.numInliers = numInliers;
    result.confidence = calculateConfidence(
      numInliers,
      goodMatches.size(),
      transformedCorners,
      frameSize);

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
    const cv::Size& frameSize,
    int maxResults) {

  std::vector<DetectionMatch> results;

  for (size_t i = 0; i < targetIds.size(); ++i) {
    DetectionMatch match;
    match.targetId = targetIds[i];

    if (matchTarget(frameDescriptors, frameKeypoints,
                   targetKeypoints[i], targetDescriptors[i],
                   targetCorners[i], frameSize, match)) {
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
    std::cerr << "[Detector] Invalid input for homography: srcSize="
              << srcPoints.size() << ", dstSize=" << dstPoints.size() << std::endl;
    return false;
  }

  if (targetCorners.size() != 4) {
    std::cerr << "[Detector] Invalid target corners count: " << targetCorners.size() << std::endl;
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
      std::cerr << "[Detector] findHomography returned empty matrix" << std::endl;
      return false;
    }

    std::cerr << "[Detector] Homography matrix computed with "
              << std::count(inlierMask.begin(), inlierMask.end(), 1)
              << " inliers from " << srcPoints.size() << " matches" << std::endl;

    // Transform target corners BEFORE validation to check them
    cv::perspectiveTransform(targetCorners, transformedCorners, H);

    // Validate homography with transformed corners
    if (!validateHomography(H, transformedCorners)) {
      std::cerr << "[Detector] Homography validation failed for corners: ["
                << transformedCorners[0] << ", " << transformedCorners[1] << ", "
                << transformedCorners[2] << ", " << transformedCorners[3] << "]" << std::endl;
      return false;
    }

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

  // Inlier count score: normalize to 0-1 range (50+ inliers = max score)
  float inlierCountScore = std::min(static_cast<float>(numInliers) / 50.0f, 1.0f);

  // Inlier ratio: penalize if too many outliers
  float inlierRatio = static_cast<float>(numInliers) /
                      static_cast<float>(totalMatches);

  // Combine: weight absolute count more heavily than ratio
  // This prevents low confidence when we have many good inliers but also many matches
  float matchScore = 0.7f * inlierCountScore + 0.3f * inlierRatio;

  // Geometry component: check if corners form a reasonable quadrilateral
  float geometryScore = 1.0f;

  // Check if corners are in frame bounds (allow some margin)
  int margin = 10;
  for (const auto& corner : corners) {
    if (corner.x < -margin || corner.x > frameSize.width + margin ||
        corner.y < -margin || corner.y > frameSize.height + margin) {
      geometryScore *= 0.7f;  // Less harsh penalty
    }
  }

  // Check for reasonable aspect ratio and area
  float width = cv::norm(corners[1] - corners[0]);
  float height = cv::norm(corners[3] - corners[0]);
  if (width > 0 && height > 0) {
    float aspectRatio = std::max(width / height, height / width);
    if (aspectRatio > 5.0f) {
      geometryScore *= 0.6f;
    }

    // Check if area is reasonable (not too small or too large)
    float area = width * height;
    float frameArea = frameSize.width * frameSize.height;
    float areaRatio = area / frameArea;
    if (areaRatio < 0.001f || areaRatio > 0.9f) {
      geometryScore *= 0.7f;
    }
  }

  #ifdef DEBUG_MATCHING
  std::cout << "[Detector] Confidence breakdown: "
            << "inlierCount=" << inlierCountScore
            << ", inlierRatio=" << inlierRatio
            << ", matchScore=" << matchScore
            << ", geometry=" << geometryScore
            << ", final=" << (matchScore * geometryScore) << std::endl;
  #endif

  return matchScore * geometryScore;
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

  // Check if corners form a valid quadrilateral (should be roughly convex)
  if (corners.size() == 4) {
    // Compute cross products to check if corners wind in consistent direction
    auto cross2d = [](const cv::Point2f& o, const cv::Point2f& a, const cv::Point2f& b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    };

    // Check edges wind in same direction (convexity check)
    float cross1 = cross2d(corners[0], corners[1], corners[2]);
    float cross2 = cross2d(corners[1], corners[2], corners[3]);
    float cross3 = cross2d(corners[2], corners[3], corners[0]);
    float cross4 = cross2d(corners[3], corners[0], corners[1]);

    // All crosses should have same sign for convex quadrilateral
    bool allPositive = (cross1 > 0 && cross2 > 0 && cross3 > 0 && cross4 > 0);
    bool allNegative = (cross1 < 0 && cross2 < 0 && cross3 < 0 && cross4 < 0);

    if (!allPositive && !allNegative) {
      std::cerr << "[Detector] Homography rejected: non-convex quadrilateral "
                << "(cross products: " << cross1 << ", " << cross2 << ", "
                << cross3 << ", " << cross4 << ")" << std::endl;
      return false;
    }

    // Check if edges have reasonable lengths (not degenerate)
    for (size_t i = 0; i < 4; ++i) {
      float edgeLength = cv::norm(corners[i] - corners[(i + 1) % 4]);
      if (edgeLength < 5.0f) {  // Minimum edge length in pixels
        std::cerr << "[Detector] Homography rejected: degenerate edge "
                  << i << " with length " << edgeLength << std::endl;
        return false;
      }
    }
  }

  return true;
}

} // namespace webar
