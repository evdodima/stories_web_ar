/**
 * Target Manager Implementation
 */

#include "target_manager.hpp"
#include <chrono>
#include <algorithm>

namespace webar {

TargetManager::TargetManager(const TargetManagerConfig& config)
  : config_(config) {}

TargetManager::~TargetManager() = default;

void TargetManager::setConfig(const TargetManagerConfig& config) {
  config_ = config;
}

bool TargetManager::addTarget(
    const std::string& id,
    const cv::Mat& descriptors,
    const std::vector<cv::Point2f>& corners,
    const std::vector<uint8_t>& vocabData) {

  // Call overloaded version with empty keypoints
  return addTarget(id, std::vector<cv::KeyPoint>(), descriptors, corners, vocabData);
}

bool TargetManager::addTarget(
    const std::string& id,
    const std::vector<cv::KeyPoint>& keypoints,
    const cv::Mat& descriptors,
    const std::vector<cv::Point2f>& corners,
    const std::vector<uint8_t>& vocabData) {

  if (descriptors.empty() || corners.size() != 4) {
    return false;
  }

  Target target;
  target.id = id;
  target.keypoints = keypoints;
  descriptors.copyTo(target.descriptors);
  target.corners = corners;
  target.vocabularyData = vocabData;

  // Compute bounding box
  float minX = corners[0].x, maxX = corners[0].x;
  float minY = corners[0].y, maxY = corners[0].y;
  for (const auto& corner : corners) {
    minX = std::min(minX, corner.x);
    maxX = std::max(maxX, corner.x);
    minY = std::min(minY, corner.y);
    maxY = std::max(maxY, corner.y);
  }
  target.imageSize = cv::Size(
    static_cast<int>(maxX - minX),
    static_cast<int>(maxY - minY));

  targets_[id] = target;

  return true;
}

bool TargetManager::removeTarget(const std::string& id) {
  return targets_.erase(id) > 0;
}

void TargetManager::clearTargets() {
  targets_.clear();
  vocabularyTree_.clear();
}

bool TargetManager::hasTarget(const std::string& id) const {
  return targets_.find(id) != targets_.end();
}

const Target* TargetManager::getTarget(const std::string& id) const {
  auto it = targets_.find(id);
  if (it != targets_.end()) {
    return &it->second;
  }
  return nullptr;
}

std::vector<std::string> TargetManager::getAllTargetIds() const {
  std::vector<std::string> ids;
  ids.reserve(targets_.size());
  for (const auto& [id, target] : targets_) {
    ids.push_back(id);
  }
  return ids;
}

int TargetManager::getTargetCount() const {
  return static_cast<int>(targets_.size());
}

std::vector<std::string> TargetManager::queryCandidates(
    const cv::Mat& frameDescriptors,
    int maxCandidates) {

  auto start = std::chrono::high_resolution_clock::now();

  std::vector<std::string> candidates;

  if (!config_.useVocabularyTree || vocabularyTree_.empty()) {
    // Return all targets if vocabulary tree not available
    candidates = getAllTargetIds();
  } else {
    // Simplified vocabulary tree query
    // In production, this would use actual vocabulary tree traversal
    // For now, return targets based on descriptor similarity heuristic

    struct TargetScore {
      std::string id;
      float score;
    };
    std::vector<TargetScore> scores;

    // Simple heuristic: use descriptor count similarity
    int frameDescCount = frameDescriptors.rows;

    for (const auto& [id, target] : targets_) {
      int targetDescCount = target.descriptors.rows;
      float diff = std::abs(frameDescCount - targetDescCount);
      float score = 1.0f / (1.0f + diff / 100.0f);
      scores.push_back({id, score});
    }

    // Sort by score
    std::sort(scores.begin(), scores.end(),
             [](const TargetScore& a, const TargetScore& b) {
               return a.score > b.score;
             });

    // Take top candidates
    int count = std::min(maxCandidates, static_cast<int>(scores.size()));
    for (int i = 0; i < count; ++i) {
      candidates.push_back(scores[i].id);
    }
  }

  auto end = std::chrono::high_resolution_clock::now();
  lastStats_.queryTimeMs =
    std::chrono::duration<double, std::milli>(end - start).count();
  lastStats_.targetsQueried = targets_.size();
  lastStats_.candidatesReturned = candidates.size();

  return candidates;
}

TargetManager::TargetBatch TargetManager::getTargetBatch(
    const std::vector<std::string>& ids) const {

  TargetBatch batch;

  for (const auto& id : ids) {
    auto it = targets_.find(id);
    if (it != targets_.end()) {
      batch.ids.push_back(id);
      batch.keypoints.push_back(it->second.keypoints);
      batch.descriptors.push_back(it->second.descriptors);
      batch.corners.push_back(it->second.corners);
    }
  }

  return batch;
}

TargetManager::TargetBatch TargetManager::getAllTargets() const {
  return getTargetBatch(getAllTargetIds());
}

void TargetManager::buildVocabularyTree() {
  // Placeholder for vocabulary tree construction
  // In production, this would build a k-means tree from all target descriptors
  vocabularyTree_.clear();
}

std::vector<int> TargetManager::describeDescriptors(
    const cv::Mat& descriptors) {
  // Placeholder for descriptor-to-vocabulary-path mapping
  // Returns vocabulary tree path for given descriptors
  return std::vector<int>();
}

float TargetManager::computeSimilarity(
    const std::vector<int>& path1,
    const std::vector<int>& path2) {
  // Compute similarity between two vocabulary tree paths
  if (path1.empty() || path2.empty()) {
    return 0.0f;
  }

  int commonDepth = 0;
  for (size_t i = 0; i < std::min(path1.size(), path2.size()); ++i) {
    if (path1[i] == path2[i]) {
      ++commonDepth;
    } else {
      break;
    }
  }

  return static_cast<float>(commonDepth) /
         static_cast<float>(std::max(path1.size(), path2.size()));
}

} // namespace webar
