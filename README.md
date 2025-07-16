# Video Metadata Extractor

A browser-based video metadata extractor that uses FFmpeg WASM to analyze video files and extract comprehensive metadata information.

## Features

- **Browser-based**: No server required, runs entirely in the browser
- **Large file support**: Handles files up to 2GB with chunked reading
- **FFmpeg WASM**: Uses the powerful FFmpeg library compiled to WebAssembly
- **Comprehensive metadata**: Extracts format, video, and audio stream information
- **Responsive UI**: Clean, modern interface that works on desktop and mobile
- **Progress tracking**: Real-time progress indicators during processing

## Usage

1. Open `index.html` in a web browser
2. Click "Choose Video File" to select a video file
3. Wait for FFmpeg to load (first time only)
4. View extracted metadata including:
   - Format information (duration, size, bitrate)
   - Video streams (resolution, codec, frame rate)
   - Audio streams (sample rate, channels, codec)

## Technical Details

### Chunked Reading
The application reads only the first 32MB of large video files, which is sufficient for metadata extraction while staying under browser memory limits.

### FFmpeg Integration
Uses FFmpeg WASM v0.12.10 with the following command:
```bash
ffmpeg -v quiet -print_format json -show_format -show_streams -i input.ext
```

### Supported Formats
Supports all video formats that FFmpeg can handle, including:
- MP4, AVI, MOV, MKV
- WebM, OGV, FLV
- And many more

## Files Structure

- `index.html` - Main HTML page with UI structure
- `styles.css` - Styling for the application
- `script.js` - Main JavaScript application logic
- `README.md` - This documentation

## Browser Compatibility

- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 79+

Requires browsers that support WebAssembly and modern JavaScript features.

## Development

To run locally:
1. Serve the files from a web server (required for WASM loading)
2. For development: `python -m http.server 8000` or similar
3. Open `http://localhost:8000` in your browser

## License

MIT License