# 📚 API Documentation

## Video Metadata Extractor v1.8.0

Complete API reference for the `@opensubtitles/video-metadata-extractor` package.

---

## 🚀 Simplified API

### extractMetadata(file, options?)

Fast metadata detection from video files.

**Parameters:**
- `file: File` - The video file to analyze
- `options?: VideoMetadataExtractorOptions` - Optional configuration

**Returns:** `Promise<VideoMetadata>`

**Example:**
```typescript
const metadata = await extractMetadata(videoFile);
console.log(metadata.format.duration); // Duration in seconds
console.log(metadata.streams[0].width); // Video width
```

**Metadata Structure:**
```typescript
interface VideoMetadata {
  format: {
    filename: string;
    size: string;
    format_name: string;
    duration: string;
    bit_rate: string;
    fps: string;
    movietimems: string;
    movieframes: string;
  };
  streams: MediaStream[];
}
```

---

### extractSubtitle(file, streamIndex, options?)

Extract individual subtitle track from video file.

**Parameters:**
- `file: File` - The video file containing subtitles
- `streamIndex: number` - Index of the subtitle stream to extract
- `options?: ExtractionOptions & VideoMetadataExtractorOptions` - Extraction options

**Options:**
```typescript
interface ExtractionOptions {
  format?: 'srt' | 'ass' | 'vtt' | 'webvtt';
  quick?: boolean;          // true = faster but may be incomplete
  timeout?: number;         // Timeout in milliseconds
  filename?: string;        // Custom output filename
}
```

**Returns:** `Promise<SubtitleExtractionResult>`

**Example:**
```typescript
// Quick extraction (recommended for most use cases)
const subtitle = await extractSubtitle(videoFile, 2, { 
  format: 'srt', 
  quick: true 
});

// Convert to text
const subtitleText = new TextDecoder().decode(subtitle.data);

// Full extraction (slower but complete)
const fullSubtitle = await extractSubtitle(videoFile, 2, { 
  format: 'srt', 
  quick: false 
});
```

**Result Structure:**
```typescript
interface SubtitleExtractionResult {
  data: Uint8Array;         // Subtitle file content
  filename: string;         // Generated filename
  extension: string;        // File extension
  size: number;            // Size in bytes
  preview: string;         // Text preview
}
```

---

### extractAllSubtitles(file, options?)

Extract all subtitle tracks as a ZIP file.

**Parameters:**
- `file: File` - The video file containing subtitles
- `options?: VideoMetadataExtractorOptions` - Optional configuration

**Returns:** `Promise<BatchExtractionResult>`

**Example:**
```typescript
const result = await extractAllSubtitles(videoFile);
console.log(`Extracted ${result.successfulExtractions}/${result.totalStreams} subtitles`);

// Download ZIP file
const url = URL.createObjectURL(result.zipBlob);
const a = document.createElement('a');
a.href = url;
a.download = result.zipFilename;
a.click();
URL.revokeObjectURL(url);

// Access individual files
result.extractedFiles.forEach(file => {
  console.log(`${file.filename}: ${file.size} bytes (${file.language})`);
  const content = new TextDecoder().decode(file.data);
});
```

**Result Structure:**
```typescript
interface BatchExtractionResult {
  extractedFiles: Array<{
    filename: string;
    data: Uint8Array;
    size: number;
    language?: string;
    forced?: boolean;
    streamIndex: number;
  }>;
  zipBlob: Blob;                    // ZIP file containing all subtitles
  zipFilename: string;              // Suggested ZIP filename
  totalStreams: number;             // Total subtitle streams found
  successfulExtractions: number;    // Number of successfully extracted streams
}
```

---

### getVideoInfo(file, options?)

Get convenient video information summary.

**Parameters:**
- `file: File` - The video file to analyze
- `options?: VideoMetadataExtractorOptions` - Optional configuration

**Returns:** `Promise<VideoInfo>`

**Example:**
```typescript
const info = await getVideoInfo(videoFile);
console.log(`Video: ${info.resolution} @ ${info.fps}fps`);
console.log(`Duration: ${info.duration}`);
console.log(`File size: ${info.size}`);
console.log(`Subtitles: ${info.subtitles.length} tracks`);

info.subtitles.forEach((sub, i) => {
  console.log(`  ${i}: ${sub.language || 'unknown'} (${sub.codec}) ${sub.forced ? '[FORCED]' : ''}`);
});
```

**Result Structure:**
```typescript
interface VideoInfo {
  filename: string;
  size: string;                    // Formatted file size (e.g., "1.2 GB")
  duration: string;                // Duration with unit (e.g., "120s")
  resolution: string;              // Resolution (e.g., "1920x1080")
  fps: string;                     // Frame rate (e.g., "30")
  videoCodec: string;              // Video codec name
  audioCodec: string;              // Audio codec name
  subtitles: Array<{
    index: number;
    language?: string;
    codec: string;
    forced?: boolean;
    default?: boolean;
  }>;
  metadata: VideoMetadata;         // Full metadata object
}
```

---

### cleanup()

Clean up global extractor resources.

**Returns:** `Promise<void>`

**Example:**
```typescript
// Call when completely done processing videos
await cleanup();
```

**Important:** Call this when you're finished processing videos to free up memory and terminate FFmpeg processes.

---

## 🔧 Advanced API

### VideoMetadataExtractor

Full-featured class for advanced use cases requiring complete control.

**Constructor:**
```typescript
new VideoMetadataExtractor(options?: VideoMetadataExtractorOptions)
```

**Options:**
```typescript
interface VideoMetadataExtractorOptions {
  ffmpegCoreURL?: string;          // Custom FFmpeg core URL
  ffmpegWasmURL?: string;          // Custom FFmpeg WASM URL
  onProgress?: (progress: ProgressState) => void;
  onError?: (error: ErrorState) => void;
  debug?: boolean;                 // Enable debug logging
  timeout?: number;                // Operation timeout (ms)
  chunkSize?: number;              // Chunk size for large files
}
```

**Methods:**

#### initialize()
Initialize FFmpeg. Must be called before using other methods.
```typescript
await extractor.initialize();
```

#### extractMetadata(file)
Extract metadata (same as simplified API but with instance control).
```typescript
const metadata = await extractor.extractMetadata(file);
```

#### extractSubtitle(file, streamIndex, options?)
Extract individual subtitle (same as simplified API).
```typescript
const subtitle = await extractor.extractSubtitle(file, 2, { format: 'srt' });
```

#### extractAllSubtitles(file)
Extract all subtitles (same as simplified API).
```typescript
const batch = await extractor.extractAllSubtitles(file);
```

#### downloadFile(data, filename)
Download extracted data as file.
```typescript
extractor.downloadFile(subtitle.data, subtitle.filename);
```

#### downloadZip(zipBlob, filename)
Download ZIP file.
```typescript
extractor.downloadZip(batch.zipBlob, batch.zipFilename);
```

#### isInitialized()
Check if extractor is initialized.
```typescript
const ready = extractor.isInitialized();
```

#### getSupportedFormats()
Get array of supported file formats.
```typescript
const formats = extractor.getSupportedFormats();
```

#### terminate()
Clean up and terminate FFmpeg.
```typescript
await extractor.terminate();
```

**Complete Example:**
```typescript
const extractor = new VideoMetadataExtractor({
  debug: true,
  timeout: 60000,
  onProgress: (progress) => console.log(`Progress: ${progress.progress}%`),
  onError: (error) => console.error('Error:', error.message)
});

try {
  await extractor.initialize();
  
  const metadata = await extractor.extractMetadata(file);
  const subtitle = await extractor.extractSubtitle(file, 2);
  const batch = await extractor.extractAllSubtitles(file);
  
  // Use the results...
  
} finally {
  await extractor.terminate();
}
```

---

## 🛠️ Utility Functions

### getAllSupportedFormats()
Get array of all supported file formats.
```typescript
const formats = getAllSupportedFormats();
// Returns: ['mp4', 'mkv', 'avi', 'mov', ...]
```

### validateFile(file)
Validate if file is supported.
```typescript
const validation = validateFile(file);
if (!validation.isValid) {
  console.error('Errors:', validation.errors);
}
```

### formatFileSize(bytes)
Format file size to human-readable string.
```typescript
const size = formatFileSize(1024 * 1024); // "1 MB"
```

### generateSubtitleFilename(videoName, language?, forced?, format?)
Generate subtitle filename.
```typescript
const filename = generateSubtitleFilename('movie.mp4', 'en', false, 'srt');
// Returns: "movie.en.srt"
```

---

## 📊 Constants

### SUPPORTED_FORMATS
Object containing supported format arrays.
```typescript
SUPPORTED_FORMATS.VIDEO    // Video formats array
SUPPORTED_FORMATS.AUDIO    // Audio formats array  
SUPPORTED_FORMATS.SUBTITLE // Subtitle formats array
SUPPORTED_FORMATS.ALL      // All formats array
```

### PROCESSING_CONSTANTS
Processing configuration constants.
```typescript
PROCESSING_CONSTANTS.CHUNK_SIZES      // File processing chunk sizes
PROCESSING_CONSTANTS.TIMEOUTS         // Operation timeouts
PROCESSING_CONSTANTS.RETRY            // Retry configuration
PROCESSING_CONSTANTS.FILE_SIZE_LIMITS // File size limits
```

---

## 🎯 Type Definitions

Complete TypeScript definitions are included. Key types:

- `VideoMetadata` - Complete metadata structure
- `MediaStream` - Stream information (video/audio/subtitle)
- `VideoStream`, `AudioStream`, `SubtitleStream` - Specific stream types
- `SubtitleExtractionResult` - Individual subtitle extraction result
- `BatchExtractionResult` - Batch subtitle extraction result
- `ProgressState`, `ErrorState` - Progress and error state objects
- `VideoMetadataExtractorOptions` - Constructor options
- `ExtractionOptions` - Subtitle extraction options

---

## 🔍 Error Handling

The library provides comprehensive error handling:

```typescript
try {
  const metadata = await extractMetadata(file);
} catch (error) {
  if (error instanceof FileProcessingError) {
    console.error('File processing failed:', error.message);
  } else if (error instanceof FFmpegError) {
    console.error('FFmpeg error:', error.message);
  } else {
    console.error('Unknown error:', error.message);
  }
}
```

Common error types:
- `FileProcessingError` - File validation or processing issues
- `FFmpegError` - FFmpeg-specific errors
- `SubtitleExtractionError` - Subtitle extraction failures

---

## 🚀 Performance Tips

1. **Use Quick Mode**: Enable `quick: true` for subtitle extraction when speed is important
2. **Batch Processing**: Use `extractAllSubtitles()` for multiple subtitle tracks
3. **Resource Cleanup**: Always call `cleanup()` when done
4. **File Validation**: Use `validateFile()` before processing
5. **Error Handling**: Implement proper error handling for production use
6. **Memory Management**: Process large files one at a time to avoid memory issues

---

## 🔗 Links

- [NPM Package](https://www.npmjs.com/package/@opensubtitles/video-metadata-extractor)
- [GitHub Repository](https://github.com/opensubtitles/video-metadata-extractor-js)
- [External Usage Guide](../EXTERNAL-USAGE.md)
- [Live Demo](https://opensubtitles.github.io/video-metadata-extractor-js/)