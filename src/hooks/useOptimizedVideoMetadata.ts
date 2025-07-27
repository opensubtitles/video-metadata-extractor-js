/**
 * Optimized and simplified video metadata hook
 * Reduces code duplication and improves maintainability
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import JSZip from 'jszip';

import { 
  VideoMetadata, 
  ProgressState, 
  ErrorState, 
  SubtitleStream, 
  VideoStream, 
  AudioStream 
} from '../types';
import { 
  PROCESSING_CONSTANTS, 
  FFMPEG_CONSTANTS, 
  ERROR_MESSAGES
} from '../constants';
import { 
  withRetry,
  validateFile,
  sleep,
  formatFileSize,
  generateSubtitleFilename,
  getFormatFromFileName
} from '../utils/common';
import { createFileProcessor } from '../utils/fileProcessor';

interface UseOptimizedVideoMetadataResult {
  metadata: VideoMetadata | null;
  progress: ProgressState;
  error: ErrorState;
  handleFileSelect: (file: File) => Promise<void>;
  extractSubtitle: (file: File, streamIndex: number, language?: string, codecName?: string, isForced?: boolean) => Promise<void>;
  extractStream: (file: File, streamIndex: number, streamType: string) => Promise<void>;
  extractAllSubtitles: (file: File) => Promise<void>;
  hideError: () => void;
  hideProgress: () => void;
  isLoaded: boolean;
  selectedFile: File | null;
  currentMethod: string;
}

export const useOptimizedVideoMetadata = (): UseOptimizedVideoMetadataResult => {
  // State management
  const ffmpegRef = useRef(new FFmpeg());
  const initializingRef = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentMethod, setCurrentMethod] = useState('Unknown');
  
  const [progress, setProgress] = useState<ProgressState>({
    isVisible: false,
    progress: 0,
    text: ''
  });
  
  const [error, setError] = useState<ErrorState>({
    isVisible: false,
    message: ''
  });


  // Progress management
  const showProgress = useCallback((text: string, progressPercent: number = 0) => {
    setProgress({ isVisible: true, progress: progressPercent, text });
  }, []);

  const hideProgress = useCallback(() => {
    setProgress({ isVisible: false, progress: 0, text: '' });
  }, []);

  // Error management
  const showError = useCallback((message: string) => {
    setError({ isVisible: true, message });
  }, []);

  const hideError = useCallback(() => {
    setError({ isVisible: false, message: '' });
  }, []);

  // FFmpeg cleanup utility
  const cleanupFFmpegFiles = useCallback(async () => {
    if (!ffmpegRef.current) return;
    
    try {
      await sleep(PROCESSING_CONSTANTS.TIMEOUTS.CLEANUP);
      
      // Clean up known temporary files
      const tempFiles = Object.values(FFMPEG_CONSTANTS.TEMP_FILES);
      for (const fileName of tempFiles) {
        await withRetry(
          () => ffmpegRef.current.deleteFile(fileName),
          PROCESSING_CONSTANTS.RETRY.MAX_ATTEMPTS,
          PROCESSING_CONSTANTS.RETRY.BASE_DELAY
        ).catch(() => {/* Ignore cleanup errors */});
      }

      // Clean up any remaining files
      try {
        const files = await ffmpegRef.current.listDir('/');
        for (const fileInfo of files) {
          const fileName = typeof fileInfo === 'string' ? fileInfo : fileInfo.name;
          const isDir = typeof fileInfo === 'object' && fileInfo.isDir;

          if (!FFMPEG_CONSTANTS.SYSTEM_DIRS.has(fileName) && !isDir) {
            await withRetry(
              () => ffmpegRef.current.deleteFile(fileName),
              PROCESSING_CONSTANTS.RETRY.MAX_ATTEMPTS,
              PROCESSING_CONSTANTS.RETRY.BASE_DELAY
            ).catch(() => {/* Ignore cleanup errors */});
          }
        }
      } catch (listError) {
        // Continue on error
      }

      await sleep(300); // Final delay
    } catch (cleanupError) {
      // Continue on error - cleanup failures shouldn't stop the main operation
    }
  }, []);

  // Parse metadata from FFmpeg logs
  const parseMetadataFromLogs = useCallback((logOutput: string, file: File): VideoMetadata => {
    // Error checking
    if (logOutput.includes('Invalid data found when processing input') || 
        logOutput.includes('No such file or directory') ||
        logOutput.includes('Operation not permitted')) {
      throw new Error(`${ERROR_MESSAGES.FILE.CORRUPTED}: ${file.name}`);
    }

    if (!logOutput.includes('Stream #')) {
      throw new Error(ERROR_MESSAGES.SUBTITLE.NO_TRACKS);
    }

    // Parse video stream info
    const videoStreamMatch = logOutput.match(/Stream.*Video: ([^,]+)[^,]*,.*?(\d+x\d+)[^,]*,.*?(\d+\.?\d*) fps/);
    const videoCodec = videoStreamMatch ? videoStreamMatch[1] : 'unknown';
    const resolution = videoStreamMatch ? videoStreamMatch[2] : 'unknown';
    const fps = videoStreamMatch ? parseFloat(videoStreamMatch[3]) : 25;

    // Parse duration
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
      duration = totalSeconds.toString();
      movietimems = totalMilliseconds.toString();
      movieframes = Math.round(totalMilliseconds / 1000 * fps).toString();
    }

    // Parse bitrate
    const bitrateMatch = logOutput.match(/bitrate: (\d+) kb\/s/);
    const bitrate = bitrateMatch ? (parseInt(bitrateMatch[1]) * 1000).toString() : 'unknown';

    // Parse audio stream info
    const audioStreamMatch = logOutput.match(/Stream.*Audio: ([^,]+)[^,]*,.*?(\d+) Hz/);
    const audioCodec = audioStreamMatch ? audioStreamMatch[1] : 'unknown';
    const sampleRate = audioStreamMatch ? audioStreamMatch[2] : '48000';

    // Parse subtitle streams
    const subtitleStreams: SubtitleStream[] = [];
    const subtitleMatches = logOutput.match(/Stream #\d+:\d+(?:\([^)]*\))?: Subtitle: ([^(\n]+)(?:\([^)]*\))?[^\n]*(?:\n[^\n]*)*?(?:BPS\s*:\s*(\d+))?/g);

    if (subtitleMatches) {
      subtitleMatches.forEach(match => {
        const codecMatch = match.match(/Subtitle: ([^(\n]+?)(?:\s*\(|$)/);
        const codecName = codecMatch ? codecMatch[1].trim() : 'unknown';

        const streamMatch = match.match(/Stream #\d+:(\d+)/);
        const streamIndex = streamMatch ? parseInt(streamMatch[1]) : 0;

        const langMatch = match.match(/Stream #\d+:\d+\(([^)]+)\)/);
        const language = langMatch ? langMatch[1] : undefined;

        const isDefault = match.includes('(default)');
        const isForced = match.includes('(forced)');

        subtitleStreams.push({
          codec_type: 'subtitle' as const,
          codec_name: codecName,
          language: language,
          default: isDefault,
          forced: isForced,
          index: streamIndex
        });
      });
    }

    // Create metadata structure
    const videoStream: VideoStream = {
      codec_type: 'video' as const,
      codec_name: videoCodec,
      width: resolution !== 'unknown' ? parseInt(resolution.split('x')[0]) : 1280,
      height: resolution !== 'unknown' ? parseInt(resolution.split('x')[1]) : 720,
      r_frame_rate: `${fps}/1`,
      pix_fmt: 'yuv420p',
      bit_rate: '1500000',
      index: 0
    };

    const audioStream: AudioStream = {
      codec_type: 'audio' as const,
      codec_name: audioCodec,
      channels: 2,
      sample_rate: sampleRate,
      bit_rate: '128000',
      index: 1
    };

    return {
      format: {
        filename: file.name,
        size: file.size.toString(),
        format_name: getFormatFromFileName(file.name),
        duration,
        bit_rate: bitrate,
        fps: fps.toString(),
        movietimems,
        movieframes
      },
      streams: [videoStream, audioStream, ...subtitleStreams]
    };
  }, []);

  // Extract metadata from file
  const extractMetadata = useCallback(async (file: File) => {
    if (!ffmpegRef.current.loaded) return;

    // Validate file
    const validation = validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    try {
      showProgress('Processing video...', 10);
      await cleanupFFmpegFiles();
      await sleep(500);

      let fileData: Blob;
      
      // Check if it's an MKV/WebM file
      const isMKV = file.name.toLowerCase().endsWith('.mkv') || file.name.toLowerCase().endsWith('.webm');
      
      if (isMKV) {
        // For MKV files, always use 10MB chunk regardless of file size
        console.log(`[METADATA EXTRACTION] MKV file detected (${formatFileSize(file.size)}), using 10MB chunk extraction`);
        showProgress(`MKV file detected - reading first 10MB for metadata...`, 25);
        
        fileData = file.slice(0, PROCESSING_CONSTANTS.CHUNK_SIZES.MKV_METADATA_CHUNK);
        console.log(`[METADATA EXTRACTION] Reading first ${formatFileSize(PROCESSING_CONSTANTS.CHUNK_SIZES.MKV_METADATA_CHUNK)} of MKV file for metadata`);
      } else {
        // For other files, use the existing logic
        const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024 * 1024; // 5GB
        const HEADER_SIZE = 1 * 1024 * 1024; // 1MB header should contain metadata
        
        if (file.size > LARGE_FILE_THRESHOLD) {
          console.log(`[METADATA EXTRACTION] Large file detected (${formatFileSize(file.size)}), using header-only extraction`);
          showProgress(`Large file detected (${formatFileSize(file.size)}) - reading header only...`, 25);
          
          fileData = file.slice(0, HEADER_SIZE);
          console.log(`[METADATA EXTRACTION] Reading first ${formatFileSize(HEADER_SIZE)} of file for metadata`);
        } else {
          console.log(`[METADATA EXTRACTION] Normal file size (${formatFileSize(file.size)}), using complete file processing`);
          showProgress('Loading file...', 30);
          
          // Process complete file for smaller files
          const fileProcessor = createFileProcessor({
            chunkSize: PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE,
            debug: false
          });
          fileData = await fileProcessor.processCompleteFile(file);
        }
      }

      showProgress('Loading into FFmpeg...', 50);
      
      // Write file with timeout and retry
      await withRetry(async () => {
        try {
          await ffmpegRef.current.deleteFile(FFMPEG_CONSTANTS.TEMP_FILES.INPUT);
        } catch (e) {/* ignore */}

        const writePromise = ffmpegRef.current.writeFile(
          FFMPEG_CONSTANTS.TEMP_FILES.INPUT, 
          await fetchFile(fileData)
        );
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(ERROR_MESSAGES.FFMPEG.TIMEOUT)), 
            PROCESSING_CONSTANTS.TIMEOUTS.FILE_WRITE);
        });

        await Promise.race([writePromise, timeoutPromise]);
      }, PROCESSING_CONSTANTS.RETRY.FILE_WRITE_ATTEMPTS);

      showProgress('Extracting metadata...', 70);

      // Capture FFmpeg log output
      const ffmpegLogs: string[] = [];
      const logHandler = ({ message }: { message: string }) => {
        ffmpegLogs.push(message);
      };

      ffmpegRef.current.on('log', logHandler);

      try {
        const execPromise = ffmpegRef.current.exec(['-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT]);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(ERROR_MESSAGES.FFMPEG.TIMEOUT)), 
            PROCESSING_CONSTANTS.TIMEOUTS.FFMPEG_EXECUTION);
        });

        await Promise.race([execPromise, timeoutPromise]);
      } catch (ffmpegError) {
        // Expected error for info extraction
      }

      ffmpegRef.current.off('log', logHandler);

      if (ffmpegLogs.length === 0) {
        throw new Error('FFmpeg did not produce any output. The file might be corrupted.');
      }

      showProgress('Parsing metadata...', 90);
      const parsedMetadata = parseMetadataFromLogs(ffmpegLogs.join('\n'), file);
      
      
      setMetadata(parsedMetadata);
      setSelectedFile(file);
      setCurrentMethod('Optimized Metadata Extraction');
      
      await cleanupFFmpegFiles();
      hideProgress();

    } catch (error) {
      await cleanupFFmpegFiles();
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract metadata';
      showError(errorMessage);
      hideProgress();
      throw error;
    }
  }, [showProgress, hideProgress, showError, cleanupFFmpegFiles, parseMetadataFromLogs]);

  // Progressive subtitle extraction for large files - collect from ALL chunks
  const extractSubtitleFromMultipleChunks = useCallback(async (
    file: File, 
    streamIndex: number, 
    outputFormat: string, 
    outputFilename: string
  ): Promise<Uint8Array | null> => {
    const fileSize = file.size;
    const chunkSize = 8 * 1024 * 1024; // 8MB chunks for progressive extraction (reduced further to avoid FS errors)
    const maxChunks = 15; // Increase to 15 chunks with smaller size to cover more of the file
    
    console.log(`[PROGRESSIVE EXTRACTION] Starting progressive extraction for ${formatFileSize(fileSize)} file`);
    
    // Calculate strategic chunk positions - focus on areas where subtitles are likely
    const totalChunks = Math.min(maxChunks, Math.ceil(fileSize / (200 * 1024 * 1024))); // One chunk per 200MB
    const chunkPositions = [];
    
    // Add beginning of file (metadata area)
    chunkPositions.push(0);
    
    // Add positions throughout the file
    for (let i = 1; i < totalChunks; i++) {
      const position = Math.floor((fileSize / totalChunks) * i);
      chunkPositions.push(position);
    }
    
    // Add end of file (often contains subtitle data in MKV files)
    if (fileSize > chunkSize * 2) {
      const endPosition = Math.max(fileSize - chunkSize, chunkPositions[chunkPositions.length - 1] + chunkSize);
      if (!chunkPositions.includes(endPosition)) {
        chunkPositions.push(endPosition);
      }
    }
    
    console.log(`[PROGRESSIVE EXTRACTION] Will try ${chunkPositions.length} chunk positions:`, chunkPositions.map(p => `${formatFileSize(p)}`));
    
    // Collect subtitle data from ALL chunks that work
    const collectedSubtitleData: Uint8Array[] = [];
    let successfulChunks = 0;
    let failedChunks = 0;
    
    // Try EVERY chunk and collect all subtitle data
    for (let i = 0; i < chunkPositions.length; i++) {
      const position = chunkPositions[i];
      const chunkEnd = Math.min(position + chunkSize, fileSize);
      const chunk = file.slice(position, chunkEnd);
      
      showProgress(
        `Processing chunk ${i + 1}/${chunkPositions.length} at ${formatFileSize(position)}...`,
        20 + (i / chunkPositions.length) * 70
      );
      
      try {
        console.log(`[PROGRESSIVE EXTRACTION] Processing chunk ${i + 1} at position ${formatFileSize(position)}, size: ${formatFileSize(chunk.size)}`);
        
        // More aggressive cleanup before processing this chunk
        await cleanupFFmpegFiles();
        await sleep(100); // Brief pause for cleanup
        
        try {
          // Load chunk with better error handling
          console.log(`[PROGRESSIVE EXTRACTION] Writing chunk ${i + 1} to FFmpeg FS...`);
          await ffmpegRef.current.writeFile(FFMPEG_CONSTANTS.TEMP_FILES.INPUT, await fetchFile(chunk));
          console.log(`[PROGRESSIVE EXTRACTION] Chunk ${i + 1} loaded successfully`);
        } catch (writeError) {
          console.error(`[PROGRESSIVE EXTRACTION] Failed to write chunk ${i + 1} to FFmpeg FS:`, writeError);
          throw writeError;
        }
        
        // Try extraction
        let chunkFilename = `chunk_${i}_${outputFilename}`;
        console.log(`[PROGRESSIVE EXTRACTION] Executing FFmpeg for chunk ${i + 1}...`);
        
        try {
          console.log(`[PROGRESSIVE EXTRACTION] Attempting extraction with format: ${outputFormat}`);
          await ffmpegRef.current.exec([
            '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
            '-map', `0:${streamIndex}`,
            '-c:s', outputFormat,
            chunkFilename
          ]);
          console.log(`[PROGRESSIVE EXTRACTION] FFmpeg execution completed for chunk ${i + 1} with format ${outputFormat}`);
        } catch (execError) {
          console.log(`[PROGRESSIVE EXTRACTION] Extraction with format ${outputFormat} failed for chunk ${i + 1}, error:`, execError);
          
          // If the requested format failed and it's not already 'copy', try raw extraction
          if (outputFormat !== 'copy') {
            try {
              console.log(`[PROGRESSIVE EXTRACTION] Trying raw subtitle extraction (copy) for chunk ${i + 1}...`);
              const rawFilename = chunkFilename.replace(/\.(srt|vtt|ass)$/, '.txt');
              await ffmpegRef.current.exec([
                '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
                '-map', `0:${streamIndex}`,
                '-c:s', 'copy',  // Copy raw subtitle stream
                rawFilename
              ]);
              console.log(`[PROGRESSIVE EXTRACTION] Raw subtitle extraction completed for chunk ${i + 1}`);
              // Update filename for the rest of the processing
              chunkFilename = rawFilename;
            } catch (rawError) {
              console.error(`[PROGRESSIVE EXTRACTION] Both ${outputFormat} and copy extraction failed for chunk ${i + 1}:`, rawError);
              throw rawError;
            }
          } else {
            // Already tried copy, so just throw the error
            throw execError;
          }
        }
        
        // Check if output file exists and try to read it
        try {
          console.log(`[PROGRESSIVE EXTRACTION] Checking if output file exists: ${chunkFilename}`);
          
          // First, list files to see what's actually in the FFmpeg FS
          try {
            const files = await ffmpegRef.current.listDir('/');
            console.log(`[PROGRESSIVE EXTRACTION] Files in FFmpeg FS after chunk ${i + 1}:`, files.map(f => typeof f === 'string' ? f : f.name));
            
            const outputFileExists = files.some(f => {
              const fileName = typeof f === 'string' ? f : f.name;
              return fileName === chunkFilename;
            });
            
            if (!outputFileExists) {
              console.log(`[PROGRESSIVE EXTRACTION] Output file ${chunkFilename} was not created by FFmpeg for chunk ${i + 1} - likely no subtitle data in this chunk`);
              // This is normal - not all chunks will have subtitle data
              continue; // Skip to next chunk
            }
            
            console.log(`[PROGRESSIVE EXTRACTION] Output file ${chunkFilename} exists, attempting to read...`);
          } catch (listError) {
            console.warn(`[PROGRESSIVE EXTRACTION] Could not list FFmpeg FS files:`, listError);
            // Continue anyway and try to read the file
          }
          
          const subtitleData = await ffmpegRef.current.readFile(chunkFilename);
          
          if (subtitleData.length > 0) {
            console.log(`[PROGRESSIVE EXTRACTION] Found subtitles in chunk ${i + 1}! Size: ${subtitleData.length} bytes`);
            collectedSubtitleData.push(subtitleData as Uint8Array);
            successfulChunks++;
          } else {
            console.log(`[PROGRESSIVE EXTRACTION] Chunk ${i + 1} processed but output file is empty`);
          }
          
          // Clean up chunk file
          try {
            await ffmpegRef.current.deleteFile(chunkFilename);
            console.log(`[PROGRESSIVE EXTRACTION] Cleaned up output file ${chunkFilename}`);
          } catch (cleanupError) {
            console.warn(`[PROGRESSIVE EXTRACTION] Failed to clean up chunk file ${chunkFilename}:`, cleanupError);
          }
        } catch (readError) {
          console.error(`[PROGRESSIVE EXTRACTION] Failed to read result from chunk ${i + 1}:`, {
            error: readError,
            errorName: readError instanceof Error ? readError.name : 'Unknown',
            errorMessage: readError instanceof Error ? readError.message : String(readError),
            fileName: chunkFilename
          });
          
          // If we can't read the file, it might not exist (which is normal for chunks without subtitles)
          // Don't throw error, just continue to next chunk
          console.log(`[PROGRESSIVE EXTRACTION] Continuing to next chunk after read failure...`);
        }
        
        // Add a small delay between chunks to help with memory management
        if (i < chunkPositions.length - 1) {
          await sleep(200);
        }
        
      } catch (chunkError) {
        console.error(`[PROGRESSIVE EXTRACTION] Chunk ${i + 1} failed with detailed error:`, {
          error: chunkError,
          errorName: chunkError instanceof Error ? chunkError.name : 'Unknown',
          errorMessage: chunkError instanceof Error ? chunkError.message : String(chunkError),
          errorStack: chunkError instanceof Error ? chunkError.stack : undefined,
          chunkPosition: formatFileSize(position),
          chunkSize: formatFileSize(chunk.size)
        });
        failedChunks++;
        
        // Try to clean up any partial files from the failed chunk
        try {
          await cleanupFFmpegFiles();
        } catch (cleanupErr) {
          console.warn(`[PROGRESSIVE EXTRACTION] Cleanup after chunk ${i + 1} failure also failed:`, cleanupErr);
        }
        
        // Continue to next chunk - don't give up!
      }
    }
    
    console.log(`[PROGRESSIVE EXTRACTION] Completed processing all chunks. Successful: ${successfulChunks}, Failed: ${failedChunks}`);
    
    // Combine all collected subtitle data
    if (collectedSubtitleData.length > 0) {
      console.log(`[PROGRESSIVE EXTRACTION] Combining ${collectedSubtitleData.length} subtitle data chunks`);
      
      if (collectedSubtitleData.length === 1) {
        // Only one chunk has data, return it directly
        return collectedSubtitleData[0];
      } else {
        // Multiple chunks have data, combine them
        const totalLength = collectedSubtitleData.reduce((sum, data) => sum + data.length, 0);
        const combinedData = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const data of collectedSubtitleData) {
          combinedData.set(data, offset);
          offset += data.length;
        }
        
        console.log(`[PROGRESSIVE EXTRACTION] Combined ${collectedSubtitleData.length} chunks into ${formatFileSize(combinedData.length)} of subtitle data`);
        return combinedData;
      }
    }
    
    // Even if no subtitle data was found, let's create a placeholder file
    console.log(`[PROGRESSIVE EXTRACTION] No subtitle data found in any chunk, creating placeholder`);
    const placeholderText = `No subtitle data found in the file.\n\nThis may be because:\n- The subtitle stream is embedded differently than expected\n- The file uses a subtitle format not supported by this extraction method\n- The subtitle data is distributed in a way that wasn't captured\n\nFile: ${file.name}\nStream: ${streamIndex}\nChunks processed: ${chunkPositions.length}\nSuccessful chunks: ${successfulChunks}\nFailed chunks: ${failedChunks}`;
    
    return new TextEncoder().encode(placeholderText);
  }, [showProgress]);

  // Extract single subtitle
  const extractSubtitle = useCallback(async (
    file: File, 
    streamIndex: number, 
    language?: string, 
    codecName?: string, 
    isForced?: boolean
  ) => {
    if (!ffmpegRef.current.loaded) return;

    try {
      console.log(`[SUBTITLE EXTRACTION] Starting extraction for file: ${file.name} (${formatFileSize(file.size)}), stream: ${streamIndex}`);
      showProgress(`Extracting subtitle track ${streamIndex}...`, 10);
      
      // Aggressive cleanup before subtitle extraction to prevent filesystem contamination
      console.log(`[SUBTITLE EXTRACTION] Performing aggressive filesystem cleanup...`);
      await cleanupFFmpegFiles();
      
      // Additional cleanup: manually remove any lingering files
      try {
        const allFiles = await ffmpegRef.current.listDir('/');
        console.log(`[SUBTITLE EXTRACTION] Found ${allFiles.length} files in FFmpeg filesystem before cleanup`);
        
        for (const fileInfo of allFiles) {
          if (fileInfo.name && !FFMPEG_CONSTANTS.SYSTEM_DIRS.has(fileInfo.name) && !fileInfo.isDir) {
            try {
              await ffmpegRef.current.deleteFile(fileInfo.name);
              console.log(`[SUBTITLE EXTRACTION] Manually deleted lingering file: ${fileInfo.name}`);
            } catch (deleteError) {
              console.warn(`[SUBTITLE EXTRACTION] Could not delete ${fileInfo.name}:`, deleteError);
            }
          }
        }
        
        const remainingFiles = await ffmpegRef.current.listDir('/');
        console.log(`[SUBTITLE EXTRACTION] Filesystem cleaned, ${remainingFiles.length} files remaining`);
      } catch (listError) {
        console.warn(`[SUBTITLE EXTRACTION] Could not perform manual cleanup:`, listError);
      }

      // Generate filename for text-based subtitles
      const generated = generateSubtitleFilename(file.name, language, isForced, codecName);
      let outputFilename = generated.filename;
      const outputExt = generated.extension;
      let outputFormat = outputExt === 'vtt' ? 'webvtt' : outputExt;

      // For very large files (>5GB), use progressive extraction like the working useVideoMetadata hook
      const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024 * 1024; // 5GB
      const isVeryLargeFile = file.size > LARGE_FILE_THRESHOLD;
      
      if (isVeryLargeFile) {
        console.log(`[SUBTITLE EXTRACTION] Very large file detected (${formatFileSize(file.size)}), analyzing subtitle format...`);
        
        try {
          // For text-based subtitles in large files, use progressive chunk extraction
          showProgress(`Scanning large file for text subtitles...`, 20);
          
          const progressiveResult = await extractSubtitleFromMultipleChunks(
              file,
              streamIndex,
              outputFormat,
              outputFilename
            );
            
            // Always process the result, even if it's just a placeholder
            if (progressiveResult) {
              console.log(`[SUBTITLE EXTRACTION] Progressive extraction completed, size: ${progressiveResult.length} bytes`);
              
              // Create download with the result (could be actual subtitles or placeholder info)
              const blob = new Blob([progressiveResult], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = outputFilename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              
              await cleanupFFmpegFiles();
              showProgress(`Extraction completed! Downloaded ${formatFileSize(progressiveResult.length)}`, 100);
              
              // Auto-hide progress after 3 seconds
              setTimeout(hideProgress, 3000);
              return;
              
            } else {
              // This should never happen now since we always return something
              console.log(`[SUBTITLE EXTRACTION] Unexpected: no result from progressive extraction`);
              const fallbackText = 'Progressive extraction completed but returned no data.';
              const fallbackData = new TextEncoder().encode(fallbackText);
              
              const blob = new Blob([fallbackData], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = outputFilename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              
              await cleanupFFmpegFiles();
              showProgress(`Extraction completed! Downloaded ${formatFileSize(fallbackData.length)}`, 100);
              setTimeout(hideProgress, 3000);
              return;
            }
        } catch (progressiveError) {
          console.error(`[SUBTITLE EXTRACTION] Progressive extraction had an error:`, progressiveError);
          
          // Even if there was an error, provide a download with error info
          const errorText = `Progressive extraction encountered an error.\n\nError: ${progressiveError instanceof Error ? progressiveError.message : 'Unknown error'}\n\nFile: ${file.name}\nStream: ${streamIndex}\n\nThis may be due to:\n- File format compatibility issues\n- Memory limitations\n- Unsupported subtitle encoding\n\nTry using a different extraction method or a video processing tool.`;
          const errorData = new TextEncoder().encode(errorText);
          
          const blob = new Blob([errorData], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = outputFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          await cleanupFFmpegFiles();
          showProgress(`Extraction completed with error info! Downloaded ${formatFileSize(errorData.length)}`, 100);
          setTimeout(hideProgress, 3000);
          return;
        }
      }
      
      // For subtitle extraction, we need the complete file regardless of format
      // because subtitle data may be distributed throughout the file
      console.log(`[SUBTITLE EXTRACTION] Loading complete file for subtitle extraction (${formatFileSize(file.size)})`);
      
      const fileProcessor = createFileProcessor({
        chunkSize: PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE,
        debug: false
      });

      showProgress('Loading complete file for subtitle extraction...', 30);
      console.log(`[SUBTITLE EXTRACTION] About to process file: ${file.name}, accessible: ${file instanceof File}`);
      
      let fileData: Blob;
      try {
        fileData = await fileProcessor.processCompleteFile(file);
        console.log(`[SUBTITLE EXTRACTION] File processed successfully, data size: ${formatFileSize(fileData.size)}`);
      } catch (fileProcessError) {
        console.error(`[SUBTITLE EXTRACTION] Failed to process file: ${file.name}`, fileProcessError);
        throw new Error(`File processing failed: ${fileProcessError instanceof Error ? fileProcessError.message : 'Unknown error'}`);
      }
      
      showProgress('Loading into FFmpeg...', 50);
      await ffmpegRef.current.writeFile(FFMPEG_CONSTANTS.TEMP_FILES.INPUT, await fetchFile(fileData));
      
      // Debug: Check what files exist in FFmpeg filesystem
      try {
        const files = await ffmpegRef.current.listDir('/');
        console.log(`[SUBTITLE EXTRACTION] FFmpeg filesystem contents:`, files);
      } catch (listError) {
        console.warn(`[SUBTITLE EXTRACTION] Could not list FFmpeg filesystem:`, listError);
      }

      // Validate that the requested stream exists in the loaded file
      try {
        console.log(`[SUBTITLE EXTRACTION] Validating stream ${streamIndex} exists in loaded file...`);
        
        // Try to get stream info first - this will fail gracefully if stream doesn't exist
        await ffmpegRef.current.exec([
          '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
          '-map', `0:${streamIndex}`,
          '-t', '0.1', // Only process 0.1 seconds
          '-f', 'null',
          '-'
        ]);
        console.log(`[SUBTITLE EXTRACTION] Stream ${streamIndex} validation successful`);
      } catch (validationError) {
        console.error(`[SUBTITLE EXTRACTION] Stream ${streamIndex} validation failed:`, validationError);
        
        // Stream doesn't exist - try to find the correct subtitle stream index
        console.log(`[SUBTITLE EXTRACTION] Stream ${streamIndex} not found, analyzing complete file for correct indices...`);
        
        try {
          // Re-analyze the complete file to get accurate metadata
          showProgress('Re-analyzing complete file for accurate stream mapping...', 60);
          
          // Instead of re-parsing, let's try to map to existing subtitle streams by finding the first available one
          // This is simpler and more reliable than trying to re-parse metadata
          console.log(`[SUBTITLE EXTRACTION] Attempting to find alternative subtitle stream indices...`);
          
          let foundWorkingStream = false;
          const maxStreamIndex = 20; // Reasonable upper limit to avoid infinite loops
          
          for (let testIndex = 0; testIndex < maxStreamIndex; testIndex++) {
            try {
              console.log(`[SUBTITLE EXTRACTION] Testing stream index ${testIndex}...`);
              await ffmpegRef.current.exec([
                '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
                '-map', `0:${testIndex}`,
                '-t', '0.1',
                '-f', 'null',
                '-'
              ]);
              
              // If we get here, the stream exists - check if it's a subtitle stream
              // We can't easily determine codec type without full metadata parsing,
              // so we'll assume any working stream index might be what we want
              console.log(`[SUBTITLE EXTRACTION] Found working stream at index ${testIndex}, using this instead of ${streamIndex}`);
              streamIndex = testIndex;
              foundWorkingStream = true;
              break;
            } catch {
              // Stream doesn't exist or isn't accessible, try next
              continue;
            }
          }
          
          if (!foundWorkingStream) {
            throw new Error(`No accessible subtitle streams found in indices 0-${maxStreamIndex}. The file may not contain subtitle tracks or they may be in a different format.`);
          }
        } catch (reanalysisError) {
          console.error(`[SUBTITLE EXTRACTION] Complete file re-analysis failed:`, reanalysisError);
          throw new Error(`Stream index ${streamIndex} not found and could not re-analyze file: ${reanalysisError instanceof Error ? reanalysisError.message : 'Unknown error'}`);
        }
      }

      showProgress(`Extracting subtitle (${outputFormat} format)...`, 70);

      // Extract subtitle
      try {
        console.log(`[SUBTITLE EXTRACTION] Attempting extraction with format: ${outputFormat}`);
        await ffmpegRef.current.exec([
          '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
          '-map', `0:${streamIndex}`,
          '-c:s', outputFormat,
          outputFilename
        ]);
        console.log(`[SUBTITLE EXTRACTION] Extraction completed with format: ${outputFormat}`);
      } catch (extractError) {
        console.error(`[SUBTITLE EXTRACTION] Extraction with ${outputFormat} failed:`, extractError);
        console.log(`[SUBTITLE EXTRACTION] Error details:`, {
          errorName: extractError instanceof Error ? extractError.name : 'Unknown',
          errorMessage: extractError instanceof Error ? extractError.message : String(extractError),
          streamIndex,
          outputFormat,
          outputFilename
        });
        console.log(`[SUBTITLE EXTRACTION] Trying fallback...`);
        
        if (outputFormat !== 'copy') {
          // Try SRT fallback for text formats
          try {
            const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
            console.log(`[SUBTITLE EXTRACTION] Trying SRT fallback: ${srtFilename}`);
            await ffmpegRef.current.exec([
              '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
              '-map', `0:${streamIndex}`,
              '-c:s', 'srt',
              srtFilename
            ]);
            outputFilename = srtFilename; // Update filename for download
            console.log(`[SUBTITLE EXTRACTION] SRT fallback successful`);
          } catch (srtError) {
            console.error(`[SUBTITLE EXTRACTION] SRT fallback failed:`, srtError);
            console.log(`[SUBTITLE EXTRACTION] SRT error details:`, {
              errorName: srtError instanceof Error ? srtError.name : 'Unknown',
              errorMessage: srtError instanceof Error ? srtError.message : String(srtError)
            });
            // Try raw copy as last resort
            console.log(`[SUBTITLE EXTRACTION] Trying raw copy...`);
            try {
              const fallbackFilename = outputFilename.replace(/\.[^/.]+$/, '.txt');
              await ffmpegRef.current.exec([
                '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
                '-map', `0:${streamIndex}`,
                '-c:s', 'copy',
                fallbackFilename
              ]);
              outputFilename = fallbackFilename; // Update filename for download
              console.log(`[SUBTITLE EXTRACTION] Raw copy successful`);
            } catch (copyError) {
              console.error(`[SUBTITLE EXTRACTION] Raw copy also failed:`, copyError);
              console.log(`[SUBTITLE EXTRACTION] Raw copy error details:`, {
                errorName: copyError instanceof Error ? copyError.name : 'Unknown',
                errorMessage: copyError instanceof Error ? copyError.message : String(copyError)
              });
              throw copyError; // Re-throw since all methods failed
            }
          }
        } else {
          // Already tried copy, re-throw the error
          throw extractError;
        }
      }

      showProgress('Preparing download...', 90);

      // Read subtitle data
      const subtitleData = await ffmpegRef.current.readFile(outputFilename);
      const dataArray = subtitleData instanceof Uint8Array ? subtitleData : new Uint8Array(subtitleData as unknown as ArrayBuffer);

      // Create download with appropriate MIME type
      const mimeType = 'text/plain';
      const blob = new Blob([dataArray], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await cleanupFFmpegFiles();
      showProgress(`Subtitle extraction completed! (${formatFileSize(dataArray.length)})`, 100);

      // Auto-hide progress after 3 seconds
      setTimeout(hideProgress, 3000);

    } catch (error) {
      await cleanupFFmpegFiles();
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract subtitle';
      showError(`Subtitle extraction failed: ${errorMessage}`);
      hideProgress();
    }
  }, [showProgress, hideProgress, showError, cleanupFFmpegFiles, extractSubtitleFromMultipleChunks]);

  // Extract all subtitles as ZIP
  const extractAllSubtitles = useCallback(async (file: File) => {
    if (!ffmpegRef.current.loaded || !metadata) return;

    try {
      showProgress('Preparing batch subtitle extraction...', 5);

      const subtitleStreams = metadata.streams?.filter(stream => stream.codec_type === 'subtitle') || [];
      
      if (subtitleStreams.length === 0) {
        showError(ERROR_MESSAGES.SUBTITLE.NO_TRACKS);
        return;
      }

      await cleanupFFmpegFiles();

      // Always load the complete file using chunked reading for batch subtitle extraction
      // Only metadata extraction uses header-only approach
      console.log(`[BATCH SUBTITLE EXTRACTION] Loading complete file (${formatFileSize(file.size)}) using chunked reading`);
      
      const fileProcessor = createFileProcessor({
        chunkSize: PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE,
        debug: false
      });
      const fileData = await fileProcessor.processCompleteFile(file);
      showProgress('Loading file for batch extraction...', 15);
      await ffmpegRef.current.writeFile(FFMPEG_CONSTANTS.TEMP_FILES.INPUT, await fetchFile(fileData));

      const zip = new JSZip();
      const extractedFiles: Array<{filename: string, data: Uint8Array}> = [];
      const usedFilenames = new Set<string>();

      // Extract each subtitle stream
      for (let i = 0; i < subtitleStreams.length; i++) {
        const stream = subtitleStreams[i];
        const streamIndex = stream.index !== undefined ? stream.index : i;
        const progress = Math.round(20 + (i / subtitleStreams.length) * 70);

        showProgress(`Extracting subtitle ${i + 1}/${subtitleStreams.length} (${stream.language || 'unknown'})...`, progress);

        try {
          // Generate unique filename for text-based subtitles
          const generated = generateSubtitleFilename(file.name, stream.language, stream.forced, stream.codec_name);
          let outputFilename = generated.filename;
          const outputFormat = outputFilename.endsWith('.vtt') ? 'webvtt' : 'srt';

          if (usedFilenames.has(outputFilename)) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            const ext = outputFilename.split('.').pop();
            outputFilename = `${nameWithoutExt}.${streamIndex}.${ext}`;
          }
          usedFilenames.add(outputFilename);

          // Extract subtitle using the complete file (already loaded)
          console.log(`[BATCH SUBTITLE EXTRACTION] Extracting stream ${streamIndex} from complete file using format: ${outputFormat}`);

          // Extract subtitle
          try {
            await ffmpegRef.current.exec([
              '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
              '-map', `0:${streamIndex}`,
              '-c:s', outputFormat,
              outputFilename
            ]);
            console.log(`[BATCH SUBTITLE EXTRACTION] Stream ${streamIndex} extracted successfully with format: ${outputFormat}`);
          } catch (extractError) {    
            console.log(`[BATCH SUBTITLE EXTRACTION] Extraction with ${outputFormat} failed for stream ${streamIndex}, trying fallback...`);
            
            // Try SRT fallback for text formats
            try {
              const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
              await ffmpegRef.current.exec([
                '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
                '-map', `0:${streamIndex}`,
                '-c:s', 'srt',
                srtFilename
              ]);
              outputFilename = srtFilename;
              console.log(`[BATCH SUBTITLE EXTRACTION] SRT fallback successful for stream ${streamIndex}`);
            } catch (srtError) {
              // Try raw copy as last resort
              console.log(`[BATCH SUBTITLE EXTRACTION] SRT fallback failed for stream ${streamIndex}, trying raw copy...`);
              const fallbackFilename = outputFilename.replace(/\.[^/.]+$/, '.txt');
              await ffmpegRef.current.exec([
                '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
                '-map', `0:${streamIndex}`,
                '-c:s', 'copy',
                fallbackFilename
              ]);
              outputFilename = fallbackFilename;
              console.log(`[BATCH SUBTITLE EXTRACTION] Raw copy successful for stream ${streamIndex}`);
            }
          }

          // Read extracted data
          const extractedData = await ffmpegRef.current.readFile(outputFilename);
          const subtitleData = extractedData instanceof Uint8Array ? 
            extractedData : new TextEncoder().encode(extractedData as string);
          
          if (subtitleData.length > 0) {
            extractedFiles.push({ filename: outputFilename, data: subtitleData });
            zip.file(outputFilename, subtitleData);
          }

        } catch (streamError) {
          console.warn(`Failed to extract stream ${streamIndex}:`, streamError);
          // Continue with next stream
        }
      }

      if (extractedFiles.length > 0) {
        showProgress(`Creating ZIP with ${extractedFiles.length} subtitle files...`, 95);
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFilename = file.name.replace(/\.[^/.]+$/, '_subtitles.zip');
        
        // Download ZIP
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showProgress(`All subtitles extracted! ZIP file (${extractedFiles.length} files) downloaded.`, 100);
        
        // Auto-hide progress after 3 seconds
        setTimeout(hideProgress, 3000);
      } else {
        showError(ERROR_MESSAGES.SUBTITLE.EMPTY_RESULT);
      }

      await cleanupFFmpegFiles();

    } catch (error) {
      await cleanupFFmpegFiles();
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract all subtitles';
      showError(`Batch extraction failed: ${errorMessage}`);
      hideProgress();
    }
  }, [metadata, showProgress, hideProgress, showError, cleanupFFmpegFiles]);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    console.log('[HOOK DEBUG] handleFileSelect called with file:', file.name);
    console.log('[HOOK DEBUG] FFmpeg ref loaded status:', ffmpegRef.current.loaded);
    
    if (!file) {
      console.log('[HOOK DEBUG] No file provided, returning');
      return;
    }

    hideError();
    setMetadata(null);
    setSelectedFile(null);

    // Use only FFmpeg ref status as source of truth
    if (!ffmpegRef.current.loaded) {
      console.log('[HOOK DEBUG] FFmpeg not ready, waiting...');
      showProgress('Waiting for FFmpeg to load...');
      
      // Wait for FFmpeg to be ready with timeout
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max wait
      
      while (!ffmpegRef.current.loaded && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        console.log('[HOOK DEBUG] Waiting for FFmpeg, attempt:', attempts);
      }
      
      if (!ffmpegRef.current.loaded) {
        showError('FFmpeg failed to load. Please refresh the page and try again.');
        return;
      }
      
      console.log('[HOOK DEBUG] FFmpeg is now ready, proceeding...');
    }

    console.log('[HOOK DEBUG] FFmpeg is loaded, calling extractMetadata');
    await extractMetadata(file);
  }, [extractMetadata, hideError, showError, showProgress]);

  // Initialize FFmpeg
  useEffect(() => {
    const initializeFFmpeg = async () => {
      console.log('[FFMPEG DEBUG] Starting FFmpeg initialization...');
      const ffmpeg = ffmpegRef.current;
      
      console.log('[FFMPEG DEBUG] FFmpeg ref:', ffmpeg);
      console.log('[FFMPEG DEBUG] FFmpeg loaded status:', ffmpeg.loaded);
      console.log('[FFMPEG DEBUG] Already initializing?', initializingRef.current);
      
      if (ffmpeg.loaded) {
        console.log('[FFMPEG DEBUG] FFmpeg already loaded, setting isLoaded to true');
        setIsLoaded(true);
        return;
      }

      if (initializingRef.current) {
        console.log('[FFMPEG DEBUG] Already initializing, skipping duplicate call');
        return;
      }

      initializingRef.current = true;

      try {
        // Use locally cached FFmpeg files to avoid network dependencies
        console.log('[FFMPEG DEBUG] Using locally cached FFmpeg files...');
        
        // Get the base URL for the current app (handles both dev and production)
        const baseURL = window.location.origin + window.location.pathname;
        const ffmpegBaseURL = `${baseURL}ffmpeg`;
        
        const coreJSUrl = `${ffmpegBaseURL}/ffmpeg-core.js`;
        const wasmUrl = `${ffmpegBaseURL}/ffmpeg-core.wasm`;
        const workerUrl = `${ffmpegBaseURL}/ffmpeg-core.worker.js`;
        
        console.log('[FFMPEG DEBUG] Local FFmpeg URLs:', { 
          coreJSUrl, 
          wasmUrl, 
          workerUrl,
          baseURL,
          ffmpegBaseURL 
        });
        
        console.log('[FFMPEG DEBUG] Creating blob URLs from local files...');
        const coreURL = await toBlobURL(coreJSUrl, 'text/javascript');
        const wasmURL = await toBlobURL(wasmUrl, 'application/wasm');
        
        console.log('[FFMPEG DEBUG] Local blob URLs created successfully:', { coreURL, wasmURL });
        
        console.log('[FFMPEG DEBUG] Loading FFmpeg with local files...');
        await ffmpeg.load({
          coreURL,
          wasmURL,
        });
        
        console.log('[FFMPEG DEBUG] FFmpeg.load() completed successfully');
        console.log('[FFMPEG DEBUG] FFmpeg loaded status after load:', ffmpeg.loaded);
        setIsLoaded(true);
        console.log('[FFMPEG DEBUG] setIsLoaded(true) called');
        initializingRef.current = false;
      } catch (err) {
        console.error('[FFMPEG DEBUG] Failed to load FFmpeg:', err);
        console.error('[FFMPEG DEBUG] Error details:', {
          name: err instanceof Error ? err.name : 'Unknown',
          message: err instanceof Error ? err.message : 'Unknown error',
          stack: err instanceof Error ? err.stack : 'No stack trace'
        });
        
        let errorMessage = 'Failed to load FFmpeg';
        
        if (err instanceof Error) {
          const message = err.message.toLowerCase();
          if (message.includes('network') || message.includes('fetch')) {
            errorMessage = 'Failed to load FFmpeg: Network error. Please check your internet connection and try refreshing the page.';
          } else if (message.includes('wasm')) {
            errorMessage = 'Failed to load FFmpeg: WebAssembly not supported. Please use a modern browser (Chrome 57+, Firefox 52+, Safari 11+, Edge 79+).';
          } else if (message.includes('cors')) {
            errorMessage = 'Failed to load FFmpeg: CORS error. Please try refreshing the page.';
          } else {
            errorMessage = `Failed to load FFmpeg: ${err.message}`;
          }
        }
        
        console.log('[FFMPEG DEBUG] Showing error:', errorMessage);
        showError(errorMessage);
        initializingRef.current = false;
      }
    };

    console.log('[FFMPEG DEBUG] useEffect triggered, calling initializeFFmpeg');
    initializeFFmpeg();
  }, [showError]);

  // Extract video/audio streams
  const extractStream = useCallback(async (file: File, streamIndex: number, streamType: string) => {
    if (!ffmpegRef.current.loaded) return;
    try {
      showProgress(`Preparing ${streamType} stream ${streamIndex}...`, 10);
      
      // Add small delay to ensure progress bar is visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up before extraction
      await cleanupFFmpegFiles();
      
      // Use the complete file for stream extraction
      showProgress(`Loading complete file into FFmpeg...`, 25);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const inputFileName = `input_${Date.now()}.${file.name.split('.').pop()}`;
      const outputFileName = `output_${streamType}_${streamIndex}_${Date.now()}.${streamType === 'video' ? 'mp4' : (streamType === 'audio' ? 'aac' : 'mkv')}`;
      
      // Load the complete file
      await ffmpegRef.current.writeFile(inputFileName, await fetchFile(file));
      
      // Extract the specific stream
      showProgress(`Extracting ${streamType} stream ${streamIndex}...`, 50);
      
      const command = streamType === 'video' 
        ? ['-i', inputFileName, '-map', `0:${streamIndex}`, '-c', 'copy', outputFileName]
        : ['-i', inputFileName, '-map', `0:${streamIndex}`, '-c', 'copy', outputFileName];
      
      await ffmpegRef.current.exec(command);
      
      showProgress(`Preparing ${streamType} download...`, 85);
      
      // Read the output file
      const data = await ffmpegRef.current.readFile(outputFileName);
      const blob = new Blob([data], { 
        type: streamType === 'video' ? 'video/mp4' : 'audio/aac' 
      });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace(/\.[^/.]+$/, '')}_${streamType}_${streamIndex}.${streamType === 'video' ? 'mp4' : 'aac'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showProgress(`${streamType} stream extracted successfully!`, 100);
      
      // Clean up
      await cleanupFFmpegFiles();
      setTimeout(hideProgress, 2000);
      
    } catch (error) {
      console.error(`[EXTRACT STREAM] Error extracting ${streamType} stream:`, error);
      showError(`Failed to extract ${streamType} stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await cleanupFFmpegFiles();
    }
  }, [showProgress, hideProgress, showError, cleanupFFmpegFiles]);

  return {
    metadata,
    progress,
    error,
    handleFileSelect,
    extractSubtitle,
    extractStream,
    extractAllSubtitles,
    hideError,
    hideProgress,
    isLoaded,
    selectedFile,
    currentMethod
  };
};