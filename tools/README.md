# Vocabulary Tree Database Builder

Offline tool for building a vocabulary tree database from target images. This enables fast large-scale image retrieval (100+ targets) in the WebAR engine.

## Installation

```bash
cd tools
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Usage

### Basic Usage

```bash
python build_vocabulary_tree.py --input ../targets --output ../target_database.json
```

### Advanced Options

```bash
python build_vocabulary_tree.py \
  --input ../targets \
  --output ../target_database.json \
  --vocab-size 1000 \
  --branching-factor 10 \
  --levels 3
```

### Parameters

- `--input`: Directory containing target images (default: `targets/`)
- `--output`: Output JSON database file (default: `target_database.json`)
- `--vocab-size`: Number of visual words (default: 1000)
- `--branching-factor`: Tree branching factor `k` (default: 10)
- `--levels`: Tree depth (default: 3, vocabulary size = k^levels)

### Vocabulary Size Guidelines

Choose vocabulary size based on your database:

| Targets | Recommended Vocab Size | Branching | Levels |
|---------|----------------------|-----------|--------|
| 10-50   | 100-500             | 10        | 2      |
| 50-100  | 500-1000            | 10        | 3      |
| 100-500 | 1000-5000           | 10        | 4      |
| 500+    | 5000-10000          | 10        | 4      |

**Rule of thumb:** `vocab_size ≈ 10 × num_targets`

## How It Works

### 1. Feature Extraction
- Loads all target images from input directory
- Extracts BRISK keypoints and descriptors (matches runtime settings)
- Collects all descriptors for vocabulary building

### 2. Vocabulary Tree Building
- Clusters descriptors using hierarchical k-means
- Creates a tree structure with branching factor `k` and depth `levels`
- Total visual words = k^levels
- Uses Hamming distance for binary BRISK descriptors

### 3. Inverted Index
- Converts each target to Bag-of-Words (BoW) representation
- Each descriptor is assigned to its closest visual word
- Builds sparse vector: `{word_id: count}`

### 4. TF-IDF Weighting
- Computes IDF (Inverse Document Frequency) for each word
- IDF(word) = log(N / df(word))
- Rare words get higher weights (more discriminative)

### 5. Database Export
- Exports vocabulary tree to JSON
- Includes:
  - Visual word descriptors (vocabulary)
  - IDF weights
  - Per-target: keypoints, descriptors, BoW vector

## Output Format

```json
{
  "metadata": {
    "num_targets": 100,
    "vocabulary_size": 1000,
    "descriptor_type": "BRISK"
  },
  "vocabulary": {
    "words": [[...], ...],      // 1000 visual word descriptors
    "idf_weights": [...]         // IDF weight per word
  },
  "targets": [
    {
      "id": "target-1",
      "keypoints": [[x, y], ...],
      "descriptors": [[...], ...],
      "bow": {"42": 3, "157": 5, ...}  // word_id: count
    }
  ]
}
```

## Performance Expectations

### Database Building Time (approximate)

| Targets | Features/Target | Vocab Size | Build Time |
|---------|----------------|------------|------------|
| 10      | 500            | 100        | 5s         |
| 50      | 500            | 500        | 30s        |
| 100     | 500            | 1000       | 2min       |
| 500     | 500            | 5000       | 15min      |

### Database File Size

- Vocabulary: ~64 bytes × vocab_size
- Per target: ~100 KB (500 features)
- **Total for 100 targets:** ~10-15 MB

### Runtime Performance (in AR engine)

Without vocabulary tree:
- 100 targets × 7ms = 700ms → **1.4 fps**

With vocabulary tree:
- Quantize frame features: 5ms
- Query tree, get top 5 candidates: 2ms
- Match 5 targets: 35ms
- **Total: 42ms → 24 fps** ✨

## Troubleshooting

### "No features found in image"
- Image may be too blurry or have low texture
- Try images with clear patterns, text, or distinctive features

### "Fewer descriptors than vocabulary size"
- Reduce `--vocab-size`
- Add more target images
- Use images with more features

### Large file size
- Reduce `--vocab-size`
- Images are stored with full feature data
- Consider compressing the JSON output

### Slow clustering
- Reduce `--vocab-size`
- The script uses MiniBatchKMeans for efficiency
- For very large databases, consider running on a server

## Next Steps

After building the database:

1. Load `target_database.json` in the AR engine
2. Implement vocabulary tree query (Part 2)
3. Use BoW similarity for candidate selection
4. Fall back to full matching for top candidates

See the main README for runtime integration details.
