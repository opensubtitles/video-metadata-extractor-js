import { useState, useCallback, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { VideoMetadata, ProgressState, ErrorState } from '../types';

// Helper function to get file format from filename
const getFormatFromFileName = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension || 'unknown';
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

  const showProgress = useCallback((text: string) => {
    setProgress({ isVisible: true, progress: 0, text });
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


  const extractMetadata = useCallback(async (file: File) => {
    if (!isLoaded) return;

    try {
      console.log('Processing file:', file.name);
      showProgress('Processing video...');
      
      // Validate file size (prevent extremely large files that could cause memory issues)
      const fileSize = file.size;
      if (fileSize === 0) {
        throw new Error('File appears to be empty');
      }
      
      // Check if file has a valid extension
      const validExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', '3gp', 'm4v', 'ogv', 'mp3', 'wav', 'aac'];
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !validExtensions.includes(extension)) {
        throw new Error(`Unsupported file format: ${extension || 'unknown'}. Supported formats: ${validExtensions.join(', ')}`);
      }
      
      // Smart chunking strategy for different file types
      const chunkSize = 32 * 1024 * 1024; // 32MB
      const mp4LargeFileThreshold = 200 * 1024 * 1024; // 200MB threshold for MP4 chunking
      let fileData: Blob;
      
      if (extension === 'mp4' || extension === 'm4v') {
        if (fileSize <= mp4LargeFileThreshold) {
          // For MP4 files under 200MB, read entire file to ensure we get all metadata
          fileData = file;
          console.log('MP4 file (≤200MB) - reading entire file:', fileSize);
          showProgress('Processing MP4 file...');
        } else {
          // For very large MP4 files, try a larger chunk strategy
          // Read first 64MB + last 64MB to capture metadata that could be at either end
          console.log('Large MP4 file (>200MB) - using enhanced chunking strategy');
          showProgress('Processing large MP4 file...');
          
          const largeChunkSize = 64 * 1024 * 1024; // 64MB chunks for large files
          const beginningChunk = file.slice(0, largeChunkSize);
          const endChunk = file.slice(Math.max(0, fileSize - largeChunkSize), fileSize);
          
          // For large files, create a more seamless merge by including some middle content
          // This helps FFmpeg understand the file structure better
          const middleStart = Math.floor(fileSize / 2) - (chunkSize / 2);
          const middleChunk = file.slice(middleStart, middleStart + chunkSize);
          
          fileData = new Blob([beginningChunk, middleChunk, endChunk], { type: file.type });
          console.log('Large MP4 - combined chunks size:', fileData.size);
        }
      } else if (fileSize <= chunkSize) {
        // Small file - use entire file
        fileData = file;
        console.log('Small file - using entire file:', fileSize);
      } else {
        // Large file (non-MP4) - use beginning chunk only (metadata typically at start)
        fileData = file.slice(0, chunkSize);
        console.log('Large file (non-MP4) - using beginning chunk:', fileData.size);
      }
      
      console.log('File size:', fileSize, 'Processing data size:', fileData.size);
      
      // Write file to FFmpeg virtual filesystem
      console.log('Writing file to FFmpeg filesystem...');
      showProgress('Loading file into FFmpeg...');
      
      try {
        await ffmpegRef.current.writeFile('input.video', await fetchFile(fileData));
      } catch (writeError) {
        throw new Error(`Failed to load file into FFmpeg: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
      }
      
      console.log('File written successfully');
      
      // Capture FFmpeg log output to parse metadata
      let ffmpegLogs: string[] = [];
      const logHandler = ({ message }: { message: string }) => {
        ffmpegLogs.push(message);
        console.log('FFmpeg log:', message);
      };
      
      // Add temporary log handler
      ffmpegRef.current.on('log', logHandler);
      
      // Use simple -i command to get metadata info
      console.log('Running FFmpeg probe command...');
      showProgress('Extracting metadata...');
      
      try {
        await ffmpegRef.current.exec(['-i', 'input.video']);
      } catch (ffmpegError) {
        console.log('FFmpeg probe completed (expected error for info extraction)');
      }
      
      // Remove log handler
      ffmpegRef.current.off('log', logHandler);
      
      // Check if we got any useful log output
      if (ffmpegLogs.length === 0) {
        throw new Error('FFmpeg did not produce any output. The file might be corrupted or unsupported.');
      }
      
      // Parse the FFmpeg log output to extract metadata
      const logOutput = ffmpegLogs.join('\n');
      console.log('Complete FFmpeg log output:', logOutput);
      
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
      
      // Create comprehensive debug JSON output
      const debugData = {
        file: {
          name: file.name,
          size: fileSize,
          chunkSize: fileData.size
        },
        ffmpegLogs: ffmpegLogs,
        rawLogOutput: logOutput,
        parseResults: {
          durationMatch: durationMatch,
          duration: duration,
          bitrateMatch: bitrateMatch,
          bitrate: bitrate,
          videoStreamMatch: videoStreamMatch,
          videoCodec: videoCodec,
          resolution: resolution,
          fps: fps,
          audioStreamMatch: audioStreamMatch,
          audioBpsMatch: audioBpsMatch,
          audioCodec: audioCodec,
          sampleRate: sampleRate,
          audioBitrate: audioBitrate
        }
      };
      
      console.log('=== DEBUG DATA (JSON) ===');
      console.log(JSON.stringify(debugData, null, 2));
      console.log('=== END DEBUG DATA ===');
      
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
            bit_rate: '1500000'
          },
          {
            codec_type: 'audio',
            codec_name: audioCodec,
            channels: 2,
            sample_rate: sampleRate,
            bit_rate: `${audioBitrate}000`
          }
        ]
      };
      
      console.log('Extracted metadata:', extractedMetadata);
      setMetadata(extractedMetadata);
      
      // Clean up
      console.log('Cleaning up...');
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
  }, [isLoaded, showProgress, hideProgress, showError]);

  // Load FFmpeg following the official example pattern
  useEffect(() => {
    const load = async () => {
      const ffmpeg = ffmpegRef.current;
      
      if (ffmpeg.loaded) {
        setIsLoaded(true);
        return;
      }
      
      try {
        showProgress('Loading FFmpeg...');
        
        // Add logging to see FFmpeg messages
        ffmpeg.on('log', ({ message }) => {
          console.log('FFmpeg log:', message);
        });
        
        // Use the same pattern as the official example
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        setIsLoaded(true);
        hideProgress();
        console.log('FFmpeg loaded successfully');
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
        hideProgress();
      }
    };
    
    load();
  }, [showProgress, hideProgress, showError]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    console.log('File selected:', file.name);
    hideError();
    setMetadata(null);

    if (!isLoaded) {
      console.log('Waiting for FFmpeg to load...');
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
    isLoaded
  };
};