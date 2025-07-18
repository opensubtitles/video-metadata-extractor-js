# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser-based video metadata extractor built with React, TypeScript, Vite, and Tailwind CSS. It uses FFmpeg WebAssembly (WASM) to analyze video files and extract comprehensive metadata information. The application is a client-side only solution that runs entirely in the browser without requiring a server.

## Architecture

### Core Components

- **App Component (src/App.tsx)**: Main application container that orchestrates all components
- **useVideoMetadata Hook (src/hooks/useVideoMetadata.ts)**: Custom hook managing FFmpeg integration and metadata extraction
- **FileUpload Component (src/components/FileUpload.tsx)**: File selection and upload interface
- **ProgressBar Component (src/components/ProgressBar.tsx)**: Progress indication during processing
- **MetadataDisplay Component (src/components/MetadataDisplay.tsx)**: Structured metadata visualization
- **ErrorDisplay Component (src/components/ErrorDisplay.tsx)**: Error messaging and handling

### Key Functionality

- **useVideoMetadata Hook**: Manages FFmpeg loading, file processing, and state management
- **Chunked File Reading**: Handles large files (up to 2GB) by reading only the first 32MB chunk for metadata extraction
- **TypeScript Integration**: Full type safety with custom interfaces for metadata structures
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