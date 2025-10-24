/**
 * Standalone test program for WebAR WASM engine
 * Tests target loading and tracking with real images
 */

#include <iostream>
#include <fstream>
#include <vector>
#include <chrono>
#include <opencv2/opencv.hpp>
#include "include/ar_engine.hpp"
#include "include/json.hpp"

#include <sstream>

using json = nlohmann::json;

using namespace webar;

// ========================================
// TEST MODE CONFIGURATION
// ========================================
// Set these flags to configure what to test

// Detection-only mode: runs feature matching on every frame without tracking
// Set to true to test only detection and matching performance
// Set to false for full tracking with optical flow
const bool DETECTION_ONLY_MODE = true;

// Additional config flags
const bool ENABLE_PROFILING = true;      // Show detailed timing logs
const int MAX_FEATURES = 800;            // Maximum features to extract per frame
const float MATCH_RATIO = 0.7f;          // Lowe's ratio test threshold
const int RANSAC_ITERATIONS = 2000;      // RANSAC homography iterations
const float RANSAC_THRESHOLD = 3.0f;     // RANSAC inlier threshold (pixels)

// Optical flow config (only used when DETECTION_ONLY_MODE = false)
const int TRACKING_POINTS = 50;          // Points for optical flow tracking
const int DETECTION_INTERVAL = 5;        // Run detection every N frames

// ========================================

/**
 * Load target database from JSON file
 * Parses JSON and loads all targets into the engine
 */
bool loadTargetDatabase(AREngine& engine, const std::string& dbPath) {
    std::cout << "[Test] Loading database: " << dbPath << std::endl;

    std::ifstream file(dbPath);
    if (!file.is_open()) {
        std::cerr << "[Test] Failed to open database file!" << std::endl;
        return false;
    }

    // Parse JSON
    json db;
    try {
        file >> db;
    } catch (const json::exception& e) {
        std::cerr << "[Test] JSON parse error: " << e.what() << std::endl;
        return false;
    }

    // Check metadata
    if (!db.contains("metadata") || !db.contains("targets")) {
        std::cerr << "[Test] Invalid database format: missing metadata or targets" << std::endl;
        return false;
    }

    auto metadata = db["metadata"];
    std::cout << "[Test] Database metadata:" << std::endl;
    std::cout << "  - Targets: " << metadata["num_targets"] << std::endl;
    std::cout << "  - Descriptor type: " << metadata["descriptor_type"] << std::endl;
    std::cout << "  - Descriptor bytes: " << metadata["descriptor_bytes"] << std::endl;

    // Load each target
    auto targets = db["targets"];
    int loadedCount = 0;
    int failedCount = 0;

    for (const auto& target : targets) {
        try {
            std::string id = target["id"];
            std::cout << "\n[Test] Loading target: " << id << std::endl;

            // Parse keypoints
            auto keypointsData = target["keypoints"];
            int numKeypoints = keypointsData.size();

            std::cout << "  - Keypoints: " << numKeypoints << std::endl;

            if (numKeypoints == 0) {
                std::cerr << "  - Warning: No keypoints found, skipping" << std::endl;
                failedCount++;
                continue;
            }

            std::vector<cv::KeyPoint> keypoints;
            keypoints.reserve(numKeypoints);

            for (const auto& kp : keypointsData) {
                cv::KeyPoint keypoint;
                // Keypoints are stored as [x, y] arrays
                if (kp.is_array() && kp.size() >= 2) {
                    keypoint.pt.x = kp[0];
                    keypoint.pt.y = kp[1];
                    keypoint.size = kp.size() >= 3 ? static_cast<float>(kp[2]) : 1.0f;
                    keypoint.angle = kp.size() >= 4 ? static_cast<float>(kp[3]) : -1.0f;
                    keypoint.response = kp.size() >= 5 ? static_cast<float>(kp[4]) : 0.0f;
                    keypoint.octave = kp.size() >= 6 ? static_cast<int>(kp[5]) : 0;
                } else if (kp.is_object()) {
                    // Alternative format with x/y keys
                    keypoint.pt.x = kp["x"];
                    keypoint.pt.y = kp["y"];
                    keypoint.size = kp.contains("size") ? static_cast<float>(kp["size"]) : 1.0f;
                    keypoint.angle = kp.contains("angle") ? static_cast<float>(kp["angle"]) : -1.0f;
                    keypoint.response = kp.contains("response") ? static_cast<float>(kp["response"]) : 0.0f;
                    keypoint.octave = kp.contains("octave") ? static_cast<int>(kp["octave"]) : 0;
                }
                keypoints.push_back(keypoint);
            }

            // Parse descriptors
            auto descriptorsData = target["descriptors"];
            int numDescriptors = descriptorsData.size();
            int descriptorBytes = metadata["descriptor_bytes"];

            std::cout << "  - Descriptors: " << numDescriptors << std::endl;

            if (numDescriptors == 0 || numDescriptors != numKeypoints) {
                std::cerr << "  - Warning: Descriptor/keypoint mismatch ("
                          << numDescriptors << " vs " << numKeypoints << "), skipping" << std::endl;
                failedCount++;
                continue;
            }

            // Create descriptor matrix
            cv::Mat descriptors(numDescriptors, descriptorBytes, CV_8U);

            for (int i = 0; i < numDescriptors; i++) {
                auto desc = descriptorsData[i];
                for (int j = 0; j < descriptorBytes; j++) {
                    descriptors.at<uint8_t>(i, j) = desc[j];
                }
            }

            // Parse image size from metadata
            auto imageMeta = target["image_meta"];
            int width = imageMeta["width"];
            int height = imageMeta["height"];

            // Create corners for reference image
            std::vector<cv::Point2f> corners = {
                cv::Point2f(0, 0),
                cv::Point2f(width, 0),
                cv::Point2f(width, height),
                cv::Point2f(0, height)
            };

            // Parse vocabulary data if available
            std::vector<uint8_t> vocabData;
            if (target.contains("bow")) {
                auto bow = target["bow"];
                for (const auto& val : bow) {
                    vocabData.push_back(static_cast<uint8_t>(val));
                }
            }

            // Add target to engine with keypoints
            bool success = engine.addTarget(id, keypoints, descriptors, corners, vocabData);

            if (success) {
                std::cout << "  - Successfully loaded!" << std::endl;
                loadedCount++;
            } else {
                std::cerr << "  - Failed to add to engine!" << std::endl;
                failedCount++;
            }

        } catch (const json::exception& e) {
            std::cerr << "  - Error parsing target: " << e.what() << std::endl;
            failedCount++;
        } catch (const std::exception& e) {
            std::cerr << "  - Error loading target: " << e.what() << std::endl;
            failedCount++;
        }
    }

    std::cout << "\n[Test] Database loading complete:" << std::endl;
    std::cout << "  - Loaded: " << loadedCount << " targets" << std::endl;
    std::cout << "  - Failed: " << failedCount << " targets" << std::endl;

    return loadedCount > 0;
}

/**
 * Create a simple test target manually
 */
bool createTestTarget(AREngine& engine) {
    std::cout << "[Test] Creating test target with BRISK features..." << std::endl;

    // Load reference image
    cv::Mat refImage = cv::imread("../targets/reference.jpg", cv::IMREAD_GRAYSCALE);
    if (refImage.empty()) {
        std::cerr << "[Test] Failed to load reference image!" << std::endl;
        return false;
    }

    std::cout << "[Test] Reference image loaded: " << refImage.cols << "x" << refImage.rows << std::endl;

    // Extract BRISK features
    cv::Ptr<cv::BRISK> brisk = cv::BRISK::create(30, 3, 1.0f);
    std::vector<cv::KeyPoint> keypoints;
    cv::Mat descriptors;

    brisk->detectAndCompute(refImage, cv::noArray(), keypoints, descriptors);

    std::cout << "[Test] Extracted " << keypoints.size() << " keypoints" << std::endl;
    std::cout << "[Test] Descriptor size: " << descriptors.rows << "x" << descriptors.cols << std::endl;

    if (descriptors.empty()) {
        std::cerr << "[Test] No features extracted!" << std::endl;
        return false;
    }

    // Create corners for reference image
    std::vector<cv::Point2f> corners = {
        cv::Point2f(0, 0),
        cv::Point2f(refImage.cols, 0),
        cv::Point2f(refImage.cols, refImage.rows),
        cv::Point2f(0, refImage.rows)
    };

    // Add target to engine
    std::vector<uint8_t> emptyVocab;
    bool success = engine.addTarget("reference", descriptors, corners, emptyVocab);

    if (success) {
        std::cout << "[Test] Target 'reference' added successfully!" << std::endl;
    } else {
        std::cerr << "[Test] Failed to add target!" << std::endl;
    }

    return success;
}

/**
 * Process and display tracking results on frame
 */
void drawTrackingResults(cv::Mat& frame, const std::vector<TrackingResult>& results) {
    for (const auto& result : results) {
        if (result.detected) {
            // Draw tracking rectangle
            for (size_t i = 0; i < result.corners.size(); i++) {
                cv::Point p1 = cv::Point(result.corners[i].x, result.corners[i].y);
                cv::Point p2 = cv::Point(result.corners[(i+1) % result.corners.size()].x,
                                        result.corners[(i+1) % result.corners.size()].y);
                cv::line(frame, p1, p2, cv::Scalar(0, 255, 0), 3);
                cv::circle(frame, p1, 5, cv::Scalar(0, 0, 255), -1);
            }

            // Draw target ID and confidence
            cv::Point2f center(0, 0);
            for (const auto& corner : result.corners) {
                center.x += corner.x;
                center.y += corner.y;
            }
            center.x /= result.corners.size();
            center.y /= result.corners.size();

            std::string label = result.targetId + " (" +
                               std::to_string((int)(result.confidence * 100)) + "%)";
            cv::putText(frame, label, cv::Point(center.x - 50, center.y),
                       cv::FONT_HERSHEY_SIMPLEX, 0.6, cv::Scalar(255, 255, 0), 2);
        }
    }
}

/**
 * Run realtime camera tracking
 */
void runRealtimeTracking(AREngine& engine, int cameraId = 0) {
    std::cout << "\n[Camera] Initializing camera " << cameraId << "..." << std::endl;

    // Open camera
    cv::VideoCapture cap(cameraId);
    if (!cap.isOpened()) {
        std::cerr << "[Camera] Failed to open camera!" << std::endl;
        return;
    }

    // Set camera properties for better performance
    cap.set(cv::CAP_PROP_FRAME_WIDTH, 640);
    cap.set(cv::CAP_PROP_FRAME_HEIGHT, 480);
    cap.set(cv::CAP_PROP_FPS, 30);

    int frameWidth = cap.get(cv::CAP_PROP_FRAME_WIDTH);
    int frameHeight = cap.get(cv::CAP_PROP_FRAME_HEIGHT);
    double fps = cap.get(cv::CAP_PROP_FPS);

    std::cout << "[Camera] Camera opened successfully!" << std::endl;
    std::cout << "[Camera] Resolution: " << frameWidth << "x" << frameHeight << std::endl;
    std::cout << "[Camera] FPS: " << fps << std::endl;
    std::cout << "\n[Camera] Controls:" << std::endl;
    std::cout << "  - Press 'q' or ESC to quit" << std::endl;
    std::cout << "  - Press 's' to save current frame" << std::endl;
    std::cout << "  - Press 'r' to reset tracking" << std::endl;
    std::cout << "\n[Camera] Starting realtime tracking..." << std::endl;

    // Create display window
    cv::namedWindow("WebAR Realtime Tracking", cv::WINDOW_AUTOSIZE);

    cv::Mat frame, rgba;
    int frameCount = 0;
    double totalFps = 0;
    auto startTime = std::chrono::steady_clock::now();

    while (true) {
        // Capture frame
        cap >> frame;
        if (frame.empty()) {
            std::cerr << "[Camera] Failed to capture frame!" << std::endl;
            break;
        }

        // Convert to RGBA
        cv::cvtColor(frame, rgba, cv::COLOR_BGR2BGRA);

        // Process frame
        auto results = engine.processFrame(
            rgba.data,
            rgba.cols,
            rgba.rows,
            rgba.channels()
        );

        // Draw tracking results
        drawTrackingResults(frame, results);

        // Log detection results periodically
        if (frameCount % 30 == 0) {
            std::cout << "\n[Camera] Frame " << frameCount << " summary:" << std::endl;
            std::cout << "  - Detected targets: " << results.size() << std::endl;
            for (const auto& result : results) {
                if (result.detected) {
                    std::cout << "    * " << result.targetId
                              << " [" << result.trackingMode << "]"
                              << " conf=" << (int)(result.confidence * 100) << "%";

                    // In detection-only mode, show more details
                    if (DETECTION_ONLY_MODE) {
                        std::cout << " (pure detection - no tracking)";
                    }
                    std::cout << std::endl;

                    // Show corner positions for debugging
                    if (ENABLE_PROFILING && result.corners.size() == 4) {
                        std::cout << "      Corners: ["
                                  << "(" << (int)result.corners[0].x << "," << (int)result.corners[0].y << ") "
                                  << "(" << (int)result.corners[1].x << "," << (int)result.corners[1].y << ") "
                                  << "(" << (int)result.corners[2].x << "," << (int)result.corners[2].y << ") "
                                  << "(" << (int)result.corners[3].x << "," << (int)result.corners[3].y << ")]"
                                  << std::endl;
                    }
                }
            }
            if (results.empty()) {
                std::cout << "    (no targets detected)" << std::endl;
            }
        }

        // Get and display performance stats
        auto stats = engine.getLastFrameStats();

        // Calculate FPS properly - handle edge cases
        double currentFps = 0.0;
        if (stats.totalMs > 0.0) {
            currentFps = 1000.0 / stats.totalMs;
        }
        // Cap FPS at reasonable value to avoid display issues
        if (currentFps > 120.0) {
            currentFps = 120.0;
        }

        totalFps += currentFps;
        frameCount++;

        // Draw mode indicator
        std::string modeText = DETECTION_ONLY_MODE ?
                              "MODE: DETECTION ONLY" : "MODE: FULL TRACKING";
        cv::Scalar modeColor = DETECTION_ONLY_MODE ?
                              cv::Scalar(255, 128, 0) : cv::Scalar(0, 255, 0);
        cv::putText(frame, modeText, cv::Point(10, 30),
                   cv::FONT_HERSHEY_SIMPLEX, 0.6, modeColor, 2);

        // Draw stats on frame
        std::string statsText = "FPS: " + std::to_string((int)currentFps) +
                               " | Total: " + std::to_string((int)stats.totalMs) + "ms" +
                               " | Det: " + std::to_string((int)stats.detectionMs) + "ms";
        if (!DETECTION_ONLY_MODE) {
            statsText += " | Track: " + std::to_string((int)stats.trackingMs) + "ms";
        }
        cv::putText(frame, statsText, cv::Point(10, 55),
                   cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 255, 255), 1);

        // Draw target count and detected count
        std::string targetText = "Detected: " + std::to_string(results.size()) +
                                " / Total: " + std::to_string(engine.getTargetCount());
        cv::putText(frame, targetText, cv::Point(10, 75),
                   cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 255, 255), 1);

        // Draw frame number
        std::string frameText = "Frame: " + std::to_string(stats.frameNumber);
        cv::putText(frame, frameText, cv::Point(10, 95),
                   cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 255, 255), 1);

        // Display frame
        cv::imshow("WebAR Realtime Tracking", frame);

        // Handle keyboard input
        int key = cv::waitKey(1) & 0xFF;
        if (key == 'q' || key == 27) {  // 'q' or ESC
            std::cout << "\n[Camera] Quitting..." << std::endl;
            break;
        } else if (key == 's') {  // Save frame
            std::string filename = "capture_" + std::to_string(frameCount) + ".jpg";
            cv::imwrite(filename, frame);
            std::cout << "[Camera] Frame saved to: " << filename << std::endl;
        } else if (key == 'r') {  // Reset tracking
            std::cout << "[Camera] Resetting tracking..." << std::endl;
            engine.stopTracking();
            engine.startTracking();
        }
    }

    // Cleanup
    cap.release();
    cv::destroyAllWindows();

    // Print summary statistics
    auto endTime = std::chrono::steady_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::seconds>(endTime - startTime).count();
    double avgFps = totalFps / frameCount;

    std::cout << "\n[Camera] Session summary:" << std::endl;
    std::cout << "  - Total frames processed: " << frameCount << std::endl;
    std::cout << "  - Session duration: " << duration << " seconds" << std::endl;
    std::cout << "  - Average FPS: " << (int)avgFps << std::endl;
}

int main(int argc, char** argv) {
    std::cout << "======================================" << std::endl;
    std::cout << "WebAR Realtime Camera Tracking" << std::endl;
    std::cout << "======================================" << std::endl;
    std::cout << std::endl;

    // Parse command line arguments
    int cameraId = 0;
    std::string dbPath = "target_database.json";  // Default database path

    if (argc > 1) {
        // First argument can be camera ID or database path
        std::string arg1(argv[1]);
        if (arg1.find(".json") != std::string::npos) {
            dbPath = arg1;
        } else {
            cameraId = std::atoi(argv[1]);
        }
    }
    if (argc > 2) {
        // Second argument is camera ID if first was database path
        cameraId = std::atoi(argv[2]);
    }

    std::cout << "[Init] Configuration:" << std::endl;
    std::cout << "  - Database: " << dbPath << std::endl;
    std::cout << "  - Camera ID: " << cameraId << std::endl;
    std::cout << std::endl;

    // Create engine
    AREngine engine;

    // Configure engine based on test mode flags
    EngineConfig config;

    if (DETECTION_ONLY_MODE) {
        // DETECTION-ONLY MODE: Test detection and matching on every frame
        config.useOpticalFlow = false;     // Disable optical flow tracking
        config.detectionInterval = 1;      // Run detection every frame
        std::cout << "[Init] *** DETECTION-ONLY MODE ***" << std::endl;
        std::cout << "[Init] Optical flow tracking: DISABLED" << std::endl;
        std::cout << "[Init] Running detection every frame" << std::endl;
    } else {
        // FULL TRACKING MODE: Detection + optical flow + pose filtering
        config.useOpticalFlow = true;      // Enable optical flow tracking
        config.detectionInterval = DETECTION_INTERVAL;
        config.maxTrackingPoints = TRACKING_POINTS;
        std::cout << "[Init] *** FULL TRACKING MODE ***" << std::endl;
        std::cout << "[Init] Optical flow tracking: ENABLED" << std::endl;
        std::cout << "[Init] Detection interval: every " << DETECTION_INTERVAL << " frames" << std::endl;
        std::cout << "[Init] Max tracking points: " << TRACKING_POINTS << std::endl;
    }

    // Common configuration
    config.maxFeatures = MAX_FEATURES;
    config.matchRatioThreshold = MATCH_RATIO;
    config.ransacIterations = RANSAC_ITERATIONS;
    config.ransacThreshold = RANSAC_THRESHOLD;
    config.enableProfiling = ENABLE_PROFILING;

    engine.setConfig(config);

    std::cout << "[Init] Configuration:" << std::endl;
    std::cout << "  - Max features: " << MAX_FEATURES << std::endl;
    std::cout << "  - Match ratio threshold: " << MATCH_RATIO << std::endl;
    std::cout << "  - RANSAC iterations: " << RANSAC_ITERATIONS << std::endl;
    std::cout << "  - RANSAC threshold: " << RANSAC_THRESHOLD << "px" << std::endl;
    std::cout << "  - Profiling: " << (ENABLE_PROFILING ? "ENABLED" : "DISABLED") << std::endl;

    // Load target database from JSON file
    if (!loadTargetDatabase(engine, dbPath)) {
        std::cerr << "[Init] Failed to load target database!" << std::endl;
        std::cerr << "[Init] Falling back to manual target creation..." << std::endl;

        // Fallback: Create test target from reference image
        if (!createTestTarget(engine)) {
            std::cerr << "[Init] Failed to create fallback test target!" << std::endl;
            return 1;
        }
    }

    std::cout << "\n[Init] Total targets loaded: " << engine.getTargetCount() << std::endl;

    if (engine.getTargetCount() == 0) {
        std::cerr << "[Init] No targets loaded! Cannot start tracking." << std::endl;
        return 1;
    }

    // Start tracking
    engine.startTracking();

    // Run realtime camera tracking
    runRealtimeTracking(engine, cameraId);

    // Stop tracking
    engine.stopTracking();

    std::cout << "\n[Exit] Application closed successfully!" << std::endl;

    return 0;
}
