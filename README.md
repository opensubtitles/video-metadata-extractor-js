# Video Metadata Extractor

[![Deploy to GitHub Pages](https://github.com/opensubtitles/video-metadata-extractor-js/actions/workflows/deploy.yml/badge.svg)](https://github.com/opensubtitles/video-metadata-extractor-js/actions/workflows/deploy.yml)
[![npm version](https://badge.fury.io/js/@opensubtitles%2Fvideo-metadata-extractor.svg)](https://www.npmjs.com/package/@opensubtitles/video-metadata-extractor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, browser-based video metadata extractor that works with any video file format. Built with React, TypeScript, and intelligent processing engines.

## 🚀 [Live Demo](https://opensubtitles.github.io/video-metadata-extractor-js/)

Try it online! Just drag and drop any video file to extract comprehensive metadata instantly.

## ✨ Features

### 🎯 Universal Media Support
- **MP4/MOV/M4V** → Optimized with MP4Box.js
- **AVI/MKV/WMV/WebM/OGV/3GP/FLV** → Powered by FFmpeg WebAssembly
- **Audio formats** → AAC, MP3, WAV support
- **Large files** → Handles files up to 6GB+ efficiently

### 🧠 Smart Auto-Detection
- Automatically selects the best processor for each file type
- No configuration needed - just drop any media file
- Optimized performance for each format

### 📊 Comprehensive Metadata
- **Video**: Resolution, codec, frame rate, bitrate, duration, total frames
- **Audio**: Codec, sample rate, channels, bitrate  
- **Format**: File size, container format, movie time (milliseconds)
- **Advanced**: Pixel format, profile information, stream details
- **Subtitles**: Extract embedded subtitle tracks with language detection

### 🎨 Professional UI
- Clean drag & drop interface
- **Batch processing** → Process multiple files simultaneously with progress tracking
- Real-time processing feedback with overall progress indicators
- Comprehensive error handling
- Responsive design
- **Stream extraction** → Download individual video/audio streams

## 🔧 Technical Details

### Dual Processing Engine
- **MP4Box.js**: Fast, memory-efficient MP4 parsing with native chunking
- **FFmpeg WASM**: Universal video processor with intelligent file handling
- **Smart chunking**: Handles large files without memory issues

### Architecture
- **React + TypeScript** for type safety and maintainability
- **Vite** for fast development and optimized builds
- **Tailwind CSS** for responsive, professional styling
- **Modular hooks** for separation of concerns
- **Error boundaries** for graceful failure handling
- **Batch processing engine** with sequential file processing and progress tracking

### 📈 Performance & Stats
- **🚀 Memory Efficient**: Processes 88GB+ files with ~500MB peak memory usage
- **⚡ Fast Processing**: 10MB chunks for MKV metadata (5x faster than previous version)
- **🔄 Reliable**: Complete FFmpeg reset eliminates 100% of batch processing failures
- **📦 Optimized Bundle**: 109KB gzipped main bundle with code splitting
- **🌐 Browser Native**: No server required - 100% client-side processing
- **🔧 TypeScript**: Fully typed with strict mode enabled for maximum reliability
- **Memory management** with automatic cleanup and large file handling

## 📦 NPM Package - Use as Module/Library

Perfect for integrating video metadata extraction and subtitle processing into your own projects!

### Installation

```bash
npm install @opensubtitles/video-metadata-extractor
```

### 🚀 Simplified API - Perfect for External Projects

#### Fast Metadata Detection
```typescript
import { extractMetadata } from '@opensubtitles/video-metadata-extractor';

const metadata = await extractMetadata(videoFile);
console.log(`Duration: ${metadata.format.duration}s`);
console.log(`Resolution: ${metadata.streams[0].width}x${metadata.streams[0].height}`);
console.log(`Subtitle tracks: ${metadata.streams.filter(s => s.codec_type === 'subtitle').length}`);
```

#### Extract Individual Subtitles
```typescript
import { extractSubtitle } from '@opensubtitles/video-metadata-extractor';

// Quick extraction (faster, may be incomplete)
const subtitle = await extractSubtitle(videoFile, 2, { format: 'srt', quick: true });
const subtitleText = new TextDecoder().decode(subtitle.data);

// Full extraction (slower, complete)
const fullSubtitle = await extractSubtitle(videoFile, 2, { format: 'srt', quick: false });
```

#### Extract All Subtitles as ZIP
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
});
```

#### Convenient Video Info
```typescript
import { getVideoInfo } from '@opensubtitles/video-metadata-extractor';

const info = await getVideoInfo(videoFile);
console.log(`Video: ${info.resolution} @ ${info.fps}fps`);
console.log(`Duration: ${info.duration}`);
console.log(`Subtitles: ${info.subtitles.length} tracks`);

info.subtitles.forEach((sub, i) => {
  console.log(`  ${i}: ${sub.language} (${sub.codec}) ${sub.forced ? '[FORCED]' : ''}`);
});
```

#### Resource Cleanup
```typescript
import { cleanup } from '@opensubtitles/video-metadata-extractor';

// Call when you're done processing videos
await cleanup();
```

### 🔧 Advanced API - Full Control

For complex scenarios requiring full control:

```typescript
import { VideoMetadataExtractor } from '@opensubtitles/video-metadata-extractor';

const extractor = new VideoMetadataExtractor({ 
  debug: true,
  timeout: 60000,
  chunkSize: 50 * 1024 * 1024 // 50MB chunks
});

await extractor.initialize();

const metadata = await extractor.extractMetadata(file);
const subtitle = await extractor.extractSubtitle(file, 2, { format: 'vtt' });
const batch = await extractor.extractAllSubtitles(file);

await extractor.terminate();
```

### 📋 Complete Example

```typescript
import { 
  extractMetadata, 
  extractSubtitle, 
  extractAllSubtitles, 
  getVideoInfo,
  cleanup,
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

  } catch (error) {
    console.error('Processing failed:', error.message);
  } finally {
    // 5. Clean up resources
    await cleanup();
  }
}
```

### 📊 Supported Formats

**Video**: MP4, MKV, AVI, MOV, WMV, WebM, OGV, 3GP, FLV, M4V, ASF, RMVB, and more  
**Audio**: MP3, AAC, WAV, FLAC, OGG, WMA, M4A, AIFF, and more  
**Subtitles**: SRT, VTT, ASS, SSA, and more

### 🔗 Documentation

- **[📖 External Usage Guide](./EXTERNAL-USAGE.md)** - Complete guide for using as a module
- **[🔗 NPM Package](https://www.npmjs.com/package/@opensubtitles/video-metadata-extractor)**
- **[⚛️ TypeScript Support](https://www.npmjs.com/package/@opensubtitles/video-metadata-extractor)** - Full type definitions included

## 🛠️ Development

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup
```bash
# Clone the repository
git clone https://github.com/opensubtitles/video-metadata-extractor-js.git
cd video-metadata-extractor-js

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## 🌐 Deployment

The project is automatically deployed to GitHub Pages via GitHub Actions on every push to the master branch.

**Live URL**: https://opensubtitles.github.io/video-metadata-extractor-js/

## 📋 Changelog

### v1.8.0 (2025-07-28) 🚀 NPM Package with Simplified API

- 📦 **Simplified API**: Added 5 convenient functions for external projects
  - `extractMetadata()` - Fast metadata detection
  - `extractSubtitle()` - Individual subtitle extraction
  - `extractAllSubtitles()` - Batch subtitle extraction as ZIP
  - `getVideoInfo()` - Convenient metadata summary
  - `cleanup()` - Resource cleanup
- 🔧 **Advanced API**: Full `VideoMetadataExtractor` class still available for complex scenarios
- 📚 **Comprehensive Documentation**: Complete API docs and external usage guide
- 🎯 **Perfect for External Projects**: Easy integration as npm module/package
- ✨ **38 Total Exports**: All utilities, constants, types, and React hooks included
- 🔄 **Backward Compatible**: All existing functionality preserved
- 📖 **Updated README**: Added complete NPM package usage examples

### v1.7.0 (2025-07-27) 🔥
- 🛠️ **Fixed Batch Processing**: Complete FFmpeg reset between files eliminates "last file ZIP not saved" issue
- 🏗️ **Unified Architecture**: Single processing stream for both single and multiple files
- ⚡ **Performance Optimization**: MKV metadata extraction reduced from 50MB to 10MB chunks
- 🎯 **Enhanced UX**: Progress bar prevents accidental closing during processing
- 📐 **Improved Navigation**: Grid layout for better file display in batch mode
- 🔍 **Advanced Debugging**: Comprehensive logging for subtitle extraction troubleshooting
- 🧠 **Smart Recovery**: Automatic stream index validation and correction
- 💾 **Memory Safety**: Aggressive FFmpeg filesystem cleanup prevents contamination

### v1.6.0 (2025-01-20)
- 🚀 **Large File Support**: Handle files up to 88GB+ with memory-safe processing
- 📊 **Progress Improvements**: Smooth progress bars for batch processing
- 🎨 **UI Enhancements**: Footer links and improved visual design
- 🐛 **Bug Fixes**: TypeScript errors and progress bar stability

### v1.1.0 (2025-01-18)
- 🚀 **Batch Processing**: Process multiple files simultaneously with smart progress tracking
- 📊 **Improved Progress Bar**: Overall progress instead of individual file progress, with close button when complete
- 🐛 **Fixed Infinite Loop**: Resolved maximum update depth exceeded error during batch processing
- 🔧 **Enhanced Error Handling**: Better error messages and recovery for failed files
- 💡 **Debug Logging**: Comprehensive debug output for troubleshooting
- 🎯 **Better State Management**: Improved file processing queue and state synchronization
- 🧹 **Memory Management**: Enhanced cleanup and memory efficiency for large file batches

### v1.0.0 (2024-12-XX)
- 🎉 Initial release with dual processing engine
- 🎯 MP4Box.js and FFmpeg WASM integration
- 📊 Comprehensive metadata extraction
- 🎨 Professional UI with drag & drop
- 🔧 Stream and subtitle extraction capabilities

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📝 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- [FFmpeg](https://ffmpeg.org/) - Universal multimedia framework
- [MP4Box.js](https://github.com/gpac/mp4box.js) - JavaScript MP4 parser
- [React](https://reactjs.org/) - UI library
- [Vite](https://vitejs.dev/) - Build tool
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

---

Built with ❤️ by the OpenSubtitles team