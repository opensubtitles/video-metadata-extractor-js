# 📦 External Project Usage Guide

## Video Metadata Extractor - Simplified API

Perfect for using as a module/package in your external projects. This guide shows the most important functions for fast metadata detection, individual subtitle extraction, and batch subtitle processing.

## 🚀 Quick Start

```bash
npm install @opensubtitles/video-metadata-extractor
```

## 📋 Core Functions

### 1. Fast Metadata Detection

```typescript
import { extractMetadata } from '@opensubtitles/video-metadata-extractor';

const metadata = await extractMetadata(videoFile);

console.log(`Duration: ${metadata.format.duration}s`);
console.log(`Resolution: ${metadata.streams[0].width}x${metadata.streams[0].height}`);
console.log(`File size: ${metadata.format.size} bytes`);
console.log(`Video codec: ${metadata.streams[0].codec_name}`);
console.log(`Subtitle tracks: ${metadata.streams.filter(s => s.codec_type === 'subtitle').length}`);
```

### 2. Extract Individual Subtitles

```typescript
import { extractSubtitle } from '@opensubtitles/video-metadata-extractor';

// Quick extraction (faster, may be incomplete)
const subtitle = await extractSubtitle(videoFile, 2, { 
  format: 'srt', 
  quick: true 
});

console.log(`Extracted: ${subtitle.filename} (${subtitle.size} bytes)`);
const subtitleText = new TextDecoder().decode(subtitle.data);

// Full extraction (slower, complete)
const fullSubtitle = await extractSubtitle(videoFile, 2, { 
  format: 'srt', 
  quick: false 
});
```

### 3. Extract All Subtitles as ZIP

```typescript
import { extractAllSubtitles } from '@opensubtitles/video-metadata-extractor';

const result = await extractAllSubtitles(videoFile);
console.log(`Extracted ${result.successfulExtractions}/${result.totalStreams} subtitles`);

// Download ZIP file
const url = URL.createObjectURL(result.zipBlob);
const a = document.createElement('a');
a.href = url;
a.download = result.zipFilename;
a.click();
URL.revokeObjectURL(url);

// Or access individual files
result.extractedFiles.forEach(file => {
  console.log(`${file.filename}: ${file.size} bytes (${file.language})`);
  const subtitleContent = new TextDecoder().decode(file.data);
});
```

### 4. Get Convenient Video Info

```typescript
import { getVideoInfo } from '@opensubtitles/video-metadata-extractor';

const info = await getVideoInfo(videoFile);

console.log(`Video: ${info.resolution} @ ${info.fps}fps`);
console.log(`Duration: ${info.duration}`);
console.log(`Video codec: ${info.videoCodec}`);
console.log(`Audio codec: ${info.audioCodec}`);
console.log(`File size: ${info.size}`);
console.log(`Subtitles: ${info.subtitles.length} tracks`);

info.subtitles.forEach((sub, i) => {
  console.log(`  ${i}: ${sub.language || 'unknown'} (${sub.codec}) ${sub.forced ? '[FORCED]' : ''}`);
});
```

### 5. Resource Cleanup

```typescript
import { cleanup } from '@opensubtitles/video-metadata-extractor';

// Call when you're done processing videos
await cleanup();
```

## 🔧 Advanced API

For complex scenarios requiring full control:

```typescript
import { VideoMetadataExtractor } from '@opensubtitles/video-metadata-extractor';

const extractor = new VideoMetadataExtractor({ 
  debug: true,
  timeout: 60000,
  chunkSize: 50 * 1024 * 1024 // 50MB chunks
});

await extractor.initialize();

// Extract metadata
const metadata = await extractor.extractMetadata(file);

// Extract specific subtitle with custom options
const subtitle = await extractor.extractSubtitle(file, 2, {
  format: 'vtt',
  timeout: 30000,
  filename: 'custom-subtitle.vtt'
});

// Extract all subtitles
const batch = await extractor.extractAllSubtitles(file);

// Clean up
await extractor.terminate();
```

## 🎯 Complete Example

```typescript
import { 
  extractMetadata, 
  extractSubtitle, 
  extractAllSubtitles, 
  getVideoInfo,
  cleanup,
  getAllSupportedFormats,
  validateFile
} from '@opensubtitles/video-metadata-extractor';

async function processVideo(videoFile) {
  try {
    // 1. Validate file
    const validation = validateFile(videoFile);
    if (!validation.isValid) {
      throw new Error(`Invalid file: ${validation.errors.join(', ')}`);
    }

    // 2. Get basic info
    const info = await getVideoInfo(videoFile);
    console.log(`Processing: ${info.filename}`);
    console.log(`Video: ${info.resolution} @ ${info.fps}fps`);
    console.log(`Duration: ${info.duration}`);
    console.log(`Found ${info.subtitles.length} subtitle tracks`);

    // 3. Extract specific subtitle if available
    if (info.subtitles.length > 0) {
      const firstSubtitle = await extractSubtitle(videoFile, info.subtitles[0].index, {
        format: 'srt',
        quick: true
      });
      console.log(`Extracted first subtitle: ${firstSubtitle.filename}`);
    }

    // 4. Extract all subtitles
    if (info.subtitles.length > 1) {
      const allSubtitles = await extractAllSubtitles(videoFile);
      console.log(`Extracted ${allSubtitles.successfulExtractions} subtitles as ZIP`);
    }

    // 5. Get detailed metadata if needed
    const metadata = await extractMetadata(videoFile);
    // Process metadata...

  } catch (error) {
    console.error('Processing failed:', error.message);
  } finally {
    // 6. Clean up resources
    await cleanup();
  }
}

// Usage
const fileInput = document.getElementById('video-file');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    processVideo(file);
  }
});
```

## 📊 Supported Formats

```typescript
import { getAllSupportedFormats, SUPPORTED_FORMATS } from '@opensubtitles/video-metadata-extractor';

const allFormats = getAllSupportedFormats();
console.log(`Total supported: ${allFormats.length} formats`);

console.log('Video formats:', SUPPORTED_FORMATS.VIDEO);
console.log('Audio formats:', SUPPORTED_FORMATS.AUDIO);
console.log('Subtitle formats:', SUPPORTED_FORMATS.SUBTITLE);
```

**Video**: MP4, MKV, AVI, MOV, WMV, WebM, OGV, 3GP, FLV, M4V, etc.
**Audio**: MP3, AAC, WAV, FLAC, OGG, WMA, M4A, etc.
**Subtitles**: SRT, VTT, ASS, SSA, etc.

## 🔄 Migration from Advanced API

If you're currently using the advanced API, here's how to migrate:

**Before (Advanced API):**
```typescript
const extractor = new VideoMetadataExtractor();
await extractor.initialize();
const metadata = await extractor.extractMetadata(file);
const subtitle = await extractor.extractSubtitle(file, 2);
await extractor.terminate();
```

**After (Simplified API):**
```typescript
const metadata = await extractMetadata(file);
const subtitle = await extractSubtitle(file, 2);
await cleanup(); // Call once when done
```

## 💡 Tips for External Projects

1. **Use the simplified API** for most use cases - it's easier and handles initialization automatically
2. **Call `cleanup()`** when you're completely done processing videos to free resources
3. **Use `getVideoInfo()`** for a convenient summary instead of parsing raw metadata
4. **Enable `quick: true`** for subtitle extraction if you need speed over completeness
5. **Validate files** with `validateFile()` before processing
6. **Handle errors** gracefully - video processing can fail for various reasons

## 🚀 Performance

- **Memory efficient**: Handles files of any size using chunked processing
- **Smart processing**: Automatically selects optimal strategies per file type  
- **Quick mode**: Fast subtitle extraction for time-sensitive applications
- **Resource management**: Automatic cleanup of temporary FFmpeg files

## 🔗 Links

- [NPM Package](https://www.npmjs.com/package/@opensubtitles/video-metadata-extractor)
- [GitHub Repository](https://github.com/opensubtitles/video-metadata-extractor-js)
- [Live Demo](https://opensubtitles.github.io/video-metadata-extractor-js/)