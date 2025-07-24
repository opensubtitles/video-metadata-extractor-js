# @opensubtitles/video-metadata-extractor

A comprehensive NPM package for video metadata extraction and subtitle processing using FFmpeg WASM. Supports metadata extraction, individual subtitle extraction, batch subtitle extraction with ZIP downloads, and memory-safe processing of files of any size using chunked streaming.

## Features

- 🎥 **Comprehensive Metadata Extraction**: Extract detailed video information including duration, resolution, bitrate, codecs, and stream details
- 📄 **Individual Subtitle Extraction**: Extract single subtitle tracks with quick or full processing modes
- 📦 **Batch Subtitle Extraction**: Extract all subtitle tracks at once as a downloadable ZIP file
- 🧠 **Memory-Safe Processing**: Handle files of any size using 500MB chunked streaming (tested up to 10GB, theoretically unlimited)
- ⚡ **Smart File Processing**: Automatic format detection with optimized processing strategies
- 🌐 **Browser-Native**: No server required, all processing happens in the browser using FFmpeg WASM
- 📱 **TypeScript Support**: Full type safety with comprehensive interfaces
- 🎯 **Multiple Formats**: Support for SRT, ASS, VTT subtitle formats
- 🗂️ **Smart Filename Generation**: Automatic filename generation with language codes and duplicate handling

## Installation

```bash
npm install @opensubtitles/video-metadata-extractor
```

## Quick Start

```typescript
import { VideoMetadataExtractor } from '@opensubtitles/video-metadata-extractor';

// Initialize the extractor
const extractor = new VideoMetadataExtractor({
  debug: true,
  onProgress: (progress) => console.log(`Progress: ${progress.progress}% - ${progress.text}`),
  onError: (error) => console.error('Error:', error.message)
});

// Initialize FFmpeg (required before any operations)
await extractor.initialize();

// Extract metadata
const metadata = await extractor.extractMetadata(file);
console.log('Video duration:', metadata.format?.duration);
console.log('Subtitle tracks:', metadata.streams?.filter(s => s.codec_type === 'subtitle').length);

// Extract a single subtitle track (quick mode)
const subtitle = await extractor.extractSubtitle(file, 2, { 
  format: 'srt', 
  quick: true 
});
console.log('Subtitle preview:', subtitle.preview);
extractor.downloadFile(subtitle.data, subtitle.filename);

// Extract all subtitles as ZIP
const batch = await extractor.extractAllSubtitles(file);
console.log(`Extracted ${batch.successfulExtractions}/${batch.totalStreams} subtitle tracks`);
extractor.downloadZip(batch.zipBlob, batch.zipFilename);

// Clean up when done
await extractor.terminate();
```

## API Reference

### VideoMetadataExtractor

The main class for video processing operations.

#### Constructor Options

```typescript
interface VideoMetadataExtractorOptions {
  /** Custom FFmpeg core URL */
  ffmpegCoreURL?: string;
  /** Custom FFmpeg WASM URL */
  ffmpegWasmURL?: string;
  /** Progress callback */
  onProgress?: (progress: ProgressState) => void;
  /** Error callback */
  onError?: (error: ErrorState) => void;
  /** Enable debug logging */
  debug?: boolean;
  /** Timeout for FFmpeg operations in milliseconds */
  timeout?: number;
  /** Chunk size for large file processing in bytes */
  chunkSize?: number;
}
```

#### Methods

##### `initialize(): Promise<void>`
Initialize FFmpeg WASM. Must be called before any processing operations.

##### `extractMetadata(file: File): Promise<VideoMetadata>`
Extract comprehensive metadata from a video file.

**Parameters:**
- `file: File` - The video file to process

**Returns:** `VideoMetadata` object containing format info and stream details

##### `extractSubtitle(file: File, streamIndex: number, options?: ExtractionOptions): Promise<SubtitleExtractionResult>`
Extract a single subtitle track.

**Parameters:**
- `file: File` - The video file
- `streamIndex: number` - Index of the subtitle stream to extract
- `options?: ExtractionOptions` - Extraction configuration

**Options:**
```typescript
interface ExtractionOptions {
  /** Output format: 'srt' | 'ass' | 'vtt' | 'webvtt' */
  format?: string;
  /** Use quick extraction (faster but may be incomplete) */
  quick?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Custom filename */
  filename?: string;
}
```

**Returns:** `SubtitleExtractionResult` with subtitle data and metadata

##### `extractAllSubtitles(file: File): Promise<BatchExtractionResult>`
Extract all subtitle tracks and create a ZIP file.

**Parameters:**
- `file: File` - The video file

**Returns:** `BatchExtractionResult` with all extracted subtitles and ZIP blob

##### `downloadFile(data: Uint8Array, filename: string, progressCallback?: (progress: number) => void): void`
Download a subtitle file (handles large files automatically).

##### `downloadZip(zipBlob: Blob, filename: string): void`
Download a ZIP file containing multiple subtitles.

##### `isInitialized(): boolean`
Check if FFmpeg is initialized and ready for use.

##### `getSupportedFormats(): string[]`
Get list of supported video file formats.

##### `terminate(): Promise<void>`
Clean up resources and terminate FFmpeg.

## Data Types

### VideoMetadata
Contains comprehensive video file information:

```typescript
interface VideoMetadata {
  format?: {
    filename: string;
    format_name: string;
    duration: string;
    size: string;
    bit_rate: string;
    fps: string;
    movietimems: string;
    movieframes: string;
  };
  streams?: Array<{
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    language?: string;
    forced?: boolean;
    default?: boolean;
    index?: number;
    // ... additional stream properties
  }>;
}
```

### SubtitleExtractionResult
Result from individual subtitle extraction:

```typescript
interface SubtitleExtractionResult {
  data: Uint8Array;
  filename: string;
  extension: string;
  size: number;
  preview: string;
}
```

### BatchExtractionResult
Result from batch subtitle extraction:

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
  zipBlob: Blob;
  zipFilename: string;
  totalStreams: number;
  successfulExtractions: number;
}
```

## Supported Formats

The library supports a wide range of video formats including:

**Video Formats:** MP4, AVI, MOV, MKV, WebM, FLV, WMV, MPG, MPEG, TS, M2TS, OGV, GIF, and many more

**Subtitle Formats:** SRT, ASS, VTT, WebVTT

## Memory Management

The library uses advanced chunked processing to handle files of any size:

- **Chunked Reading**: Files are processed in 500MB chunks to maintain consistent memory usage
- **Progressive Extraction**: Large files use progressive chunk extraction for subtitle processing
- **Automatic Cleanup**: Temporary files are automatically cleaned up after operations
- **Memory-Safe**: Peak memory usage stays around 500MB regardless of file size

## Browser Compatibility

Requires modern browsers with WebAssembly support:
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 79+

## React Integration

For React applications, you can also use the included React hook:

```typescript
import { useVideoMetadata } from '@opensubtitles/video-metadata-extractor';

function VideoProcessor() {
  const {
    metadata,
    progress,
    error,
    isLoaded,
    handleFileSelect,
    extractSubtitle,
    extractAllSubtitles
  } = useVideoMetadata();

  const handleFile = (file: File) => {
    handleFileSelect(file);
  };

  // ... component logic
}
```

## Examples

### Basic Metadata Extraction

```typescript
import { VideoMetadataExtractor } from '@opensubtitles/video-metadata-extractor';

const extractor = new VideoMetadataExtractor();
await extractor.initialize();

const file = document.querySelector('input[type="file"]').files[0];
const metadata = await extractor.extractMetadata(file);

console.log(`Duration: ${metadata.format?.duration} seconds`);
console.log(`Resolution: ${metadata.streams?.[0]?.width}x${metadata.streams?.[0]?.height}`);
console.log(`Subtitle tracks: ${metadata.streams?.filter(s => s.codec_type === 'subtitle').length}`);
```

### Subtitle Extraction with Progress

```typescript
const extractor = new VideoMetadataExtractor({
  onProgress: (progress) => {
    document.getElementById('progress').textContent = 
      `${progress.progress}% - ${progress.text}`;
  }
});

await extractor.initialize();

// Quick extraction for fast results
const quickSubtitle = await extractor.extractSubtitle(file, 2, { 
  format: 'srt', 
  quick: true 
});

// Full extraction for complete results
const fullSubtitle = await extractor.extractSubtitle(file, 2, { 
  format: 'srt', 
  quick: false 
});
```

### Batch Processing

```typescript
const extractor = new VideoMetadataExtractor({ debug: true });
await extractor.initialize();

// Extract all subtitles
const batch = await extractor.extractAllSubtitles(file);

console.log(`Successfully extracted ${batch.successfulExtractions} out of ${batch.totalStreams} subtitle tracks:`);

batch.extractedFiles.forEach(subtitle => {
  console.log(`- ${subtitle.filename} (${subtitle.language || 'unknown'}) - ${subtitle.size} bytes`);
});

// Download the ZIP file
extractor.downloadZip(batch.zipBlob, batch.zipFilename);
```

## Error Handling

```typescript
const extractor = new VideoMetadataExtractor({
  onError: (error) => {
    console.error('Extraction error:', error.message);
    // Handle error in UI
  }
});

try {
  await extractor.initialize();
  const metadata = await extractor.extractMetadata(file);
} catch (error) {
  console.error('Failed to process video:', error.message);
}
```

## License

MIT

## Contributing

This package is part of the [OpenSubtitles](https://www.opensubtitles.org) ecosystem. Contributions are welcome!

## Links

- [GitHub Repository](https://github.com/opensubtitles/video-metadata-extractor-js)
- [Live Demo](https://opensubtitles.github.io/video-metadata-extractor-js/)
- [OpenSubtitles.org](https://www.opensubtitles.org)