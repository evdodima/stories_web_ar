/**
 * Memory Pool Implementation
 */

#include "memory_pool.hpp"
#include <algorithm>

namespace webar {

MemoryPool::MemoryPool(const MemoryPoolConfig& config)
  : config_(config) {
  // Pre-allocate frame buffers
  framePool_.resize(config.maxFrames);
  descriptorPool_.resize(config.maxDescriptors);
  pointVectorPool_.resize(config.maxPointVectors);
}

MemoryPool::~MemoryPool() {
  clear();
}

void MemoryPool::setConfig(const MemoryPoolConfig& config) {
  config_ = config;
}

MemoryPool::FramePtr MemoryPool::acquireFrame(
    int width, int height, int type) {
  return acquireFrame(cv::Size(width, height), type);
}

MemoryPool::FramePtr MemoryPool::acquireFrame(
    const cv::Size& size, int type) {

  std::lock_guard<std::mutex> lock(frameMutex_);

  // Find available buffer with matching size/type
  for (auto& buffer : framePool_) {
    if (!buffer.inUse &&
        !buffer.mat.empty() &&
        buffer.mat.size() == size &&
        buffer.mat.type() == type) {
      buffer.inUse = true;
      return FramePtr(&buffer.mat,
                     [this](cv::Mat* mat) { releaseFrame(mat); });
    }
  }

  // Find empty buffer and allocate
  for (auto& buffer : framePool_) {
    if (!buffer.inUse) {
      buffer.mat = cv::Mat(size, type);
      buffer.inUse = true;
      return FramePtr(&buffer.mat,
                     [this](cv::Mat* mat) { releaseFrame(mat); });
    }
  }

  // No available buffers, create temporary (not pooled)
  cv::Mat* temp = new cv::Mat(size, type);
  return FramePtr(temp, [](cv::Mat* mat) { delete mat; });
}

MemoryPool::DescriptorPtr MemoryPool::acquireDescriptors(
    int rows, int cols, int type) {

  std::lock_guard<std::mutex> lock(descriptorMutex_);

  // Find available buffer
  for (auto& buffer : descriptorPool_) {
    if (!buffer.inUse &&
        !buffer.mat.empty() &&
        buffer.mat.rows >= rows &&
        buffer.mat.cols == cols &&
        buffer.mat.type() == type) {
      buffer.inUse = true;
      // Return a view with correct row count
      cv::Mat* view = new cv::Mat(buffer.mat.rowRange(0, rows));
      return DescriptorPtr(view,
                          [this, &buffer](cv::Mat* mat) {
                            delete mat;
                            releaseDescriptor(&buffer.mat);
                          });
    }
  }

  // Find empty buffer and allocate
  for (auto& buffer : descriptorPool_) {
    if (!buffer.inUse) {
      buffer.mat = cv::Mat(rows, cols, type);
      buffer.inUse = true;
      return DescriptorPtr(&buffer.mat,
                          [this](cv::Mat* mat) { releaseDescriptor(mat); });
    }
  }

  // No available buffers, create temporary
  cv::Mat* temp = new cv::Mat(rows, cols, type);
  return DescriptorPtr(temp, [](cv::Mat* mat) { delete mat; });
}

MemoryPool::PointVectorPtr MemoryPool::acquirePointVector(size_t capacity) {
  std::lock_guard<std::mutex> lock(pointVectorMutex_);

  // Find available buffer
  for (auto& buffer : pointVectorPool_) {
    if (!buffer.inUse) {
      buffer.vec.clear();
      if (capacity > 0) {
        buffer.vec.reserve(capacity);
      }
      buffer.inUse = true;
      return PointVectorPtr(&buffer.vec,
                           [this](std::vector<cv::Point2f>* vec) {
                             releasePointVector(vec);
                           });
    }
  }

  // No available buffers, create temporary
  auto* temp = new std::vector<cv::Point2f>();
  if (capacity > 0) {
    temp->reserve(capacity);
  }
  return PointVectorPtr(temp,
                       [](std::vector<cv::Point2f>* vec) { delete vec; });
}

MemoryPool::PoolStats MemoryPool::getStats() const {
  PoolStats stats;

  {
    std::lock_guard<std::mutex> lock(frameMutex_);
    for (const auto& buffer : framePool_) {
      if (!buffer.mat.empty()) {
        ++stats.framesAllocated;
        if (!buffer.inUse) {
          ++stats.framesAvailable;
        }
      }
    }
  }

  {
    std::lock_guard<std::mutex> lock(descriptorMutex_);
    for (const auto& buffer : descriptorPool_) {
      if (!buffer.mat.empty()) {
        ++stats.descriptorsAllocated;
        if (!buffer.inUse) {
          ++stats.descriptorsAvailable;
        }
      }
    }
  }

  {
    std::lock_guard<std::mutex> lock(pointVectorMutex_);
    for (const auto& buffer : pointVectorPool_) {
      if (!buffer.vec.empty()) {
        ++stats.pointVectorsAllocated;
      }
      if (!buffer.inUse) {
        ++stats.pointVectorsAvailable;
      }
    }
  }

  stats.totalMemoryBytes = calculateMemoryUsage();

  return stats;
}

void MemoryPool::clear() {
  {
    std::lock_guard<std::mutex> lock(frameMutex_);
    for (auto& buffer : framePool_) {
      if (!buffer.inUse) {
        buffer.mat.release();
      }
    }
  }

  {
    std::lock_guard<std::mutex> lock(descriptorMutex_);
    for (auto& buffer : descriptorPool_) {
      if (!buffer.inUse) {
        buffer.mat.release();
      }
    }
  }

  {
    std::lock_guard<std::mutex> lock(pointVectorMutex_);
    for (auto& buffer : pointVectorPool_) {
      if (!buffer.inUse) {
        buffer.vec.clear();
        buffer.vec.shrink_to_fit();
      }
    }
  }
}

void MemoryPool::releaseFrame(cv::Mat* frame) {
  std::lock_guard<std::mutex> lock(frameMutex_);

  for (auto& buffer : framePool_) {
    if (&buffer.mat == frame) {
      buffer.inUse = false;
      return;
    }
  }
}

void MemoryPool::releaseDescriptor(cv::Mat* descriptor) {
  std::lock_guard<std::mutex> lock(descriptorMutex_);

  for (auto& buffer : descriptorPool_) {
    if (&buffer.mat == descriptor) {
      buffer.inUse = false;
      return;
    }
  }
}

void MemoryPool::releasePointVector(std::vector<cv::Point2f>* vec) {
  std::lock_guard<std::mutex> lock(pointVectorMutex_);

  for (auto& buffer : pointVectorPool_) {
    if (&buffer.vec == vec) {
      buffer.inUse = false;
      return;
    }
  }
}

size_t MemoryPool::calculateMemoryUsage() const {
  size_t total = 0;

  {
    std::lock_guard<std::mutex> lock(frameMutex_);
    for (const auto& buffer : framePool_) {
      if (!buffer.mat.empty()) {
        total += buffer.mat.total() * buffer.mat.elemSize();
      }
    }
  }

  {
    std::lock_guard<std::mutex> lock(descriptorMutex_);
    for (const auto& buffer : descriptorPool_) {
      if (!buffer.mat.empty()) {
        total += buffer.mat.total() * buffer.mat.elemSize();
      }
    }
  }

  {
    std::lock_guard<std::mutex> lock(pointVectorMutex_);
    for (const auto& buffer : pointVectorPool_) {
      total += buffer.vec.capacity() * sizeof(cv::Point2f);
    }
  }

  return total;
}

} // namespace webar
