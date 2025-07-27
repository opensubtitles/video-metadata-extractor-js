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