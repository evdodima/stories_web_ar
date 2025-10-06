#!/usr/bin/env python3
"""
Vocabulary Tree Builder for WebAR Image Tracking

Builds an offline vocabulary tree database from target images for fast
large-scale image retrieval using BRISK features.

Usage:
    python build_vocabulary_tree.py --input targets/ --output target_database.json

Algorithm:
    1. Extract BRISK features from all target images
    2. Cluster descriptors into vocabulary tree (hierarchical k-means)
    3. Build inverted index (visual word → target IDs)
    4. Compute TF-IDF weights
    5. Export database to JSON for runtime use

Dependencies:
    pip install opencv-python opencv-contrib-python numpy scikit-learn
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np
from sklearn.cluster import MiniBatchKMeans


class VocabularyTreeBuilder:
    """Builds a vocabulary tree for fast image retrieval with binary descriptors"""

    def __init__(self, k: int = 10, levels: int = 2):
        """
        Args:
            k: Branching factor (children per node)
            levels: Tree depth (total words = k^levels)
        """
        self.k = k
        self.levels = levels
        self.vocabulary_size = k ** levels

        # BRISK detector parameters (match runtime settings)
        self.detector = cv2.BRISK_create(
            thresh=50,
            octaves=3,
            patternScale=1.0
        )

        self.vocabulary = None
        self.idf_weights = None
        self.targets = []

        # Feature reduction settings for performance
        self.max_features_per_target = 500  # Optimal balance of speed/accuracy

    def extract_features(self, image_path: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Dict]:
        """
        Extract BRISK keypoints and descriptors from an image, plus metadata

        Returns:
            keypoints: Nx2 array of (x, y) coordinates
            descriptors: NxD binary descriptor array
            image: Original color image
            metadata: Image quality and characteristics
        """
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Failed to load image: {image_path}")

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Detect keypoints and compute descriptors
        kps, descs = self.detector.detectAndCompute(gray, None)

        if descs is None or len(descs) == 0:
            print(f"Warning: No features found in {image_path}")
            return np.array([]), np.array([]), img, {}

        # Convert keypoints to array
        keypoints = np.array([[kp.pt[0], kp.pt[1]] for kp in kps], dtype=np.float32)

        # Compute image metadata
        metadata = self._compute_image_metadata(img, gray, keypoints, kps)

        # Apply smart feature reduction for performance
        keypoints, descs, kps = self._select_best_features(keypoints, descs, kps, gray.shape)

        return keypoints, descs, img, metadata

    def _compute_image_metadata(self, img: np.ndarray, gray: np.ndarray,
                                keypoints: np.ndarray, kps: List) -> Dict:
        """Compute quality metrics and characteristics for target image"""
        h, w = gray.shape

        # Image dimensions and aspect ratio
        image_meta = {
            'width': int(w),
            'height': int(h),
            'aspect_ratio': float(w / h)
        }

        # Blur/sharpness detection using Laplacian variance
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        blur_score = float(laplacian.var())

        # Feature density (features per 100 px²)
        area = w * h
        feature_density = (len(keypoints) / area) * 10000

        # Contrast score (std dev of pixel values)
        contrast_score = float(gray.std() / 128.0)  # Normalized to 0-1

        # Feature response distribution (how "strong" are the features)
        responses = [kp.response for kp in kps]
        avg_response = float(np.mean(responses)) if responses else 0.0

        # Visual distinctiveness heuristic
        # High = many strong features with good distribution
        distinctiveness = min(1.0, (avg_response * feature_density * contrast_score) / 100.0)

        # Recommended threshold - good targets have:
        # - Good sharpness (blur_score > 100)
        # - Decent feature density (> 0.5 per 100px²)
        # - Good contrast (> 0.3)
        recommended = (blur_score > 100 and feature_density > 0.5 and contrast_score > 0.3)

        quality_metrics = {
            'blur_score': float(blur_score),
            'distinctiveness': float(distinctiveness),
            'feature_density': float(feature_density),
            'contrast_score': float(contrast_score),
            'avg_feature_response': float(avg_response),
            'recommended': bool(recommended)
        }

        # Color histogram (16 bins for Hue channel)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        hue_hist = cv2.calcHist([hsv], [0], None, [16], [0, 180])
        hue_hist = hue_hist.flatten() / hue_hist.sum()  # Normalize

        color_histogram = {
            'hue_bins': [float(x) for x in hue_hist]
        }

        # Feature distribution map (8x8 grid)
        grid_size = 8
        feature_distribution = np.zeros((grid_size, grid_size), dtype=int)
        cell_h, cell_w = h / grid_size, w / grid_size

        for kp in keypoints:
            x, y = kp
            grid_x = min(int(x / cell_w), grid_size - 1)
            grid_y = min(int(y / cell_h), grid_size - 1)
            feature_distribution[grid_y, grid_x] += 1

        # Spatial distribution metrics
        spatial_layout = {
            'grid_8x8': feature_distribution.flatten().tolist(),
            'uniformity': float(1.0 - (feature_distribution.std() / (feature_distribution.mean() + 1)))
        }

        # Compute expected scale range based on image size
        # Assume targets will be viewed at 10%-200% of original size
        scale_hints = {
            'min_scale': 0.1,
            'max_scale': 2.0,
            'typical_scale': 0.5
        }

        return {
            'image_meta': image_meta,
            'quality_metrics': quality_metrics,
            'color_histogram': color_histogram,
            'spatial_layout': spatial_layout,
            'scale_hints': scale_hints
        }

    def _select_best_features(self, keypoints: np.ndarray, descriptors: np.ndarray,
                             kps: List, image_shape: Tuple) -> Tuple[np.ndarray, np.ndarray, List]:
        """
        Select best N features using spatial distribution + response strength

        Strategy:
        1. Sort by response (strength)
        2. Apply spatial non-maximum suppression
        3. Take top N after distribution balancing

        This ensures:
        - Features are strong/distinctive
        - Well-distributed across image
        - Optimal for matching performance
        """
        if len(keypoints) <= self.max_features_per_target:
            return keypoints, descriptors, kps

        h, w = image_shape

        # Sort by response (strongest first)
        responses = np.array([kp.response for kp in kps])
        sorted_indices = np.argsort(-responses)  # Descending

        # Spatial grid for distribution (4x4)
        grid_size = 4
        cell_h, cell_w = h / grid_size, w / grid_size
        features_per_cell = self.max_features_per_target // (grid_size * grid_size)

        selected_indices = []
        cell_counts = np.zeros((grid_size, grid_size), dtype=int)

        # First pass: distribute features across cells
        for idx in sorted_indices:
            kp = kps[idx]
            x, y = kp.pt

            # Determine grid cell
            cell_x = min(int(x / cell_w), grid_size - 1)
            cell_y = min(int(y / cell_h), grid_size - 1)

            # Add if cell not full
            if cell_counts[cell_y, cell_x] < features_per_cell:
                selected_indices.append(idx)
                cell_counts[cell_y, cell_x] += 1

                if len(selected_indices) >= self.max_features_per_target:
                    break

        # Second pass: fill remaining slots with strongest features
        if len(selected_indices) < self.max_features_per_target:
            for idx in sorted_indices:
                if idx not in selected_indices:
                    selected_indices.append(idx)
                    if len(selected_indices) >= self.max_features_per_target:
                        break

        # Convert back to arrays
        selected_indices = np.array(selected_indices)
        selected_keypoints = keypoints[selected_indices]
        selected_descriptors = descriptors[selected_indices]
        selected_kps = [kps[i] for i in selected_indices]

        print(f"    Reduced features: {len(keypoints)} -> {len(selected_keypoints)}")

        return selected_keypoints, selected_descriptors, selected_kps

    def build_vocabulary(self, all_descriptors: np.ndarray):
        """
        Build vocabulary tree using hierarchical k-means clustering

        For binary descriptors (BRISK), we convert to float for k-means,
        then store as binary vocabulary.

        Args:
            all_descriptors: Concatenated descriptors from all images
        """
        print(f"\nBuilding vocabulary tree:")
        print(f"  Branching factor: {self.k}")
        print(f"  Levels: {self.levels}")
        print(f"  Vocabulary size: {self.vocabulary_size} words")
        print(f"  Input descriptors: {len(all_descriptors)}")

        if len(all_descriptors) < self.vocabulary_size:
            print(f"Warning: Fewer descriptors ({len(all_descriptors)}) than vocabulary size ({self.vocabulary_size})")
            print(f"Reducing vocabulary size to {len(all_descriptors)}")
            self.vocabulary_size = len(all_descriptors)

        # Convert binary descriptors to float for clustering
        # Each byte becomes 8 float values (0 or 1)
        desc_float = np.unpackbits(all_descriptors, axis=1).astype(np.float32)

        # Use MiniBatchKMeans for efficiency with large datasets
        print(f"\nClustering {len(desc_float)} descriptors into {self.vocabulary_size} visual words...")
        kmeans = MiniBatchKMeans(
            n_clusters=self.vocabulary_size,
            batch_size=1000,
            max_iter=100,
            random_state=42,
            verbose=1
        )
        kmeans.fit(desc_float)

        # Convert cluster centers back to binary
        centers_binary = np.packbits(
            (kmeans.cluster_centers_ > 0.5).astype(np.uint8),
            axis=1
        )

        self.vocabulary = centers_binary
        print(f"Vocabulary tree built: {len(self.vocabulary)} visual words")

        return kmeans

    def compute_idf(self, target_bow_vectors: List[Dict[int, int]]):
        """
        Compute IDF (Inverse Document Frequency) weights

        IDF(word) = log(N / df(word))
        where df(word) = number of targets containing word
        """
        N = len(target_bow_vectors)
        df = np.zeros(self.vocabulary_size)

        # Count document frequency for each word
        for bow in target_bow_vectors:
            for word_id in bow.keys():
                df[word_id] += 1

        # Compute IDF weights (avoid division by zero)
        self.idf_weights = np.log((N + 1) / (df + 1))

        print(f"IDF weights computed for {self.vocabulary_size} words")

    def quantize_descriptor(self, descriptor: np.ndarray, vocabulary: np.ndarray) -> int:
        """
        Find the closest visual word for a descriptor using Hamming distance

        Args:
            descriptor: Single binary descriptor
            vocabulary: Array of visual word descriptors

        Returns:
            word_id: Index of closest visual word
        """
        # Compute Hamming distance to all vocabulary words
        # XOR then count bits
        hamming_dist = np.array([
            bin(int.from_bytes(bytes(descriptor ^ word), byteorder='big')).count('1')
            for word in vocabulary
        ])

        return int(np.argmin(hamming_dist))

    def descriptors_to_bow(self, descriptors: np.ndarray) -> Dict[int, int]:
        """
        Convert descriptors to Bag-of-Words representation

        Args:
            descriptors: Nx64 binary descriptor array

        Returns:
            bow: Dict mapping word_id -> count
        """
        bow = {}

        for desc in descriptors:
            word_id = self.quantize_descriptor(desc, self.vocabulary)
            bow[word_id] = bow.get(word_id, 0) + 1

        return bow

    def compute_tfidf_vector(self, bow: Dict[int, int], num_features: int) -> Dict[int, float]:
        """
        Convert BoW to TF-IDF weighted vector

        Args:
            bow: Bag-of-words (word_id -> count)
            num_features: Total number of features in this target

        Returns:
            tfidf: Dict mapping word_id -> tf-idf weight
        """
        tfidf = {}

        for word_id, count in bow.items():
            # TF = term frequency (normalized by document length)
            tf = count / num_features
            # IDF from pre-computed weights
            idf = self.idf_weights[word_id] if self.idf_weights is not None else 1.0
            # TF-IDF
            tfidf[word_id] = float(tf * idf)

        return tfidf

    def process_targets(self, target_dir: Path) -> List[Dict]:
        """
        Process all target images and build database

        Args:
            target_dir: Directory containing target images

        Returns:
            List of target metadata dictionaries
        """
        image_extensions = {'.jpg', '.jpeg', '.png', '.bmp'}
        image_files = [
            f for f in target_dir.iterdir()
            if f.suffix.lower() in image_extensions
        ]

        print(f"\nProcessing {len(image_files)} target images from {target_dir}")

        # Step 1: Extract features from all targets
        all_descriptors = []
        target_features = []

        for img_path in sorted(image_files):
            print(f"  Extracting features: {img_path.name}...")
            keypoints, descriptors, img, metadata = self.extract_features(str(img_path))

            if len(descriptors) == 0:
                print(f"    Warning: Skipping {img_path.name} (no features)")
                continue

            target_id = img_path.stem
            target_features.append({
                'id': target_id,
                'filename': img_path.name,
                'keypoints': keypoints,
                'descriptors': descriptors,
                'num_features': len(keypoints),
                'metadata': metadata
            })

            all_descriptors.append(descriptors)

            # Print quality assessment
            quality = metadata.get('quality_metrics', {})
            recommended = quality.get('recommended', False)
            status = "✓ Good" if recommended else "⚠ Weak"
            print(f"    Found {len(descriptors)} features | Quality: {status}")

        if len(all_descriptors) == 0:
            raise ValueError("No features extracted from any target images")

        # Concatenate all descriptors
        all_descriptors = np.vstack(all_descriptors)
        print(f"\nTotal features extracted: {len(all_descriptors)}")

        # Step 2: Build vocabulary tree
        self.build_vocabulary(all_descriptors)

        # Step 3: Convert each target to BoW representation
        print("\nConverting targets to Bag-of-Words...")
        target_bow_vectors = []

        for target in target_features:
            bow = self.descriptors_to_bow(target['descriptors'])
            target['bow'] = bow
            target_bow_vectors.append(bow)
            print(f"  {target['id']}: {len(bow)} unique visual words")

        # Step 4: Compute IDF weights
        self.compute_idf(target_bow_vectors)

        # Step 5: Compute TF-IDF vectors for each target
        print("\nComputing TF-IDF vectors...")
        for target in target_features:
            tfidf = self.compute_tfidf_vector(target['bow'], target['num_features'])
            target['bow_tfidf'] = tfidf

        self.targets = target_features
        return target_features

    def export_database(self, output_path: Path):
        """
        Export vocabulary tree and target database to JSON

        Format is optimized for JavaScript runtime:
        - Binary data encoded as base64 or int arrays
        - Sparse BoW vectors as objects
        """
        print(f"\nExporting database to {output_path}...")

        database = {
            'metadata': {
                'num_targets': len(self.targets),
                'vocabulary_size': self.vocabulary_size,
                'branching_factor': self.k,
                'levels': self.levels,
                'descriptor_type': 'BRISK',
                'descriptor_bytes': 64
            },
            'vocabulary': {
                # Convert binary vocabulary to list of int arrays for JSON
                'words': [[int(b) for b in word] for word in self.vocabulary],
                'idf_weights': [float(w) for w in self.idf_weights]
            },
            'targets': []
        }

        # Export target data
        for target in self.targets:
            target_data = {
                'id': target['id'],
                'filename': target['filename'],
                'num_features': int(target['num_features']),
                'keypoints': [[float(x), float(y)] for x, y in target['keypoints']],
                'descriptors': [[int(b) for b in desc] for desc in target['descriptors']],
                'bow': {int(k): int(v) for k, v in target['bow'].items()},
                'bow_tfidf': {int(k): float(v) for k, v in target['bow_tfidf'].items()},
            }

            # Add all metadata
            if 'metadata' in target:
                meta = target['metadata']
                target_data['image_meta'] = meta.get('image_meta', {})
                target_data['quality_metrics'] = meta.get('quality_metrics', {})
                target_data['color_histogram'] = meta.get('color_histogram', {})
                target_data['spatial_layout'] = meta.get('spatial_layout', {})
                target_data['scale_hints'] = meta.get('scale_hints', {})

                # Compute adaptive matching parameters based on quality
                quality = meta.get('quality_metrics', {})
                target_data['validation'] = {
                    'min_matches_for_detection': 15 if quality.get('recommended', False) else 20,
                    'ransac_threshold': 5.0,
                    'optical_flow_compatible': quality.get('blur_score', 0) > 100,
                    'recommended': quality.get('recommended', False)
                }

            database['targets'].append(target_data)

        # Write to file
        with open(output_path, 'w') as f:
            json.dump(database, f, indent=2)

        # Print statistics
        file_size = output_path.stat().st_size / (1024 * 1024)
        print(f"\nDatabase exported successfully!")
        print(f"  File size: {file_size:.2f} MB")
        print(f"  Targets: {len(self.targets)}")
        print(f"  Vocabulary size: {self.vocabulary_size}")
        print(f"  Total features: {sum(t['num_features'] for t in self.targets)}")


def main():
    parser = argparse.ArgumentParser(
        description='Build vocabulary tree database for WebAR image tracking'
    )
    parser.add_argument(
        '--input',
        type=Path,
        default=Path('targets'),
        help='Input directory containing target images (default: targets/)'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('target_database.json'),
        help='Output JSON database file (default: target_database.json)'
    )
    parser.add_argument(
        '--vocab-size',
        type=int,
        default=1000,
        help='Vocabulary size (number of visual words, default: 1000)'
    )
    parser.add_argument(
        '--branching-factor',
        type=int,
        default=10,
        help='Tree branching factor (default: 10)'
    )
    parser.add_argument(
        '--levels',
        type=int,
        default=3,
        help='Tree depth (default: 3, vocab_size = k^levels)'
    )

    args = parser.parse_args()

    # Validate input directory
    if not args.input.exists():
        print(f"Error: Input directory not found: {args.input}")
        sys.exit(1)

    # Create builder
    builder = VocabularyTreeBuilder(
        k=args.branching_factor,
        levels=args.levels
    )

    # Override vocabulary size if specified
    if args.vocab_size:
        builder.vocabulary_size = args.vocab_size

    # Process targets
    try:
        builder.process_targets(args.input)
        builder.export_database(args.output)
        print("\n✓ Vocabulary tree database built successfully!")

    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
