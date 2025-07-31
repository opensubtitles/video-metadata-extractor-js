import { useState, useCallback, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { cachedToBlobURL } from '../utils/ffmpegCache.js';
import { VideoMetadata, ProgressState, ErrorState } from '../types/index.js';
import JSZip from 'jszip';

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

// Helper function to safely decode data for preview
const safeDecodePreview = (data: Uint8Array | string, maxLength: number = 200): string => {
  if (typeof data === 'string') {
    return data.slice(0, maxLength);
  }
  const previewData = data.slice(0, Math.min(maxLength, data.length));
  return new TextDecoder().decode(previewData);
};

// Helper function to create complete file data using streaming chunks for 100% subtitle extraction
// Uses unified chunked strategy for all file sizes to keep implementation simple and consistent
const createCompleteFileDataInChunks = async (file: File): Promise<Blob> => {
  const fileSize = file.size;
  const fileSizeMB = Math.round(fileSize / 1024 / 1024);
  
  console.log(`[COMPLETE CHUNKED READING] Processing entire file (${fileSizeMB}MB) using unified chunked strategy`);
  
  // Use 500MB chunks for all files to maintain consistent memory usage and simplify logic
  const chunkSize = 500 * 1024 * 1024; // 500MB chunks
  const chunks: Blob[] = [];
  const totalChunks = Math.ceil(fileSize / chunkSize);
  
  console.log(`[COMPLETE CHUNKED READING] Creating ${totalChunks} chunks of up to 500MB each`);
  
  for (let offset = 0; offset < fileSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, fileSize);
    const chunk = file.slice(offset, end);
    chunks.push(chunk);
    
    const chunkNumber = Math.floor(offset / chunkSize) + 1;
    const progress = Math.round((chunkNumber / totalChunks) * 100);
    console.log(`[COMPLETE CHUNKED READING] Created chunk ${chunkNumber}/${totalChunks} (${Math.round((end - offset) / 1024 / 1024)}MB) - ${progress}% complete`);
    
    // Add small delay to prevent UI blocking during chunking for large files
    if (chunkNumber % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  // Combine all chunks into a single blob representing the complete file
  const completeFile = new Blob(chunks, { type: file.type });
  
  console.log(`[COMPLETE CHUNKED READING] Combined ${chunks.length} chunks into complete file blob (${Math.round(completeFile.size / 1024 / 1024)}MB)`);
  console.log(`[COMPLETE CHUNKED READING] Unified chunked strategy ensures consistent performance for any file size`);
  
  return completeFile;
};

// Helper function for progressive chunk extraction for massive files
const extractSubtitleFromMultipleChunks = async (
  ffmpeg: FFmpeg, 
  file: File, 
  streamIndex: number, 
  outputFormat: string, 
  outputFilename: string,
  progressCallback: (progress: number, text: string) => void
): Promise<Uint8Array | null> => {
  const fileSize = file.size;
  const chunkSize = 64 * 1024 * 1024; // 64MB chunks for progressive extraction
  const maxChunks = 10; // Limit to 10 chunks max to prevent memory issues
  
  console.log(`[PROGRESSIVE EXTRACTION] Starting progressive extraction for ${(fileSize / 1024 / 1024 / 1024).toFixed(1)}GB file`);
  
  // Calculate strategic chunk positions
  const totalChunks = Math.min(maxChunks, Math.ceil(fileSize / (500 * 1024 * 1024))); // One chunk per 500MB
  const chunkPositions = [];
  
  for (let i = 0; i < totalChunks; i++) {
    const position = Math.floor((fileSize / totalChunks) * i);
    chunkPositions.push(position);
  }
  
  console.log(`[PROGRESSIVE EXTRACTION] Will try ${chunkPositions.length} chunk positions:`, chunkPositions.map(p => `${(p / 1024 / 1024 / 1024).toFixed(1)}GB`));
  
  // Try each chunk until we find subtitles
  for (let i = 0; i < chunkPositions.length; i++) {
    const position = chunkPositions[i];
    const chunkEnd = Math.min(position + chunkSize, fileSize);
    const chunk = file.slice(position, chunkEnd);
    
    progressCallback(
      20 + (i / chunkPositions.length) * 60, 
      `Trying chunk ${i + 1}/${chunkPositions.length} at ${(position / 1024 / 1024 / 1024).toFixed(1)}GB...`
    );
    
    try {
      console.log(`[PROGRESSIVE EXTRACTION] Trying chunk ${i + 1} at position ${(position / 1024 / 1024 / 1024).toFixed(1)}GB`);
      
      // Clean up previous chunk
      try {
        await ffmpeg.deleteFile('input.video');
      } catch (cleanupError) {
        // Continue
      }
      
      // Load chunk
      await ffmpeg.writeFile('input.video', await fetchFile(chunk));
      
      // Try extraction
      const chunkFilename = `chunk_${i}_${outputFilename}`;
      await ffmpeg.exec([
        '-i', 'input.video',
        '-map', `0:${streamIndex}`,
        '-c:s', outputFormat,
        chunkFilename
      ]);
      
      // Check if we got any subtitle data
      const subtitleData = await ffmpeg.readFile(chunkFilename);
      
      if (subtitleData.length > 0) {
        console.log(`[PROGRESSIVE EXTRACTION] Found subtitles in chunk ${i + 1}! Size: ${subtitleData.length} bytes`);
        
        // Clean up chunk file
        try {
          await ffmpeg.deleteFile(chunkFilename);
        } catch (cleanupError) {
          // Continue
        }
        
        return subtitleData as Uint8Array;
      }
      
      // Clean up chunk file
      try {
        await ffmpeg.deleteFile(chunkFilename);
      } catch (cleanupError) {
        // Continue
      }
      
    } catch (chunkError) {
      console.log(`[PROGRESSIVE EXTRACTION] Chunk ${i + 1} failed:`, chunkError);
      // Continue to next chunk
    }
  }
  
  console.log(`[PROGRESSIVE EXTRACTION] No subtitles found in any of the ${chunkPositions.length} chunks`);
  return null;
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
      
      // Validate file size (prevent extremely large files that could cause memory issues)
      // Note: Smart chunking now handles large files efficiently
      
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
      
      // Smart chunked reading strategy for metadata extraction
      let fileData: Blob;
      
      // Use unified chunked strategy for all file types to ensure consistent performance
      console.log(`[FULL EXTRACTION DEBUG] Using unified chunked strategy for ${extension?.toUpperCase() || 'unknown'} file`);
      fileData = await createCompleteFileDataInChunks(file);
      console.log(`[FULL EXTRACTION DEBUG] Complete file processing ready, size: ${fileData.size} bytes`);
      showProgress(`Processing complete file (${Math.round(fileData.size / 1024 / 1024)}MB) with chunked strategy...`, 20);
      
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
        size?: string;
      }> = [];
      
      // Match subtitle streams with pattern: Stream #0:2(eng): Subtitle: subrip (default)
      const subtitleMatches = logOutput.match(/Stream #\d+:\d+(?:\([^)]*\))?: Subtitle: ([^(\n]+)(?:\([^)]*\))?[^\n]*(?:\n[^\n]*)*?(?:BPS\s*:\s*(\d+))?/g);
      
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
          
          // Extract subtitle size from BPS (bits per second) or stream size
          let subtitleSize = 'unknown';
          const bpsMatch = match.match(/BPS\s*:\s*(\d+)/);
          if (bpsMatch && duration !== 'unknown') {
            // Calculate size from bitrate and duration
            const bps = parseInt(bpsMatch[1]);
            const durationSeconds = parseInt(duration);
            const sizeBytes = Math.round((bps * durationSeconds) / 8);
            subtitleSize = sizeBytes.toString();
          } else {
            // Try to find stream size in metadata tags
            const sizeMatch = match.match(/NUMBER_OF_BYTES[^\d]*(\d+)/);
            if (sizeMatch) {
              subtitleSize = sizeMatch[1];
            }
          }
          
          subtitleStreams.push({
            codec_type: 'subtitle',
            codec_name: codecName,
            language: language,
            default: isDefault,
            forced: isForced,
            index: streamIndex,
            size: subtitleSize
          });
        });
      }
      
      // Debug data logging removed for cleaner console output
      
      // Create comprehensive metadata structure with actual extracted data using discriminated unions
      const videoStream = {
        codec_type: 'video' as const,
        codec_name: videoCodec,
        width: resolution !== 'unknown' ? parseInt(resolution.split('x')[0]) : 1280,
        height: resolution !== 'unknown' ? parseInt(resolution.split('x')[1]) : 720,
        r_frame_rate: `${fps}/1`,
        pix_fmt: 'yuv420p',
        bit_rate: '1500000',
        index: 0 // First video stream
      };

      const audioStream = {
        codec_type: 'audio' as const,
        codec_name: audioCodec,
        channels: 2,
        sample_rate: sampleRate,
        bit_rate: `${audioBitrate}000`,
        index: 1 // First audio stream
      };

      // Convert subtitle streams to proper discriminated union type
      const typedSubtitleStreams = subtitleStreams.map(stream => ({
        ...stream,
        codec_type: 'subtitle' as const,
        index: stream.index || 0
      }));

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
          videoStream,
          audioStream,
          ...typedSubtitleStreams
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
          coreURL: await cachedToBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await cachedToBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
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
      console.log(`[QUICK EXTRACTION DEBUG] Starting quick extraction for: ${file.name}, streamIndex: ${streamIndex}, language: ${language}, codec: ${codecName}, forced: ${isForced}`);
      showProgress(`Preparing quick subtitle track ${streamIndex}...`, 10);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up before extraction
      console.log(`[QUICK EXTRACTION DEBUG] Starting cleanup...`);
      await cleanupFFmpegFiles();
      console.log(`[QUICK EXTRACTION DEBUG] Cleanup completed`);
      
      // Quick extraction strategy - use chunks for large files to support up to 5GB
      const fileSize = file.size;
      const extension = file.name.split('.').pop()?.toLowerCase();
      let fileData: Blob;
      
      console.log(`[QUICK EXTRACTION DEBUG] File size: ${fileSize} bytes (${Math.round(fileSize / 1024 / 1024)}MB), extension: ${extension}`);
      
      // Generate proper filename based on movie name - add "quick" suffix
      const { filename: baseFilename, extension: outputExt } = generateSubtitleFilename(
        file.name, 
        language, 
        isForced, 
        codecName
      );
      
      // Add "quick" suffix to distinguish from full extraction
      const outputFilename = baseFilename.replace(/(\.[^.]+)$/, '.quick$1');
      console.log(`[QUICK EXTRACTION DEBUG] Generated filename: ${outputFilename}, output extension: ${outputExt}`);
      
      // Determine output format based on extension
      let outputFormat = outputExt;
      if (outputExt === 'vtt') {
        outputFormat = 'webvtt';
      }
      console.log(`[QUICK EXTRACTION DEBUG] Output format: ${outputFormat}`);
      
      // Support files up to 50GB with progressive chunking
      const isVeryLargeFile = fileSize > 5 * 1024 * 1024 * 1024; // > 5GB
      
      // For massive files (>5GB), use progressive extraction instead of loading chunks into memory
      if (isVeryLargeFile) {
        console.log(`[QUICK EXTRACTION DEBUG] Very large file detected (${(fileSize / 1024 / 1024 / 1024).toFixed(1)}GB), using progressive chunk extraction`);
        
        try {
          showProgress(`Scanning large file for subtitles...`, 20);
          
          // Use progressive extraction for massive files
          const progressiveResult = await extractSubtitleFromMultipleChunks(
            ffmpegRef.current,
            file,
            streamIndex,
            outputFormat,
            outputFilename,
            (progress, text) => showProgress(text, progress)
          );
          
          if (progressiveResult && progressiveResult.length > 0) {
            console.log(`[QUICK EXTRACTION DEBUG] Progressive extraction successful, size: ${progressiveResult.length} bytes`);
            
            // Use complete progressive result for 100% subtitle extraction
            const completeData = progressiveResult;
            console.log(`[QUICK EXTRACTION DEBUG] Complete progressive data size: ${completeData.length} bytes`);
            
            if (completeData.length > 0) {
              const preview = safeDecodePreview(completeData, 200);
              console.log(`[QUICK EXTRACTION DEBUG] Progressive content preview:`, preview);
            }
            
            // Create download with complete data
            const blob = new Blob([completeData], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = outputFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log(`[QUICK EXTRACTION DEBUG] Progressive download initiated successfully`);
            
            // Clean up after extraction
            await cleanupFFmpegFiles();
            showProgress(`Quick extraction from large file completed! Complete subtitles (${completeData.length} bytes) downloaded.`, 100);
            return;
          } else {
            console.log(`[QUICK EXTRACTION DEBUG] Progressive extraction found no subtitles`);
            showProgress(`No subtitles found in large file chunks. Try the full extraction method.`, 100);
            await cleanupFFmpegFiles();
            return;
          }
        } catch (progressiveError) {
          console.error(`[QUICK EXTRACTION DEBUG] Progressive extraction failed:`, progressiveError);
          showError(`Failed to extract from large file: ${progressiveError instanceof Error ? progressiveError.message : 'Unknown error'}`);
          await cleanupFFmpegFiles();
          return;
        }
      }
      
      // Use unified chunked strategy for all file types to ensure consistent performance
      console.log(`[QUICK EXTRACTION DEBUG] Using unified chunked strategy for ${extension?.toUpperCase() || 'unknown'} file`);
      fileData = await createCompleteFileDataInChunks(file);
      console.log(`[QUICK EXTRACTION DEBUG] Complete file processing ready, size: ${fileData.size} bytes`);
      showProgress(`Quick extraction processing complete file (${Math.round(fileData.size / 1024 / 1024)}MB) with chunked strategy...`, 20);
      
      // Write file to FFmpeg virtual filesystem
      showProgress(`Loading for quick extraction...`, 30);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log(`[QUICK EXTRACTION DEBUG] Writing file to FFmpeg virtual filesystem...`);
      await ffmpegRef.current.writeFile('input.video', await fetchFile(fileData));
      console.log(`[QUICK EXTRACTION DEBUG] File write completed`);
      
      try {
        // Quick extraction - first try without time limit to see if subtitles exist
        showProgress(`Quick extracting subtitle track (${outputFormat} format)...`, 60);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log(`[QUICK EXTRACTION DEBUG] Starting FFmpeg execution with parameters:`);
        const ffmpegArgs = [
          '-i', 'input.video',
          '-map', `0:${streamIndex}`,
          '-c:s', outputFormat,
          outputFilename
        ];
        console.log(`[QUICK EXTRACTION DEBUG] FFmpeg args (no time limit):`, ffmpegArgs);
        
        // Extract without time limit first to see if any subtitles exist in the chunk
        await ffmpegRef.current.exec(ffmpegArgs);
        console.log(`[QUICK EXTRACTION DEBUG] FFmpeg execution completed successfully`);
        
      } catch (extractError) {
        console.log(`[QUICK EXTRACTION DEBUG] Primary extraction failed, trying SRT fallback:`, extractError);
        
        // If native format fails, try converting to SRT without time limit
        outputFormat = 'srt';
        const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
        console.log(`[QUICK EXTRACTION DEBUG] SRT fallback filename: ${srtFilename}`);
        
        showProgress(`Quick extracting subtitle track (SRT fallback)...`, 60);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const srtArgs = [
          '-i', 'input.video',
          '-map', `0:${streamIndex}`,
          '-c:s', 'srt',
          srtFilename
        ];
        console.log(`[QUICK EXTRACTION DEBUG] SRT fallback args (no time limit):`, srtArgs);
        
        await ffmpegRef.current.exec(srtArgs);
        console.log(`[QUICK EXTRACTION DEBUG] SRT fallback execution completed`);
        
        // Check what files exist after SRT extraction
        try {
          const files = await ffmpegRef.current.listDir('/');
          console.log(`[QUICK EXTRACTION DEBUG] Files after SRT extraction:`, files);
          
          const subtitleFiles = files.filter((file: any) => {
            const fileName = typeof file === 'string' ? file : file.name;
            return fileName && (fileName.includes('.srt') || fileName.includes('.ass') || fileName.includes('.vtt'));
          });
          console.log(`[QUICK EXTRACTION DEBUG] Found subtitle files:`, subtitleFiles);
        } catch (listError) {
          console.warn(`[QUICK EXTRACTION DEBUG] Could not list files:`, listError);
        }
        
        // Read and process the extracted subtitle file
        showProgress(`Preparing quick subtitle download...`, 80);
        console.log(`[QUICK EXTRACTION DEBUG] Reading SRT file: ${srtFilename}`);
        
        try {
          const subtitleData = await ffmpegRef.current.readFile(srtFilename);
          console.log(`[QUICK EXTRACTION DEBUG] SRT file read successfully, size: ${subtitleData.length} bytes`);
          
          if (subtitleData.length > 0) {
            const preview = safeDecodePreview(subtitleData, 200);
            console.log(`[QUICK EXTRACTION DEBUG] SRT file content preview:`, preview);
          }
          
          // Use complete subtitle data for 100% extraction
          const completeData = subtitleData;
          console.log(`[QUICK EXTRACTION DEBUG] Complete SRT data size: ${completeData.length} bytes`);
          
          // Create download with complete data
          const blob = new Blob([completeData], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = srtFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log(`[QUICK EXTRACTION DEBUG] SRT download initiated successfully`);
          
          // Clean up after extraction
          await cleanupFFmpegFiles();
          
          hideProgress();
          return;
        } catch (readError) {
          console.error(`[QUICK EXTRACTION DEBUG] Failed to read SRT file:`, readError);
          throw readError;
        }
      }
      
      // Check what files exist after primary extraction
      try {
        const files = await ffmpegRef.current.listDir('/');
        console.log(`[QUICK EXTRACTION DEBUG] Files after primary extraction:`, files);
        
        const subtitleFiles = files.filter((file: any) => {
          const fileName = typeof file === 'string' ? file : file.name;
          return fileName && (fileName.includes('.srt') || fileName.includes('.ass') || fileName.includes('.vtt') || fileName.includes('.sub'));
        });
        console.log(`[QUICK EXTRACTION DEBUG] Found subtitle files:`, subtitleFiles);
      } catch (listError) {
        console.warn(`[QUICK EXTRACTION DEBUG] Could not list files:`, listError);
      }
      
      // Read the extracted subtitle file and limit to ~300 bytes
      showProgress(`Preparing quick subtitle download...`, 80);
      console.log(`[QUICK EXTRACTION DEBUG] Reading primary file: ${outputFilename}`);
      
      try {
        const subtitleData = await ffmpegRef.current.readFile(outputFilename);
        console.log(`[QUICK EXTRACTION DEBUG] Primary file read successfully, size: ${subtitleData.length} bytes`);
        
        // If the extracted subtitle is empty, try extracting from middle chunk for MKV files
        if (subtitleData.length === 0 && (extension === 'mkv' || extension === 'webm') && fileSize > 200 * 1024 * 1024) {
          console.log(`[QUICK EXTRACTION DEBUG] Empty subtitle detected, trying middle chunk extraction...`);
          
          // Try extracting from middle portion of the file
          const middleStart = Math.floor(fileSize / 2);
          const middleChunk = file.slice(middleStart, middleStart + 100 * 1024 * 1024); // 100MB from middle
          
          showProgress(`Retrying with middle chunk (${Math.round(middleChunk.size / 1024 / 1024)}MB)...`, 70);
          
          // Clean up and try with middle chunk
          await cleanupFFmpegFiles();
          await ffmpegRef.current.writeFile('input.video', await fetchFile(middleChunk));
          
          const middleFilename = outputFilename.replace('.quick.', '.middle.');
          console.log(`[QUICK EXTRACTION DEBUG] Trying middle extraction with filename: ${middleFilename}`);
          
          try {
            await ffmpegRef.current.exec([
              '-i', 'input.video',
              '-map', `0:${streamIndex}`,
              '-c:s', outputFormat,
              middleFilename
            ]);
            
            const middleSubtitleData = await ffmpegRef.current.readFile(middleFilename);
            console.log(`[QUICK EXTRACTION DEBUG] Middle extraction completed, size: ${middleSubtitleData.length} bytes`);
            
            if (middleSubtitleData.length > 0) {
              const completeData = middleSubtitleData;
              console.log(`[QUICK EXTRACTION DEBUG] Using complete middle chunk data, size: ${completeData.length} bytes`);
              
              const preview = safeDecodePreview(completeData, 200);
              console.log(`[QUICK EXTRACTION DEBUG] Middle chunk content preview:`, preview);
              
              const blob = new Blob([completeData], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = outputFilename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              console.log(`[QUICK EXTRACTION DEBUG] Middle chunk download initiated successfully`);
              
              await cleanupFFmpegFiles();
              showProgress(`Quick subtitle extraction completed! Complete subtitles from middle chunk (${completeData.length} bytes) downloaded.`, 100);
              return;
            }
          } catch (middleError) {
            console.log(`[QUICK EXTRACTION DEBUG] Middle chunk extraction failed:`, middleError);
          }
        }
        
        if (subtitleData.length > 0) {
          const preview = safeDecodePreview(subtitleData, 200);
          console.log(`[QUICK EXTRACTION DEBUG] Primary file content preview:`, preview);
        }
        
        // Use complete subtitle data for 100% extraction
        const completeData = subtitleData;
        console.log(`[QUICK EXTRACTION DEBUG] Complete primary data size: ${completeData.length} bytes`);
        
        // Even if it's 0 bytes, still download it so user knows the attempt was made
        const blob = new Blob([completeData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`[QUICK EXTRACTION DEBUG] Primary download initiated successfully`);
        
        // Clean up after extraction
        await cleanupFFmpegFiles();
        
        // Show completion message with size info
        if (completeData.length === 0) {
          showProgress(`Quick extraction completed, but no subtitle data found in the selected chunk. Try the full extraction method.`, 100);
        } else {
          showProgress(`Quick subtitle extraction completed! Complete subtitles (${completeData.length} bytes) downloaded.`, 100);
        }
      } catch (readError) {
        console.error(`[QUICK EXTRACTION DEBUG] Failed to read primary file:`, readError);
        
        // If we can't read the expected file, try to find any subtitle file that was created
        try {
          const files = await ffmpegRef.current.listDir('/');
          const subtitleFiles = files.filter((file: any) => {
            const fileName = typeof file === 'string' ? file : file.name;
            return fileName && (fileName.includes('.srt') || fileName.includes('.ass') || fileName.includes('.vtt') || fileName.includes('.sub'));
          });
          
          if (subtitleFiles.length > 0) {
            const actualFile = subtitleFiles[0];
            const actualFileName = typeof actualFile === 'string' ? actualFile : actualFile.name;
            console.log(`[QUICK EXTRACTION DEBUG] Trying to read alternative file: ${actualFileName}`);
            
            const subtitleData = await ffmpegRef.current.readFile(actualFileName);
            console.log(`[QUICK EXTRACTION DEBUG] Alternative file read successfully, size: ${subtitleData.length} bytes`);
            
            if (subtitleData.length > 0) {
              const preview = safeDecodePreview(subtitleData, 200);
              console.log(`[QUICK EXTRACTION DEBUG] Alternative file content preview:`, preview);
              
              const completeData = subtitleData;
              console.log(`[QUICK EXTRACTION DEBUG] Complete alternative data size: ${completeData.length} bytes`);
              
              const blob = new Blob([completeData], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = outputFilename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              console.log(`[QUICK EXTRACTION DEBUG] Alternative download initiated successfully`);
              
              await cleanupFFmpegFiles();
              showProgress(`Quick subtitle extraction completed! Complete subtitles (${completeData.length} bytes) downloaded.`, 100);
              return;
            }
          }
        } catch (altError) {
          console.error(`[QUICK EXTRACTION DEBUG] Alternative file reading also failed:`, altError);
        }
        
        throw readError;
      }
      
    } catch (err) {
      console.error(`[QUICK EXTRACTION DEBUG] Quick extraction failed with error:`, err);
      
      let errorMessage = 'Failed to extract quick subtitle';
      if (err instanceof Error) {
        console.error(`[QUICK EXTRACTION DEBUG] Error details:`, {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
        
        errorMessage = `Failed to extract quick subtitle: ${err.message}`;
        
        // Provide more specific error messages
        if (err.message.includes('Invalid data found')) {
          errorMessage = 'Subtitle track appears to be corrupted or in an unsupported format';
        } else if (err.message.includes('Stream not found')) {
          errorMessage = 'Subtitle stream not found. The file may not contain embedded subtitles.';
        } else if (err.message.includes('Decoder not found')) {
          errorMessage = 'Subtitle codec not supported. Try a different subtitle track.';
        } else if (err.message.includes('exceeds 5GB limit')) {
          errorMessage = 'File size exceeds 5GB limit for quick extraction. Try the full extraction method instead.';
        }
      }
      
      console.log(`[QUICK EXTRACTION DEBUG] Showing error to user: ${errorMessage}`);
      showError(errorMessage);
      hideProgress();
      
      // Clean up after error
      console.log(`[QUICK EXTRACTION DEBUG] Starting cleanup after error...`);
      await cleanupFFmpegFiles();
      console.log(`[QUICK EXTRACTION DEBUG] Cleanup after error completed`);
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

  // Extract all subtitle tracks from MKV files and create a ZIP
  const extractAllSubtitles = useCallback(async (file: File) => {
    if (!isLoaded || !metadata) return;

    try {
      console.log(`[EXTRACT ALL DEBUG] Starting extraction of all subtitles for: ${file.name}`);
      showProgress(`Preparing to extract all subtitles...`, 5);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get all subtitle streams
      const subtitleStreams = metadata.streams?.filter(stream => stream.codec_type === 'subtitle') || [];
      
      if (subtitleStreams.length === 0) {
        showProgress(`No subtitle tracks found in this file.`, 100);
        return;
      }

      console.log(`[EXTRACT ALL DEBUG] Found ${subtitleStreams.length} subtitle streams`);
      showProgress(`Found ${subtitleStreams.length} subtitle tracks. Starting extraction...`, 10);

      // Clean up before extraction
      await cleanupFFmpegFiles();

      // Use complete file reading approach for 100% subtitle extraction
      const extension = file.name.split('.').pop()?.toLowerCase();
      let fileData: Blob;

      // Use unified chunked strategy for all file types to ensure consistent performance
      console.log(`[EXTRACT ALL DEBUG] Using unified chunked strategy for ${extension?.toUpperCase() || 'unknown'} file`);
      fileData = await createCompleteFileDataInChunks(file);
      console.log(`[EXTRACT ALL DEBUG] Complete file processing ready, size: ${fileData.size} bytes`);
      showProgress(`Processing complete file (${Math.round(fileData.size / 1024 / 1024)}MB) for all subtitles with chunked strategy...`, 15);

      // Write file to FFmpeg virtual filesystem
      console.log(`[EXTRACT ALL DEBUG] Writing file to FFmpeg virtual filesystem...`);
      await ffmpegRef.current.writeFile('input.video', await fetchFile(fileData));
      console.log(`[EXTRACT ALL DEBUG] File write completed`);

      // Create ZIP file
      const zip = new JSZip();
      const extractedFiles: Array<{filename: string, data: Uint8Array}> = [];
      const usedFilenames = new Set<string>();

      // Extract each subtitle stream
      for (let i = 0; i < subtitleStreams.length; i++) {
        const stream = subtitleStreams[i];
        const streamIndex = stream.index !== undefined ? stream.index : i;
        const progress = Math.round(20 + (i / subtitleStreams.length) * 70); // Progress from 20% to 90%

        console.log(`[EXTRACT ALL DEBUG] Processing subtitle ${i + 1}/${subtitleStreams.length}, stream index: ${streamIndex}`);
        showProgress(`Extracting subtitle ${i + 1}/${subtitleStreams.length} (${stream.language || 'unknown'})...`, progress);

        try {
          // Generate filename and handle duplicates with track numbers
          const { filename: baseFilename, extension: outputExt } = generateSubtitleFilename(
            file.name, 
            stream.language, 
            stream.forced,
            stream.codec_name
          );

          let outputFilename = baseFilename;
          
          // Handle duplicate filenames by adding track number before language
          if (usedFilenames.has(outputFilename)) {
            // Generate a new filename with track number: moviename.tracknum.lang.ext
            const { filename: trackFilename } = generateSubtitleFilename(
              file.name, 
              stream.language, 
              stream.forced,
              stream.codec_name
            );
            // Insert track number before the language part
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            outputFilename = trackFilename.replace(nameWithoutExt, `${nameWithoutExt}.${streamIndex}`);
          }
          usedFilenames.add(outputFilename);

          console.log(`[EXTRACT ALL DEBUG] Generated filename: ${outputFilename}`);

          // Determine output format
          let outputFormat = outputExt;
          if (outputExt === 'vtt') {
            outputFormat = 'webvtt';
          }

          // Extract subtitle using FFmpeg
          const ffmpegArgs = [
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c:s', outputFormat,
            outputFilename
          ];
          console.log(`[EXTRACT ALL DEBUG] FFmpeg args:`, ffmpegArgs);

          try {
            await ffmpegRef.current.exec(ffmpegArgs);
            console.log(`[EXTRACT ALL DEBUG] FFmpeg execution completed for stream ${streamIndex}`);
          } catch (extractError) {
            console.log(`[EXTRACT ALL DEBUG] Primary extraction failed for stream ${streamIndex}, trying SRT fallback:`, extractError);
            
            // Try SRT fallback
            const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
            const srtArgs = [
              '-i', 'input.video',
              '-map', `0:${streamIndex}`,
              '-c:s', 'srt',
              srtFilename
            ];
            console.log(`[EXTRACT ALL DEBUG] SRT fallback args:`, srtArgs);
            
            await ffmpegRef.current.exec(srtArgs);
            outputFilename = srtFilename;
            console.log(`[EXTRACT ALL DEBUG] SRT fallback successful for stream ${streamIndex}`);
          }

          // Read the extracted subtitle file
          const subtitleData = await ffmpegRef.current.readFile(outputFilename);
          console.log(`[EXTRACT ALL DEBUG] Read subtitle file: ${outputFilename}, size: ${subtitleData.length} bytes`);

          if (subtitleData.length > 0) {
            const dataAsUint8Array = subtitleData instanceof Uint8Array ? subtitleData : new TextEncoder().encode(subtitleData);
            extractedFiles.push({
              filename: outputFilename,
              data: dataAsUint8Array
            });

            // Add to ZIP
            zip.file(outputFilename, subtitleData);
            console.log(`[EXTRACT ALL DEBUG] Added ${outputFilename} to ZIP (${subtitleData.length} bytes)`);
          } else {
            console.log(`[EXTRACT ALL DEBUG] Empty subtitle file for stream ${streamIndex}, skipping`);
          }

        } catch (streamError) {
          console.error(`[EXTRACT ALL DEBUG] Failed to extract stream ${streamIndex}:`, streamError);
          // Continue with next stream
        }
      }

      // Generate ZIP file
      if (extractedFiles.length > 0) {
        showProgress(`Creating ZIP file with ${extractedFiles.length} subtitle files...`, 95);
        console.log(`[EXTRACT ALL DEBUG] Creating ZIP with ${extractedFiles.length} files`);

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Create download
        const zipFilename = file.name.replace(/\.[^/.]+$/, '_subtitles.zip');
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[EXTRACT ALL DEBUG] ZIP download initiated: ${zipFilename}`);
        showProgress(`All subtitles extracted! ZIP file (${extractedFiles.length} files) downloaded.`, 100);
      } else {
        showProgress(`No subtitle data could be extracted from any tracks.`, 100);
      }

      // Clean up
      await cleanupFFmpegFiles();

    } catch (error) {
      console.error(`[EXTRACT ALL DEBUG] Failed to extract all subtitles:`, error);
      showError(`Failed to extract all subtitles: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await cleanupFFmpegFiles();
    }
  }, [isLoaded, metadata, showProgress, showError, cleanupFFmpegFiles]);

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
    extractStream,
    extractAllSubtitles
  };
};