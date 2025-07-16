# Video Metadata Extractor

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

### 🎨 Professional UI
- Clean drag & drop interface
- Real-time processing feedback
- Comprehensive error handling
- Responsive design
- Progress indicators

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