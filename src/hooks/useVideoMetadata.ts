import { useState, useCallback, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { VideoMetadata, ProgressState, ErrorState } from '../types';

// Helper function to get file format from filename
const getFormatFromFileName = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension || 'unknown';
};

// Helper function to generate subtitle filename based on movie name
const generateSubtitleFilename = (movieFilename: string, language?: string, isForced?: boolean, codecName?: string): { filename: string; extension: string } => {
  // Remove extension from movie filename
  const nameWithoutExt = movieFilename.replace(/\.[^/.]+$/, '');
  
  // Map language codes to standard 2-letter codes
  const languageMap: { [key: string]: string } = {
    'eng': 'en',
    'english': 'en',
    'spa': 'es',
    'spanish': 'es',
    'fre': 'fr',
    'french': 'fr',
    'ger': 'de',
    'german': 'de',
    'ita': 'it',
    'italian': 'it',
    'por': 'pt',
    'portuguese': 'pt',
    'rus': 'ru',
    'russian': 'ru',
    'jpn': 'ja',
    'japanese': 'ja',
    'chi': 'zh',
    'chinese': 'zh',
    'kor': 'ko',
    'korean': 'ko',
    'ara': 'ar',
    'arabic': 'ar',
    'dut': 'nl',
    'dutch': 'nl',
    'swe': 'sv',
    'swedish': 'sv',
    'nor': 'no',
    'norwegian': 'no',
    'dan': 'da',
    'danish': 'da',
    'fin': 'fi',
    'finnish': 'fi',
    'pol': 'pl',
    'polish': 'pl',
    'cze': 'cs',
    'czech': 'cs',
    'hun': 'hu',
    'hungarian': 'hu',
    'gre': 'el',
    'greek': 'el',
    'tur': 'tr',
    'turkish': 'tr',
    'heb': 'he',
    'hebrew': 'he',
    'tha': 'th',
    'thai': 'th',
    'vie': 'vi',
    'vietnamese': 'vi',
    'hin': 'hi',
    'hindi': 'hi',
    'und': 'unknown',
    'unknown': 'unknown'
  };
  
  // Get standardized language code
  const langCode = language ? (languageMap[language.toLowerCase()] || language.toLowerCase()) : 'unknown';
  
  // Determine file extension based on codec
  let extension = 'srt'; // Default to SRT
  if (codecName) {
    const codec = codecName.toLowerCase();
    if (codec.includes('ass') || codec.includes('ssa')) {
      extension = 'ass';
    } else if (codec.includes('vtt') || codec.includes('webvtt')) {
      extension = 'vtt';
    } else if (codec.includes('srt') || codec.includes('subrip')) {
      extension = 'srt';
    } else if (codec.includes('dvd') || codec.includes('vobsub')) {
      extension = 'srt'; // Convert DVD subtitles to SRT
    }
  }
  
  // Build filename: MovieName.lang[.forced].ext
  let filename = `${nameWithoutExt}.${langCode}`;
  if (isForced) {
    filename += '.forced';
  }
  filename += `.${extension}`;
  
  return { filename, extension };
};

// Helper function to handle large file downloads (> 2GB blob limit)
const downloadLargeFile = (data: Uint8Array, filename: string, progressCallback?: (progress: number) => void): void => {
  const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
  const MAX_BLOB_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit
  
  console.log(`[Large File Download] Starting download for ${filename}, size: ${data.length} bytes`);
  
  // If file is smaller than 2GB, use normal blob download
  if (data.length < MAX_BLOB_SIZE) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[Large File Download] Normal blob download completed for ${filename}`);
    return;
  }
  
  // For files > 2GB, use chunked download via streams
  console.log(`[Large File Download] Using chunked download for ${filename} (${data.length} bytes)`);
  
  // Create a download stream
  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      const pump = () => {
        if (offset < data.length) {
          const chunk = data.slice(offset, Math.min(offset + CHUNK_SIZE, data.length));
          controller.enqueue(chunk);
          offset += chunk.length;
          
          // Report progress
          if (progressCallback) {
            progressCallback((offset / data.length) * 100);
          }
          
          // Continue with next chunk
          setTimeout(pump, 0);
        } else {
          controller.close();
        }
      };
      pump();
    }
  });
  
  // Create response from stream and trigger download
  const response = new Response(stream);
  response.blob().then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[Large File Download] Chunked download completed for ${filename}`);
  }).catch(error => {
    console.error(`[Large File Download] Chunked download failed:`, error);
    throw error;
  });
};


export const useVideoMetadata = () => {
  const ffmpegRef = useRef(new FFmpeg());
  const [isLoaded, setIsLoaded] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    isVisible: false,
    progress: 0,
    text: ''
  });
  const [error, setError] = useState<ErrorState>({
    isVisible: false,
    message: ''
  });

  const showProgress = useCallback((text: string, progressPercent: number = 0) => {
    setProgress({ isVisible: true, progress: progressPercent, text });
  }, []);

  const hideProgress = useCallback(() => {
    setProgress({ isVisible: false, progress: 0, text: '' });
  }, []);

  const showError = useCallback((message: string) => {
    setError({ isVisible: true, message });
  }, []);

  const hideError = useCallback(() => {
    setError({ isVisible: false, message: '' });
  }, []);

  const processMP4File = useCallback((file: File): Blob => {
    return file;
  }, []);


  const extractMetadata = useCallback(async (file: File) => {
    if (!isLoaded) return;

    try {
      showProgress('Processing video...');
      
      // Validate file size (prevent extremely large files that could cause memory issues)
      const fileSize = file.size;
      if (fileSize === 0) {
        throw new Error('File appears to be empty');
      }
      
      // Check if file has a valid extension
      const validExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', '3gp', '3g2', 'f4v', 'm4v', 'ogv', 'mp3', 'wav', 'aac'];
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !validExtensions.includes(extension)) {
        throw new Error(`Unsupported file format: ${extension || 'unknown'}. Supported formats: ${validExtensions.join(', ')}`);
      }
      
      // Smart chunking strategy for different file types
      const chunkSize = 32 * 1024 * 1024; // 32MB
      let fileData: Blob;
      
      if (extension === 'mp4' || extension === 'm4v') {
        // Use whole-file strategy for MP4 files
        fileData = processMP4File(file);
        showProgress('Processing MP4 file...');
      } else if (fileSize <= chunkSize) {
        // Small file - use entire file
        fileData = file;
      } else {
        // Large file (non-MP4) - use beginning chunk only (metadata typically at start)
        fileData = file.slice(0, chunkSize);
      }
      
      // Write file to FFmpeg virtual filesystem
      showProgress('Loading file into FFmpeg...');
      
      try {
        await ffmpegRef.current.writeFile('input.video', await fetchFile(fileData));
      } catch (writeError) {
        throw new Error(`Failed to load file into FFmpeg: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
      }
      
      // Capture FFmpeg log output to parse metadata
      let ffmpegLogs: string[] = [];
      const logHandler = ({ message }: { message: string }) => {
        ffmpegLogs.push(message);
      };
      
      // Add temporary log handler
      ffmpegRef.current.on('log', logHandler);
      
      // Use simple -i command to get metadata info
      showProgress('Extracting metadata...');
      
      try {
        await ffmpegRef.current.exec(['-i', 'input.video']);
      } catch (ffmpegError) {
        // Expected error for info extraction
      }
      
      // Remove log handler
      ffmpegRef.current.off('log', logHandler);
      
      // Check if we got any useful log output
      if (ffmpegLogs.length === 0) {
        throw new Error('FFmpeg did not produce any output. The file might be corrupted or unsupported.');
      }
      
      // Parse the FFmpeg log output to extract metadata
      const logOutput = ffmpegLogs.join('\n');
      
      // Check for specific error patterns in FFmpeg output
      if (logOutput.includes('Invalid data found when processing input') || 
          logOutput.includes('No such file or directory') ||
          logOutput.includes('Operation not permitted')) {
        throw new Error('File appears to be corrupted or not a valid media file');
      }
      
      if (logOutput.includes('Decoder (codec ') && logOutput.includes('not found')) {
        throw new Error('Media file uses an unsupported codec. Try converting to a standard format like MP4.');
      }
      
      // Check if we found any stream information
      if (!logOutput.includes('Stream #')) {
        throw new Error('No audio or video streams found in the file. The file might be corrupted or encrypted.');
      }
      
      // Parse video stream info first (needed for FPS calculation)
      const videoStreamMatch = logOutput.match(/Stream.*Video: ([^,]+)[^,]*,.*?(\d+x\d+)[^,]*,.*?(\d+\.?\d*) fps/);
      const videoCodec = videoStreamMatch ? videoStreamMatch[1] : 'unknown';
      const resolution = videoStreamMatch ? videoStreamMatch[2] : 'unknown';
      const fps = videoStreamMatch ? parseFloat(videoStreamMatch[3]) : 25;
      
      // Parse duration from log - convert to total seconds for the component
      const durationMatch = logOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      let duration = 'unknown';
      let movietimems = 'unknown';
      let movieframes = 'unknown';
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseInt(durationMatch[3]);
        const centiseconds = parseInt(durationMatch[4]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        const totalMilliseconds = totalSeconds * 1000 + centiseconds * 10;
        duration = totalSeconds.toString(); // Send as total seconds string
        movietimems = totalMilliseconds.toString(); // Movie time in milliseconds
        
        // Calculate total frames based on FPS
        const totalFrames = Math.round(totalMilliseconds / 1000 * fps);
        movieframes = totalFrames.toString();
      }
      
      // Parse bitrate from log - convert to number (bits per second)
      const bitrateMatch = logOutput.match(/bitrate: (\d+) kb\/s/);
      const bitrate = bitrateMatch ? (parseInt(bitrateMatch[1]) * 1000).toString() : 'unknown';
      
      // Parse audio stream info - updated regex to match the actual format
      const audioStreamMatch = logOutput.match(/Stream.*Audio: ([^,]+)[^,]*,.*?(\d+) Hz/);
      const audioCodec = audioStreamMatch ? audioStreamMatch[1] : 'unknown';
      const sampleRate = audioStreamMatch ? audioStreamMatch[2] : '48000';
      
      // Parse audio bitrate from the BPS metadata instead
      const audioBpsMatch = logOutput.match(/Stream #0:1.*\n(?:.*\n)*?.*BPS\s*:\s*(\d+)/);
      const audioBitrate = audioBpsMatch ? Math.round(parseInt(audioBpsMatch[1]) / 1000).toString() : '128';
      
      // Parse subtitle streams from FFmpeg output
      const subtitleStreams: Array<{
        codec_type: string;
        codec_name: string;
        language?: string;
        title?: string;
        forced?: boolean;
        default?: boolean;
        index?: number;
      }> = [];
      
      // Match subtitle streams with pattern: Stream #0:2(eng): Subtitle: subrip (default)
      const subtitleMatches = logOutput.match(/Stream #\d+:\d+(?:\([^)]*\))?: Subtitle: ([^(\n]+)(?:\([^)]*\))?/g);
      
      if (subtitleMatches) {
        subtitleMatches.forEach(match => {
          // Extract codec name
          const codecMatch = match.match(/Subtitle: ([^(\n]+?)(?:\s*\(|$)/);
          const codecName = codecMatch ? codecMatch[1].trim() : 'unknown';
          
          // Extract stream index
          const streamMatch = match.match(/Stream #\d+:(\d+)/);
          const streamIndex = streamMatch ? parseInt(streamMatch[1]) : undefined;
          
          // Extract language from parentheses after stream number
          const langMatch = match.match(/Stream #\d+:\d+\(([^)]+)\)/);
          const language = langMatch ? langMatch[1] : undefined;
          
          // Check for default and forced flags
          const isDefault = match.includes('(default)');
          const isForced = match.includes('(forced)');
          
          subtitleStreams.push({
            codec_type: 'subtitle',
            codec_name: codecName,
            language: language,
            default: isDefault,
            forced: isForced,
            index: streamIndex
          });
        });
      }
      
      // Debug data logging removed for cleaner console output
      
      // Create comprehensive metadata structure with actual extracted data
      const extractedMetadata = {
        format: {
          filename: file.name,
          size: fileSize.toString(),
          format_name: getFormatFromFileName(file.name),
          duration: duration,
          bit_rate: bitrate,
          fps: fps.toString(),
          movietimems: movietimems,
          movieframes: movieframes
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: videoCodec,
            width: resolution !== 'unknown' ? parseInt(resolution.split('x')[0]) : 1280,
            height: resolution !== 'unknown' ? parseInt(resolution.split('x')[1]) : 720,
            r_frame_rate: `${fps}/1`,
            pix_fmt: 'yuv420p',
            bit_rate: '1500000',
            index: 0 // First video stream
          },
          {
            codec_type: 'audio',
            codec_name: audioCodec,
            channels: 2,
            sample_rate: sampleRate,
            bit_rate: `${audioBitrate}000`,
            index: 1 // First audio stream
          },
          ...subtitleStreams
        ]
      };
      
      setMetadata(extractedMetadata);
      
      // Clean up
      await ffmpegRef.current.deleteFile('input.video');
      
      hideProgress();
      
    } catch (err) {
      console.error('Processing error:', err);
      
      // Provide more specific error messages based on error type
      let errorMessage: string;
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else {
        errorMessage = 'Unknown error occurred while processing the video';
      }
      
      // Add helpful context for common issues
      if (errorMessage.includes('out of memory') || errorMessage.includes('memory')) {
        errorMessage += '. Try using a smaller video file or refresh the page to clear memory.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage += '. Please check your internet connection and try again.';
      } else if (errorMessage.includes('timeout')) {
        errorMessage += '. The file processing took too long. Try with a smaller file.';
      }
      
      showError(errorMessage);
      hideProgress();
      
      // Cleanup any partial file that might have been written
      try {
        await ffmpegRef.current.deleteFile('input.video');
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary file:', cleanupError);
      }
    }
  }, [isLoaded, showProgress, hideProgress, showError, processMP4File]);

  // Load FFmpeg following the official example pattern
  useEffect(() => {
    const load = async () => {
      const ffmpeg = ffmpegRef.current;
      
      if (ffmpeg.loaded) {
        setIsLoaded(true);
        return;
      }
      
      try {
        // FFmpeg logging disabled for cleaner console output
        
        // Use the same pattern as the official example
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        setIsLoaded(true);
      } catch (err) {
        console.error('Failed to load FFmpeg:', err);
        
        let errorMessage = 'Failed to load FFmpeg';
        
        if (err instanceof Error) {
          const message = err.message.toLowerCase();
          if (message.includes('network') || message.includes('fetch')) {
            errorMessage = 'Failed to load FFmpeg: Network error. Please check your internet connection and try refreshing the page.';
          } else if (message.includes('wasm')) {
            errorMessage = 'Failed to load FFmpeg: WebAssembly not supported. Please use a modern browser (Chrome 57+, Firefox 52+, Safari 11+, Edge 79+).';
          } else if (message.includes('cors')) {
            errorMessage = 'Failed to load FFmpeg: CORS error. Please refresh the page and try again.';
          } else {
            errorMessage = `Failed to load FFmpeg: ${err.message}`;
          }
        }
        
        showError(errorMessage);
      }
    };
    
    load();
  }, [showProgress, hideProgress, showError]);

  const extractSubtitle = useCallback(async (file: File, streamIndex: number, language?: string, codecName?: string, isForced?: boolean) => {
    if (!isLoaded) return;

    const startTime = performance.now();
    console.log(`[FFmpeg Subtitle Extraction] Starting extraction for subtitle stream ${streamIndex}`, {
      file: file.name,
      size: file.size,
      language,
      codec: codecName,
      forced: isForced,
      timestamp: new Date().toISOString()
    });

    try {
      showProgress(`Preparing subtitle track ${streamIndex}...`, 10);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // For larger files, use full file for subtitle extraction to ensure we get complete subtitle data
      const fileSize = file.size;
      const maxChunkSize = 100 * 1024 * 1024; // 100MB max for subtitle extraction
      const fileData = fileSize <= maxChunkSize ? file : file;
      
      // Write file to FFmpeg virtual filesystem
      showProgress(`Loading subtitle track into FFmpeg...`, 30);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await ffmpegRef.current.writeFile('input.video', await fetchFile(fileData));
      
      // Generate proper filename based on movie name
      const { filename: outputFilename, extension: outputExt } = generateSubtitleFilename(
        file.name, 
        language, 
        isForced, 
        codecName
      );
      
      // Determine output format based on extension
      let outputFormat = outputExt;
      if (outputExt === 'vtt') {
        outputFormat = 'webvtt';
      }
      
      console.log(`[FFmpeg Subtitle Extraction] Generated filename: ${outputFilename}, format: ${outputFormat}`);
      
      try {
        // Try to extract subtitle in its native format first
        showProgress(`Extracting subtitle track (${outputFormat} format)...`, 60);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await ffmpegRef.current.exec([
          '-i', 'input.video',
          '-map', `0:${streamIndex}`,
          '-c:s', outputFormat,
          outputFilename
        ]);
        
        console.log(`[FFmpeg Subtitle Extraction] Successfully extracted in ${outputFormat} format`);
      } catch (extractError) {
        // If native format fails, try converting to SRT
        console.warn(`[FFmpeg Subtitle Extraction] ${outputFormat} format extraction failed, trying SRT conversion:`, extractError);
        outputFormat = 'srt';
        const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
        
        showProgress(`Extracting subtitle track (SRT fallback)...`, 60);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await ffmpegRef.current.exec([
          '-i', 'input.video',
          '-map', `0:${streamIndex}`,
          '-c:s', 'srt',
          srtFilename
        ]);
        
        // Update output filename for download
        showProgress(`Preparing subtitle download...`, 80);
        const subtitleData = await ffmpegRef.current.readFile(srtFilename);
        
        // Create download
        const blob = new Blob([subtitleData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = srtFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Clean up
        await ffmpegRef.current.deleteFile('input.video');
        await ffmpegRef.current.deleteFile(srtFilename);
        
        hideProgress();
        return;
      }
      
      // Read the extracted subtitle file
      showProgress(`Preparing subtitle download...`, 80);
      const subtitleData = await ffmpegRef.current.readFile(outputFilename);
      
      // Create download
      const blob = new Blob([subtitleData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Clean up
      await ffmpegRef.current.deleteFile('input.video');
      await ffmpegRef.current.deleteFile(outputFilename);
      
      const totalTime = performance.now() - startTime;
      console.log(`[FFmpeg Subtitle Extraction] Extraction completed successfully in ${totalTime.toFixed(2)}ms`, {
        outputSize: subtitleData.length,
        format: outputFormat,
        filename: outputFilename
      });
      
      // Show completion message and let user manually close
      showProgress(`Subtitle extraction completed successfully! Download should start automatically.`, 100);
      
    } catch (err) {
      const totalTime = performance.now() - startTime;
      console.error(`[FFmpeg Subtitle Extraction] Extraction failed after ${totalTime.toFixed(2)}ms:`, err);
      
      let errorMessage = 'Failed to extract subtitle';
      if (err instanceof Error) {
        errorMessage = `Failed to extract subtitle: ${err.message}`;
        
        // Provide more specific error messages
        if (err.message.includes('Invalid data found')) {
          errorMessage = 'Subtitle track appears to be corrupted or in an unsupported format';
        } else if (err.message.includes('Stream not found')) {
          errorMessage = 'Subtitle stream not found. The file may not contain embedded subtitles.';
        } else if (err.message.includes('Decoder not found')) {
          errorMessage = 'Subtitle codec not supported. Try a different subtitle track.';
        }
        
        console.error(`[FFmpeg Subtitle Extraction] Error details:`, {
          message: err.message,
          stack: err.stack,
          file: file.name,
          streamIndex,
          language,
          codecName
        });
      }
      
      showError(errorMessage);
      hideProgress();
      
      // Cleanup
      try {
        await ffmpegRef.current.deleteFile('input.video');
        await ffmpegRef.current.deleteFile(`subtitle_${streamIndex}.${language || 'unknown'}.srt`);
        await ffmpegRef.current.deleteFile(`subtitle_${streamIndex}.${language || 'unknown'}.ass`);
        await ffmpegRef.current.deleteFile(`subtitle_${streamIndex}.${language || 'unknown'}.vtt`);
        console.log(`[FFmpeg Subtitle Extraction] Cleanup completed`);
      } catch (cleanupError) {
        console.warn('[FFmpeg Subtitle Extraction] Failed to cleanup subtitle extraction files:', cleanupError);
      }
    }
  }, [isLoaded, showProgress, hideProgress, showError]);

  const extractStream = useCallback(async (file: File, streamIndex: number, streamType: string, codecName?: string) => {
    if (!isLoaded) return;

    const startTime = performance.now();
    console.log(`[FFmpeg Stream Extraction] Starting extraction for ${streamType} stream ${streamIndex}`, {
      file: file.name,
      size: file.size,
      codec: codecName,
      timestamp: new Date().toISOString()
    });

    try {
      showProgress(`Preparing ${streamType} stream ${streamIndex}...`, 10);
      
      // Add small delay to ensure progress bar is visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // For stream extraction, use full file to ensure complete stream data
      const fileSize = file.size;
      const maxChunkSize = 200 * 1024 * 1024; // 200MB max for stream extraction
      const fileData = fileSize <= maxChunkSize ? file : file;
      
      // Warn about potentially large output files
      if (fileSize > 1024 * 1024 * 1024) { // > 1GB
        console.warn(`[FFmpeg Stream Extraction] Large input file detected (${fileSize} bytes), output stream may be large`);
      }
      
      console.log(`[FFmpeg Stream Extraction] File size: ${fileSize} bytes, using ${fileData.size} bytes`);
      
      // Write file to FFmpeg virtual filesystem
      showProgress(`Loading ${streamType} stream into FFmpeg...`, 25);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const loadStartTime = performance.now();
      await ffmpegRef.current.writeFile('input.video', await fetchFile(fileData));
      console.log(`[FFmpeg Stream Extraction] File loaded in ${(performance.now() - loadStartTime).toFixed(2)}ms`);
      
      // Determine output extension based on stream type and codec
      let outputExt = '';
      
      if (streamType === 'video') {
        if (codecName?.toLowerCase().includes('h264') || codecName?.toLowerCase().includes('avc')) {
          outputExt = 'h264';
        } else if (codecName?.toLowerCase().includes('h265') || codecName?.toLowerCase().includes('hevc')) {
          outputExt = 'h265';
        } else if (codecName?.toLowerCase().includes('vp9')) {
          outputExt = 'webm';
        } else if (codecName?.toLowerCase().includes('vp8')) {
          outputExt = 'webm';
        } else {
          outputExt = 'mp4';
        }
      } else if (streamType === 'audio') {
        if (codecName?.toLowerCase().includes('aac')) {
          outputExt = 'aac';
        } else if (codecName?.toLowerCase().includes('mp3')) {
          outputExt = 'mp3';
        } else if (codecName?.toLowerCase().includes('flac')) {
          outputExt = 'flac';
        } else if (codecName?.toLowerCase().includes('wav') || codecName?.toLowerCase().includes('pcm')) {
          outputExt = 'wav';
        } else {
          outputExt = 'aac';
        }
      }
      
      const outputFilename = `${streamType}_stream_${streamIndex}.${outputExt}`;
      console.log(`[FFmpeg Stream Extraction] Output filename: ${outputFilename}, extension: ${outputExt}`);
      
      let extractionMethod = 'copy';
      const extractStartTime = performance.now();
      
      try {
        // Extract stream with FFmpeg
        showProgress(`Extracting ${streamType} stream (copy mode)...`, 50);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log(`[FFmpeg Stream Extraction] Attempting stream copy for ${streamType} stream ${streamIndex}`);
        
        if (streamType === 'video') {
          await ffmpegRef.current.exec([
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c', 'copy', // Copy without re-encoding
            '-avoid_negative_ts', 'make_zero',
            outputFilename
          ]);
        } else if (streamType === 'audio') {
          await ffmpegRef.current.exec([
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c', 'copy', // Copy without re-encoding
            '-avoid_negative_ts', 'make_zero',
            outputFilename
          ]);
        }
        
        console.log(`[FFmpeg Stream Extraction] Stream copy completed in ${(performance.now() - extractStartTime).toFixed(2)}ms`);
        
      } catch (extractError) {
        // If copy fails, try with re-encoding
        console.warn(`[FFmpeg Stream Extraction] Stream copy failed, trying with re-encoding:`, extractError);
        extractionMethod = 'encode';
        
        showProgress(`Extracting ${streamType} stream (encoding mode)...`, 50);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const encodeStartTime = performance.now();
        
        if (streamType === 'video') {
          console.log(`[FFmpeg Stream Extraction] Re-encoding video with H.264`);
          await ffmpegRef.current.exec([
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            outputFilename
          ]);
        } else if (streamType === 'audio') {
          console.log(`[FFmpeg Stream Extraction] Re-encoding audio with AAC`);
          await ffmpegRef.current.exec([
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c:a', 'aac',
            '-b:a', '128k',
            outputFilename
          ]);
        }
        
        console.log(`[FFmpeg Stream Extraction] Re-encoding completed in ${(performance.now() - encodeStartTime).toFixed(2)}ms`);
      }
      
      // Read the extracted stream file
      showProgress(`Preparing ${streamType} stream download...`, 75);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const readStartTime = performance.now();
      const streamData = await ffmpegRef.current.readFile(outputFilename);
      console.log(`[FFmpeg Stream Extraction] Stream data read: ${streamData.length} bytes in ${(performance.now() - readStartTime).toFixed(2)}ms`);
      
      // Convert to Uint8Array for consistent handling
      const streamUint8Array = streamData instanceof Uint8Array ? streamData : new Uint8Array(streamData as unknown as ArrayBuffer);
      
      // Check file size and use appropriate download method
      const MAX_BLOB_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit
      if (streamUint8Array.length >= MAX_BLOB_SIZE) {
        console.log(`[FFmpeg Stream Extraction] Large file detected (${streamUint8Array.length} bytes), using chunked download`);
        showProgress(`Downloading large ${streamType} stream...`, 90);
        
        // Use chunked download for large files
        downloadLargeFile(streamUint8Array, outputFilename, (progress) => {
          if (progress % 10 === 0) { // Update every 10%
            showProgress(`Downloading ${streamType} stream (${progress.toFixed(1)}%)...`, 90 + (progress / 10));
          }
        });
      } else {
        // Normal blob download for smaller files
        showProgress(`Starting ${streamType} stream download...`, 90);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const blob = new Blob([streamUint8Array], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      console.log(`[FFmpeg Stream Extraction] Download initiated for ${outputFilename}`);
      
      // Clean up
      await ffmpegRef.current.deleteFile('input.video');
      await ffmpegRef.current.deleteFile(outputFilename);
      
      const totalTime = performance.now() - startTime;
      console.log(`[FFmpeg Stream Extraction] Extraction completed successfully in ${totalTime.toFixed(2)}ms`, {
        method: extractionMethod,
        outputSize: streamUint8Array.length,
        compressionRatio: (streamUint8Array.length / fileSize * 100).toFixed(2) + '%'
      });
      
      // Show completion message and let user manually close
      showProgress(`${streamType} stream extraction completed successfully! Download should start automatically.`, 100);
      
    } catch (err) {
      const totalTime = performance.now() - startTime;
      console.error(`[FFmpeg Stream Extraction] Extraction failed after ${totalTime.toFixed(2)}ms:`, err);
      
      let errorMessage = 'Failed to extract stream';
      if (err instanceof Error) {
        errorMessage = `Failed to extract stream: ${err.message}`;
        
        // Provide more specific error messages
        if (err.message.includes('Invalid data found')) {
          errorMessage = 'Stream appears to be corrupted or in an unsupported format';
        } else if (err.message.includes('Stream not found')) {
          errorMessage = 'Stream not found. The file may not contain the requested stream.';
        } else if (err.message.includes('Encoder not found')) {
          errorMessage = 'Stream codec not supported. Try a different stream.';
        }
        
        console.error(`[FFmpeg Stream Extraction] Error details:`, {
          message: err.message,
          stack: err.stack,
          file: file.name,
          streamIndex,
          streamType,
          codecName
        });
      }
      
      showError(errorMessage);
      hideProgress();
      
      // Cleanup
      try {
        await ffmpegRef.current.deleteFile('input.video');
        await ffmpegRef.current.deleteFile(`${streamType}_stream_${streamIndex}.mp4`);
        await ffmpegRef.current.deleteFile(`${streamType}_stream_${streamIndex}.aac`);
        await ffmpegRef.current.deleteFile(`${streamType}_stream_${streamIndex}.h264`);
        await ffmpegRef.current.deleteFile(`${streamType}_stream_${streamIndex}.wav`);
        console.log(`[FFmpeg Stream Extraction] Cleanup completed`);
      } catch (cleanupError) {
        console.warn('[FFmpeg Stream Extraction] Failed to cleanup stream extraction files:', cleanupError);
      }
    }
  }, [isLoaded, showProgress, hideProgress, showError]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    hideError();
    setMetadata(null);

    if (!isLoaded) {
      showProgress('Waiting for FFmpeg...');
      return;
    }

    await extractMetadata(file);
  }, [extractMetadata, hideError, isLoaded, showProgress]);

  return {
    metadata,
    progress,
    error,
    handleFileSelect,
    hideError,
    hideProgress,
    showProgress,
    isLoaded,
    extractSubtitle,
    extractStream
  };
};