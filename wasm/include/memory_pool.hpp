/**
 * Memory Pool - Pre-allocated cv::Mat pool for zero-copy operations
 * Reduces memory allocation overhead and prevents fragmentation
 */

#ifndef MEMORY_POOL_HPP
#define MEMORY_POOL_HPP

#include <opencv2/opencv.hpp>
#include <vector>
#include <memory>
#include <mutex>

namespace webar {

/**
 * Memory pool configuration
 */
struct MemoryPoolConfig {
  int maxFrames = 4;           // Max frame buffers
  int maxDescriptors = 4;      // Max descriptor matrices
  int maxPointVectors = 8;     // Max point vector buffers
  cv::Size defaultFrameSize = cv::Size(640, 480);
  int defaultDescriptorRows = 1000;

  MemoryPoolConfig() = default;
};

/**
 * Pooled resource handle (RAII wrapper)
 */
template<typename T>
class PooledResource {
public:
  PooledResource(T* resource, std::function<void(T*)> deleter)
    : resource_(resource), deleter_(deleter) {}

  ~PooledResource() {
    if (resource_ && deleter_) {
      deleter_(resource_);
    }
  }

  // Non-copyable but movable
  PooledResource(const PooledResource&) = delete;
  PooledResource& operator=(const PooledResource&) = delete;

  PooledResource(PooledResource&& other) noexcept
    : resource_(other.resource_), deleter_(std::move(other.deleter_)) {
    other.resource_ = nullptr;
  }

  PooledResource& operator=(PooledResource&& other) noexcept {
    if (this != &other) {
      if (resource_ && deleter_) {
        deleter_(resource_);
      }
      resource_ = other.resource_;
      deleter_ = std::move(other.deleter_);
      other.resource_ = nullptr;
    }
    return *this;
  }

  T* get() { return resource_; }
  const T* get() const { return resource_; }
  T& operator*() { return *resource_; }
  const T& operator*() const { return *resource_; }
  T* operator->() { return resource_; }
  const T* operator->() const { return resource_; }

private:
  T* resource_;
  std::function<void(T*)> deleter_;
};

/**
 * Memory pool for OpenCV matrices and buffers
 * Thread-safe resource pooling
 */
class MemoryPool {
public:
  explicit MemoryPool(const MemoryPoolConfig& config = MemoryPoolConfig());
  ~MemoryPool();

  // Configuration
  void setConfig(const MemoryPoolConfig& config);
  MemoryPoolConfig getConfig() const { return config_; }

  // Frame buffer acquisition
  using FramePtr = PooledResource<cv::Mat>;
  FramePtr acquireFrame(int width, int height, int type = CV_8UC3);
  FramePtr acquireFrame(const cv::Size& size, int type = CV_8UC3);

  // Descriptor buffer acquisition
  using DescriptorPtr = PooledResource<cv::Mat>;
  DescriptorPtr acquireDescriptors(int rows, int cols, int type = CV_8U);

  // Point vector acquisition
  using PointVectorPtr = PooledResource<std::vector<cv::Point2f>>;
  PointVectorPtr acquirePointVector(size_t capacity = 0);

  // Statistics
  struct PoolStats {
    int framesAllocated = 0;
    int framesAvailable = 0;
    int descriptorsAllocated = 0;
    int descriptorsAvailable = 0;
    int pointVectorsAllocated = 0;
    int pointVectorsAvailable = 0;
    size_t totalMemoryBytes = 0;
  };

  PoolStats getStats() const;
  void clear();

private:
  MemoryPoolConfig config_;

  // Frame pool
  struct FrameBuffer {
    cv::Mat mat;
    bool inUse;
    FrameBuffer() : inUse(false) {}
  };
  std::vector<FrameBuffer> framePool_;
  mutable std::mutex frameMutex_;

  // Descriptor pool
  struct DescriptorBuffer {
    cv::Mat mat;
    bool inUse;
    DescriptorBuffer() : inUse(false) {}
  };
  std::vector<DescriptorBuffer> descriptorPool_;
  mutable std::mutex descriptorMutex_;

  // Point vector pool
  struct PointVectorBuffer {
    std::vector<cv::Point2f> vec;
    bool inUse;
    PointVectorBuffer() : inUse(false) {}
  };
  std::vector<PointVectorBuffer> pointVectorPool_;
  mutable std::mutex pointVectorMutex_;

  // Helper methods
  void releaseFrame(cv::Mat* frame);
  void releaseDescriptor(cv::Mat* descriptor);
  void releasePointVector(std::vector<cv::Point2f>* vec);

  size_t calculateMemoryUsage() const;
};

} // namespace webar

#endif // MEMORY_POOL_HPP
