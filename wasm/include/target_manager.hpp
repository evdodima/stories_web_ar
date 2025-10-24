/**
 * Target Manager - Manages target database and vocabulary tree queries
 * Handles target storage, retrieval, and candidate filtering
 */

#ifndef TARGET_MANAGER_HPP
#define TARGET_MANAGER_HPP

#include <opencv2/opencv.hpp>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>

namespace webar {

/**
 * Target data structure
 */
struct Target {
  std::string id;
  cv::Mat descriptors;
  std::vector<cv::Point2f> corners;  // Reference image corners
  std::vector<cv::KeyPoint> keypoints;
  std::vector<uint8_t> vocabularyData;  // For vocabulary tree filtering
  cv::Size imageSize;

  Target() = default;
};

/**
 * Vocabulary tree node (simplified structure)
 * Used for fast candidate filtering
 */
struct VocabNode {
  int id;
  std::vector<float> descriptor;
  std::vector<int> children;
  std::vector<std::string> targetIds;  // Targets that visit this node

  VocabNode() : id(-1) {}
};

/**
 * Target manager configuration
 */
struct TargetManagerConfig {
  int maxCandidates = 3;  // Max targets to return from vocabulary query
  bool useVocabularyTree = true;
  float vocabularyThreshold = 0.8f;

  TargetManagerConfig() = default;
};

/**
 * Target manager
 * Stores target database and provides efficient candidate filtering
 */
class TargetManager {
public:
  explicit TargetManager(const TargetManagerConfig& config =
                        TargetManagerConfig());
  ~TargetManager();

  // Configuration
  void setConfig(const TargetManagerConfig& config);
  TargetManagerConfig getConfig() const { return config_; }

  // Target management
  bool addTarget(const std::string& id,
                const cv::Mat& descriptors,
                const std::vector<cv::Point2f>& corners,
                const std::vector<uint8_t>& vocabData = std::vector<uint8_t>());

  // Add target with keypoints (preferred)
  bool addTarget(const std::string& id,
                const std::vector<cv::KeyPoint>& keypoints,
                const cv::Mat& descriptors,
                const std::vector<cv::Point2f>& corners,
                const std::vector<uint8_t>& vocabData = std::vector<uint8_t>());

  bool removeTarget(const std::string& id);
  void clearTargets();
  bool hasTarget(const std::string& id) const;

  // Target retrieval
  const Target* getTarget(const std::string& id) const;
  std::vector<std::string> getAllTargetIds() const;
  int getTargetCount() const;

  // Vocabulary tree queries
  std::vector<std::string> queryCandidates(
    const cv::Mat& frameDescriptors,
    int maxCandidates = 3);

  // Get multiple targets (useful for batch processing)
  struct TargetBatch {
    std::vector<std::string> ids;
    std::vector<std::vector<cv::KeyPoint>> keypoints;
    std::vector<cv::Mat> descriptors;
    std::vector<std::vector<cv::Point2f>> corners;
  };

  TargetBatch getTargetBatch(const std::vector<std::string>& ids) const;
  TargetBatch getAllTargets() const;

  // Statistics
  struct QueryStats {
    int targetsQueried = 0;
    int candidatesReturned = 0;
    double queryTimeMs = 0.0;
  };

  QueryStats getLastStats() const { return lastStats_; }

private:
  TargetManagerConfig config_;
  std::unordered_map<std::string, Target> targets_;
  std::vector<VocabNode> vocabularyTree_;
  QueryStats lastStats_;

  // Helper methods
  void buildVocabularyTree();
  std::vector<int> describeDescriptors(const cv::Mat& descriptors);
  float computeSimilarity(const std::vector<int>& path1,
                         const std::vector<int>& path2);
};

} // namespace webar

#endif // TARGET_MANAGER_HPP
