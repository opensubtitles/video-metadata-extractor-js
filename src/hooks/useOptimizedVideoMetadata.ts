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
    if (!isLoaded) return;

    // Validate file
    const validation = validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    try {
      showProgress('Processing video...', 10);
      await cleanupFFmpegFiles();
      await sleep(500);

      // Process file using file processor utility
      const fileProcessor = createFileProcessor({
        chunkSize: PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE,
        debug: false
      });

      showProgress('Loading file...', 30);
      const fileData = await fileProcessor.processCompleteFile(file);

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
  }, [isLoaded, showProgress, hideProgress, showError, cleanupFFmpegFiles, parseMetadataFromLogs]);

  // Extract single subtitle
  const extractSubtitle = useCallback(async (
    file: File, 
    streamIndex: number, 
    language?: string, 
    codecName?: string, 
    isForced?: boolean
  ) => {
    if (!isLoaded) return;

    try {
      showProgress(`Extracting subtitle track ${streamIndex}...`, 10);
      await cleanupFFmpegFiles();

      // Process file
      const fileProcessor = createFileProcessor({
        chunkSize: PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE,
        debug: false
      });

      const fileData = await fileProcessor.processCompleteFile(file);
      
      showProgress('Loading for subtitle extraction...', 30);
      await ffmpegRef.current.writeFile(FFMPEG_CONSTANTS.TEMP_FILES.INPUT, await fetchFile(fileData));

      // Generate filename
      const { filename: outputFilename, extension: outputExt } = generateSubtitleFilename(
        file.name, language, isForced, codecName
      );

      const outputFormat = outputExt === 'vtt' ? 'webvtt' : outputExt;

      showProgress(`Extracting subtitle (${outputFormat} format)...`, 60);

      // Extract subtitle
      try {
        await ffmpegRef.current.exec([
          '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
          '-map', `0:${streamIndex}`,
          '-c:s', outputFormat,
          outputFilename
        ]);
      } catch (extractError) {
        // Try SRT fallback
        const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
        await ffmpegRef.current.exec([
          '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
          '-map', `0:${streamIndex}`,
          '-c:s', 'srt',
          srtFilename
        ]);
      }

      showProgress('Preparing download...', 80);

      // Read and download
      const subtitleData = await ffmpegRef.current.readFile(outputFilename);
      const dataArray = subtitleData instanceof Uint8Array ? subtitleData : new Uint8Array(subtitleData as unknown as ArrayBuffer);

      // Create download
      const blob = new Blob([dataArray], { type: 'text/plain' });
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
  }, [isLoaded, showProgress, hideProgress, showError, cleanupFFmpegFiles]);

  // Extract all subtitles as ZIP
  const extractAllSubtitles = useCallback(async (file: File) => {
    if (!isLoaded || !metadata) return;

    try {
      showProgress('Preparing batch subtitle extraction...', 5);

      const subtitleStreams = metadata.streams?.filter(stream => stream.codec_type === 'subtitle') || [];
      
      if (subtitleStreams.length === 0) {
        showError(ERROR_MESSAGES.SUBTITLE.NO_TRACKS);
        return;
      }

      await cleanupFFmpegFiles();

      // Process file
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
          // Generate unique filename
          let { filename: outputFilename } = generateSubtitleFilename(
            file.name, stream.language, stream.forced, stream.codec_name
          );

          if (usedFilenames.has(outputFilename)) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            outputFilename = outputFilename.replace(nameWithoutExt, `${nameWithoutExt}.${streamIndex}`);
          }
          usedFilenames.add(outputFilename);

          // Extract subtitle
          try {
            const outputFormat = outputFilename.endsWith('.vtt') ? 'webvtt' : 'srt';
            await ffmpegRef.current.exec([
              '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
              '-map', `0:${streamIndex}`,
              '-c:s', outputFormat,
              outputFilename
            ]);
          } catch (extractError) {
            // SRT fallback
            const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
            await ffmpegRef.current.exec([
              '-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT,
              '-map', `0:${streamIndex}`,
              '-c:s', 'srt',
              srtFilename
            ]);
            outputFilename = srtFilename;
          }

          // Read extracted data
          const subtitleData = await ffmpegRef.current.readFile(outputFilename);
          
          if (subtitleData.length > 0) {
            const dataAsUint8Array = subtitleData instanceof Uint8Array ? 
              subtitleData : new TextEncoder().encode(subtitleData as string);
            
            extractedFiles.push({ filename: outputFilename, data: dataAsUint8Array });
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
  }, [isLoaded, metadata, showProgress, hideProgress, showError, cleanupFFmpegFiles]);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    hideError();
    setMetadata(null);
    setSelectedFile(null);

    if (!isLoaded) {
      showProgress('Waiting for FFmpeg to load...');
      return;
    }

    await extractMetadata(file);
  }, [extractMetadata, hideError, isLoaded, showProgress]);

  // Initialize FFmpeg
  useEffect(() => {
    const initializeFFmpeg = async () => {
      const ffmpeg = ffmpegRef.current;
      
      if (ffmpeg.loaded) {
        setIsLoaded(true);
        return;
      }

      try {
        // Use the same pattern as the original working hook
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
            errorMessage = 'Failed to load FFmpeg: CORS error. Please try refreshing the page.';
          } else {
            errorMessage = `Failed to load FFmpeg: ${err.message}`;
          }
        }
        
        showError(errorMessage);
      }
    };

    initializeFFmpeg();
  }, [showError]);

  return {
    metadata,
    progress,
    error,
    handleFileSelect,
    extractSubtitle,
    extractAllSubtitles,
    hideError,
    hideProgress,
    isLoaded,
    selectedFile,
    currentMethod
  };
};