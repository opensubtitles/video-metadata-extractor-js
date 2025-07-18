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


  // Memory-efficient FFmpeg cleanup and reuse
  const cleanupFFmpegFiles = useCallback(async () => {
    if (!ffmpegRef.current) return;
    
    try {
      // Add delay before cleanup to ensure any pending operations complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clean up known temporary files with retry logic
      const tempFiles = ['input.video', 'output.video', 'subtitle.srt', 'subtitle.ass', 'subtitle.vtt'];
      for (const fileName of tempFiles) {
        let retries = 3;
        while (retries > 0) {
          try {
            await ffmpegRef.current.deleteFile(fileName);
            break;
          } catch (err) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
      }
      
      // Add delay before listing directory
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // List and clean up any remaining files
      try {
        const files = await ffmpegRef.current.listDir('/');
        const systemDirs = new Set(['.', '..', 'tmp', 'home', 'dev', 'proc', 'usr', 'bin', 'etc', 'var', 'lib']);
        
        for (const fileInfo of files) {
          const fileName = typeof fileInfo === 'string' ? fileInfo : fileInfo.name;
          const isDir = typeof fileInfo === 'object' && fileInfo.isDir;
          
          // Skip system directories
          if (!systemDirs.has(fileName) && !isDir) {
            let retries = 3;
            while (retries > 0) {
              try {
                await ffmpegRef.current.deleteFile(fileName);
                break;
              } catch (err) {
                retries--;
                if (retries > 0) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              }
            }
          }
        }
      } catch (listError) {
        // Continue on error
      }
      
      // Force garbage collection if available
      if (typeof window !== 'undefined' && (window as any).gc) {
        (window as any).gc();
      }
      
      // Final delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (cleanupError) {
      // Continue on error
    }
  }, []);

  const extractMetadata = useCallback(async (file: File) => {
    if (!isLoaded) return;

    try {
      console.log(`[FFMPEG DEBUG] extractMetadata called for: ${file.name}`);
      showProgress('Processing video...');
      
      // Clean up any existing files before starting
      console.log(`[FFMPEG DEBUG] Starting cleanup before processing`);
      await cleanupFFmpegFiles();
      console.log(`[FFMPEG DEBUG] Cleanup completed`);
      
      // Add additional delay after cleanup to ensure virtual filesystem is ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Validate file size (prevent extremely large files that could cause memory issues)
      const fileSize = file.size;
      
      if (fileSize === 0) {
        throw new Error(`File "${file.name}" appears to be empty`);
      }
      
      // Check for extremely large files and apply strict memory limits
      const maxFileSize = 1024 * 1024 * 1024; // 1GB limit for memory safety
      
      // Check available memory
      const availableMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Check if file has a valid extension based on FFmpeg demuxers
      const validExtensions = [
        // Common video formats
        'mp4', 'm4v', 'mov', '3gp', '3g2', 'mj2',  // QuickTime/MOV family
        'avi',                                      // AVI
        'mkv', 'webm',                             // Matroska/WebM
        'flv',                                     // Flash Video
        'asf', 'wmv',                              // Windows Media
        'mpg', 'mpeg', 'ts', 'm2ts',              // MPEG formats
        'ogv', 'ogg',                              // Ogg
        'gif',                                     // GIF
        'swf',                                     // SWF
        'rm', 'rmvb',                              // RealMedia
        'dv',                                      // DV
        'mxf',                                     // MXF
        'nut',                                     // NUT
        'nuv',                                     // NuppelVideo
        'roq',                                     // id RoQ
        'nsv',                                     // Nullsoft Streaming Video
        'wtv',                                     // Windows Television
        'ty',                                      // TiVo
        'pva',                                     // TechnoTrend PVA
        'ivf',                                     // On2 IVF
        'yuv',                                     // YUV4MPEG
        'r3d',                                     // REDCODE R3D
        
        // Audio formats that may contain video
        'aac', 'mp3', 'flac', 'wav', 'wv', 'ape', 'mpc', 'tta', 'tak',
        'au', 'caf', 'w64', 'voc', 'aiff', 'gsm', 'amr', 'ac3', 'eac3',
        'dts', 'dtshd', 'truehd', 'mlp', 'opus', 'vorbis', 'spx'
      ];
      
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !validExtensions.includes(extension)) {
        throw new Error(`Unsupported file format: ${extension || 'unknown'}. Supported formats include: mp4, avi, mov, mkv, webm, flv, 3gp, wmv, mpg, ogg, and many others.`);
      }
      
      // Memory-efficient chunking strategy
      let chunkSize = 16 * 1024 * 1024; // Start with 16MB for better memory management
      
      // Adjust chunk size based on available memory
      if (availableMemory > 0) {
        const memoryMB = availableMemory / 1024 / 1024;
        if (memoryMB > 800) {
          // High memory usage - use very small chunks
          chunkSize = 8 * 1024 * 1024; // 8MB
        } else if (memoryMB > 400) {
          // Medium memory usage - use small chunks
          chunkSize = 12 * 1024 * 1024; // 12MB
        }
      }
      
      // Further reduce chunk size for very large files
      if (fileSize > maxFileSize) {
        chunkSize = Math.min(chunkSize, 8 * 1024 * 1024); // 8MB max for large files
      }
      
      let fileData: Blob;
      
      if (extension === 'mp4' || extension === 'm4v') {
        // For MP4 files, use chunk-based approach for memory safety
        if (fileSize <= chunkSize) {
          fileData = file;
        } else {
          fileData = file.slice(0, chunkSize);
        }
        showProgress(`Processing ${extension.toUpperCase()} file (${Math.round(fileData.size / 1024 / 1024)}MB)...`);
      } else if (fileSize <= chunkSize) {
        // Small file - use entire file
        fileData = file;
      } else {
        // Large file - use beginning chunk only (metadata typically at start)
        fileData = file.slice(0, chunkSize);
      }
      
      // Write file to FFmpeg virtual filesystem
      showProgress('Loading file into FFmpeg...');
      
      // Retry file write operation with exponential backoff
      let writeAttempts = 0;
      const maxWriteAttempts = 3;
      let writeSuccess = false;
      
      while (writeAttempts < maxWriteAttempts && !writeSuccess) {
        try {
          writeAttempts++;
          
          // Ensure we have a clean state before writing
          try {
            await ffmpegRef.current.deleteFile('input.video');
          } catch (cleanupError) {
            // Continue
          }
          
          // Add delay between retry attempts
          if (writeAttempts > 1) {
            const delay = Math.pow(2, writeAttempts - 1) * 100; // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Prepare file data
          const fileBuffer = await fetchFile(fileData);
          
          // Add timeout to prevent hanging
          const writePromise = ffmpegRef.current.writeFile('input.video', fileBuffer);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('File write timeout')), 30000); // 30 second timeout
          });
          
          await Promise.race([writePromise, timeoutPromise]);
          
          // File write completed successfully
          writeSuccess = true;
          
        } catch (writeError) {
          // Clean up any partial state
          try {
            await ffmpegRef.current.deleteFile('input.video');
          } catch (cleanupError) {
            // Continue
          }
          
          // If this was the last attempt, throw the error
          if (writeAttempts >= maxWriteAttempts) {
            throw new Error(`Failed to load file into FFmpeg after ${maxWriteAttempts} attempts: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
          }
        }
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
        // Add timeout to prevent hanging
        const execPromise = ffmpegRef.current.exec(['-i', 'input.video']);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('FFmpeg execution timeout')), 60000); // 60 second timeout
        });
        
        await Promise.race([execPromise, timeoutPromise]);
      } catch (ffmpegError) {
        // Expected error for info extraction - FFmpeg always "fails" with -i command
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
        
        // Check if this is a virtual filesystem issue
        if (logOutput.includes('No such file or directory')) {
          throw new Error(`Failed to load file "${file.name}" into FFmpeg virtual filesystem. This may be due to memory constraints or file corruption.`);
        }
        
        throw new Error(`File "${file.name}" appears to be corrupted or not a valid media file`);
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
      
      console.log(`[FFMPEG DEBUG] Metadata extracted successfully for: ${file.name}`);
      setMetadata(extractedMetadata);
      
      // Clean up after successful processing
      console.log(`[FFMPEG DEBUG] Starting cleanup after successful processing`);
      await cleanupFFmpegFiles();
      console.log(`[FFMPEG DEBUG] Final cleanup completed for: ${file.name}`);
      
      hideProgress();
      
    } catch (err) {
      console.error(`[FFMPEG DEBUG] Processing error for ${file.name}:`, err);
      
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
      
      console.log(`[FFMPEG DEBUG] Showing error for ${file.name}: ${errorMessage}`);
      showError(errorMessage);
      hideProgress();
      
      // Clean up after error
      console.log(`[FFMPEG DEBUG] Starting cleanup after error for: ${file.name}`);
      await cleanupFFmpegFiles();
      console.log(`[FFMPEG DEBUG] Error cleanup completed for: ${file.name}`);
    }
  }, [isLoaded, showProgress, hideProgress, showError, processMP4File, cleanupFFmpegFiles]);

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
  }, [showError]);

  const extractSubtitle = useCallback(async (file: File, streamIndex: number, language?: string, codecName?: string, isForced?: boolean) => {
    if (!isLoaded) return;

    try {
      showProgress(`Preparing subtitle track ${streamIndex}...`, 10);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up before extraction
      await cleanupFFmpegFiles();
      
      // For larger files, use smaller chunks for memory safety
      const fileSize = file.size;
      const maxChunkSize = 50 * 1024 * 1024; // 50MB max for subtitle extraction (reduced for memory safety)
      const fileData = fileSize <= maxChunkSize ? file : file.slice(0, maxChunkSize);
      
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
        
      } catch (extractError) {
        // If native format fails, try converting to SRT
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
        
        // Clean up after extraction
        await cleanupFFmpegFiles();
        
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
      
      // Clean up after extraction
      await cleanupFFmpegFiles();
      
      // Show completion message and let user manually close
      showProgress(`Subtitle extraction completed successfully! Download should start automatically.`, 100);
      
    } catch (err) {
      
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
      }
      
      showError(errorMessage);
      hideProgress();
      
      // Clean up after error
      await cleanupFFmpegFiles();
    }
  }, [isLoaded, showProgress, hideProgress, showError, cleanupFFmpegFiles]);

  const extractStream = useCallback(async (file: File, streamIndex: number, streamType: string, codecName?: string) => {
    if (!isLoaded) return;

    try {
      showProgress(`Preparing ${streamType} stream ${streamIndex}...`, 10);
      
      // Add small delay to ensure progress bar is visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up before extraction
      await cleanupFFmpegFiles();
      
      // For stream extraction, use smaller chunks for memory safety
      const fileSize = file.size;
      const maxChunkSize = 100 * 1024 * 1024; // 100MB max for stream extraction (reduced for memory safety)
      const fileData = fileSize <= maxChunkSize ? file : file.slice(0, maxChunkSize);
      
      // Write file to FFmpeg virtual filesystem
      showProgress(`Loading ${streamType} stream into FFmpeg...`, 25);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await ffmpegRef.current.writeFile('input.video', await fetchFile(fileData));
      
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
      
      try {
        // Extract stream with FFmpeg
        showProgress(`Extracting ${streamType} stream (copy mode)...`, 50);
        await new Promise(resolve => setTimeout(resolve, 200));
        
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
        
      } catch (extractError) {
        // If copy fails, try with re-encoding
        showProgress(`Extracting ${streamType} stream (encoding mode)...`, 50);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (streamType === 'video') {
          await ffmpegRef.current.exec([
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            outputFilename
          ]);
        } else if (streamType === 'audio') {
          await ffmpegRef.current.exec([
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c:a', 'aac',
            '-b:a', '128k',
            outputFilename
          ]);
        }
        
      }
      
      // Read the extracted stream file
      showProgress(`Preparing ${streamType} stream download...`, 75);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const streamData = await ffmpegRef.current.readFile(outputFilename);
      
      // Convert to Uint8Array for consistent handling
      const streamUint8Array = streamData instanceof Uint8Array ? streamData : new Uint8Array(streamData as unknown as ArrayBuffer);
      
      // Check file size and use appropriate download method
      const MAX_BLOB_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit
      if (streamUint8Array.length >= MAX_BLOB_SIZE) {
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
      
      // Clean up after extraction
      await cleanupFFmpegFiles();
      
      // Show completion message and let user manually close
      showProgress(`${streamType} stream extraction completed successfully! Download should start automatically.`, 100);
      
    } catch (err) {
      
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
      }
      
      showError(errorMessage);
      hideProgress();
      
      // Clean up after error
      await cleanupFFmpegFiles();
    }
  }, [isLoaded, showProgress, hideProgress, showError, cleanupFFmpegFiles]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    console.log(`[FFMPEG DEBUG] Starting processing for file: ${file.name} (${file.size} bytes)`);
    
    hideError();
    setMetadata(null);

    if (!isLoaded) {
      console.log(`[FFMPEG DEBUG] FFmpeg not loaded yet, waiting...`);
      showProgress('Waiting for FFmpeg...');
      return;
    }

    console.log(`[FFMPEG DEBUG] FFmpeg loaded, calling extractMetadata`);
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