# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser-based video metadata extractor and subtitle extractor built with React, TypeScript, Vite, and Tailwind CSS. It uses FFmpeg WebAssembly (WASM) to analyze video files, extract comprehensive metadata information, and extract subtitle tracks from MKV/WebM files. The application uses memory-safe chunked processing to handle files of any size and is a client-side only solution that runs entirely in the browser without requiring a server.

### Key Features

- **Video Metadata Extraction**: Comprehensive analysis of video file properties, streams, and format information
- **Subtitle Extraction**: Individual subtitle track extraction with Quick and Full methods
- **Batch Subtitle Extraction**: Extract all subtitle tracks at once as a ZIP file from MKV/WebM files
- **Unlimited File Size Support**: Memory-safe processing of files of any size using 500MB chunked streaming (tested up to 10GB, theoretically unlimited)
- **Smart File Processing**: Automatic format detection with optimized processing strategies
- **Browser-Native**: No server required, all processing happens in the browser

## Architecture

### Core Components

- **App Component (src/App.tsx)**: Main application container that orchestrates all components
- **useVideoMetadata Hook (src/hooks/useVideoMetadata.ts)**: Custom hook managing FFmpeg integration and metadata extraction
- **FileUpload Component (src/components/FileUpload.tsx)**: File selection and upload interface
- **ProgressBar Component (src/components/ProgressBar.tsx)**: Progress indication during processing
- **MetadataDisplay Component (src/components/MetadataDisplay.tsx)**: Structured metadata visualization
- **ErrorDisplay Component (src/components/ErrorDisplay.tsx)**: Error messaging and handling

### Key Functionality

- **useVideoMetadata Hook**: Manages FFmpeg loading, file processing, metadata extraction, and subtitle extraction
- **Complete File Reading**: Processes entire files of any size using memory-safe chunking (500MB chunks for files >=2GB, peak memory usage ~500MB regardless of file size)
- **Subtitle Extraction**: Individual and batch subtitle extraction with support for multiple formats (SRT, ASS, VTT)
- **Smart Duplicate Handling**: Automatic filename generation with track numbers for duplicate languages
- **ZIP Generation**: Creates downloadable ZIP files containing all extracted subtitle tracks
- **TypeScript Integration**: Full type safety with custom interfaces for metadata and extraction structures
- **Responsive Design**: Tailwind CSS for modern, responsive UI components

## Development Commands

### Local Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run TypeScript type checking
```

### Testing
Run `npm run dev` and open `http://localhost:5173` in browser

### Important Notes
- **NEVER run server commands automatically** - Always ask the user before starting any development server
- If you need to restart the server, ask the user first

## File Structure

```
src/
├── components/           # React components
│   ├── FileUpload.tsx   # File selection interface
│   ├── ProgressBar.tsx  # Progress indication
│   ├── MetadataDisplay.tsx # Metadata visualization
│   └── ErrorDisplay.tsx # Error handling
├── hooks/
│   └── useVideoMetadata.ts # Core metadata extraction logic
├── types/
│   └── index.ts         # TypeScript type definitions
├── App.tsx              # Main application component
├── main.tsx             # React application entry point
└── index.css            # Tailwind CSS imports
```

## FFmpeg Integration Details

### Command Used
```bash
ffmpeg -v quiet -print_format json -show_format -show_streams -i input.ext
```

### Dependencies
- **@ffmpeg/ffmpeg**: ^0.12.15 - Main FFmpeg WASM library
- **@ffmpeg/util**: ^0.12.2 - FFmpeg utilities
- **FFmpeg Core**: @ffmpeg/core@0.12.6 (loaded from unpkg.com CDN)

### Configuration
- Vite config includes FFmpeg optimization exclusions
- CORS headers configured for WASM loading
- TypeScript strict mode enabled

## Browser Compatibility

Requires modern browsers with WebAssembly support:
- Chrome 57+, Firefox 52+, Safari 11+, Edge 79+

## Memory Management

- Uses 32MB chunks for large file processing
- Automatically cleans up temporary files in FFmpeg virtual filesystem
- Handles files up to 2GB by reading only metadata-relevant portions

## Error Handling

Comprehensive error handling implemented via:
- Custom error state management in useVideoMetadata hook
- Error boundary components for graceful failure handling
- User-friendly error messages with dismissal functionality

## TypeScript Types

Key interfaces defined in `src/types/index.ts`:
- `VideoMetadata`: Structure for parsed FFmpeg output
- `ProgressState`: Progress tracking state
- `ErrorState`: Error handling state