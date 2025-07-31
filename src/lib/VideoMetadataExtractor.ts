/**
 * Comprehensive VideoMetadataExtractor class for programmatic use
 * Supports metadata extraction, individual and batch subtitle extraction with ZIP downloads,
 * and memory-safe processing of files of any size using chunked streaming
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import JSZip from 'jszip';

import { 
  VideoMetadata, 
  ProgressState, 
  ErrorState, 
  FFmpegError, 
  FileProcessingError,
  SubtitleStream,
  VideoStream,
  AudioStream
} from '../types/index.js';
import { 
  generateSubtitleFilename, 
  safeDecodePreview, 
  createCompleteFileDataInChunks,
  downloadLargeFile,
  getFormatFromFileName 
} from './utils.js';

// Helper function to get file extension
const getFileExtension = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension || 'mkv'; // Default to mkv if no extension
};
import { 
  PROCESSING_CONSTANTS,
  FFMPEG_CONSTANTS,
  ERROR_MESSAGES,
  SUPPORTED_FORMATS
} from '../constants/index.js';
import { 
  withRetry,
  validateFile,
  sleep
} from '../utils/common.js';

export interface VideoMetadataExtractorOptions {
  /** Custom FFmpeg core URL */
  ffmpegCoreURL?: string;
  /** Custom FFmpeg WASM URL */
  ffmpegWasmURL?: string;
  /** Progress callback */
  onProgress?: (progress: ProgressState) => void;
  /** Error callback */
  onError?: (error: ErrorState) => void;
  /** Enable debug logging */
  debug?: boolean;
  /** Timeout for FFmpeg operations in milliseconds */
  timeout?: number;
  /** Chunk size for large file processing in bytes */
  chunkSize?: number;
}

export interface ExtractionOptions {
  /** Output format for subtitle extraction */
  format?: 'srt' | 'ass' | 'vtt' | 'webvtt';
  /** Whether to use quick extraction (faster but may be incomplete) */
  quick?: boolean;
  /** Timeout for extraction operation in milliseconds */
  timeout?: number;
  /** Custom filename for the extracted subtitle */
  filename?: string;
}

export interface SubtitleExtractionResult {
  /** The extracted subtitle data */
  data: Uint8Array;
  /** Generated filename for the subtitle */
  filename: string;
  /** File extension used */
  extension: string;
  /** Size of extracted data in bytes */
  size: number;
  /** Preview of the subtitle content */
  preview: string;
}

export interface BatchExtractionResult {
  /** Array of successfully extracted subtitle files */
  extractedFiles: Array<{
    filename: string;
    data: Uint8Array;
    size: number;
    language?: string;
    forced?: boolean;
    streamIndex: number;
  }>;
  /** ZIP file containing all extracted subtitles */
  zipBlob: Blob;
  /** Filename for the ZIP file */
  zipFilename: string;
  /** Total number of subtitle streams found */
  totalStreams: number;
  /** Number of successfully extracted streams */
  successfulExtractions: number;
}

export class VideoMetadataExtractor {
  private ffmpeg: FFmpeg;
  private isLoaded: boolean = false;
  private options: Required<VideoMetadataExtractorOptions>;

  constructor(options: VideoMetadataExtractorOptions = {}) {
    this.options = {
      ffmpegCoreURL: options.ffmpegCoreURL || FFMPEG_CONSTANTS.CORE_URLS.CORE_JS,
      ffmpegWasmURL: options.ffmpegWasmURL || FFMPEG_CONSTANTS.CORE_URLS.WASM,
      onProgress: options.onProgress || (() => {}),
      onError: options.onError || (() => {}),
      debug: options.debug ?? false,
      timeout: options.timeout ?? PROCESSING_CONSTANTS.TIMEOUTS.FFMPEG_EXECUTION,
      chunkSize: options.chunkSize ?? PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE
    };
    
    this.ffmpeg = new FFmpeg();
    
    // Set up event handlers
    if (this.options.debug) {
      this.ffmpeg.on('log', ({ message }) => {
        console.log('[VideoMetadataExtractor FFmpeg]', message);
      });
    }
    
    this.ffmpeg.on('progress', ({ progress }) => {
      this.options.onProgress({
        isVisible: true,
        progress: Math.round(progress * 100),
        text: `Processing... ${Math.round(progress * 100)}%`
      });
    });
  }

  /**
   * Initialize FFmpeg
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      if (this.options.debug) {
        console.log('[VideoMetadataExtractor] Initializing FFmpeg...');
      }

      const coreURL = this.options.ffmpegCoreURL;
      const wasmURL = this.options.ffmpegWasmURL;

      await this.ffmpeg.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
      });

      this.isLoaded = true;
      
      if (this.options.debug) {
        console.log('[VideoMetadataExtractor] FFmpeg initialized successfully');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize FFmpeg';
      this.options.onError({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to initialize FFmpeg: ${errorMessage}`);
    }
  }

  /**
   * Extract comprehensive metadata from video file with memory-safe chunked processing
   */
  async extractMetadata(file: File): Promise<VideoMetadata> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    // Validate file using centralized validation
    const validation = validateFile(file);
    if (!validation.isValid) {
      const error = validation.errors.join('; ');
      this.options.onError({
        isVisible: true,
        message: error
      });
      throw new FileProcessingError(error, file.name, file.size);
    }

    try {
      if (this.options.debug) {
        console.log(`[VideoMetadataExtractor] Extracting metadata for: ${file.name} (${Math.round(file.size / 1024 / 1024)}MB)`);
      }

      this.options.onProgress({
        isVisible: true,
        progress: 10,
        text: 'Processing video...'
      });

      // Clean up any existing files
      await this.cleanupFFmpegFiles();

      // Process file using chunked strategy
      const fileData = await createCompleteFileDataInChunks(file);

      this.options.onProgress({
        isVisible: true,
        progress: 40,
        text: 'Loading file into FFmpeg...'
      });

      // Write file to FFmpeg virtual filesystem with timeout
      const writePromise = this.ffmpeg.writeFile(FFMPEG_CONSTANTS.TEMP_FILES.INPUT, await fetchFile(fileData));
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new FFmpegError(ERROR_MESSAGES.FFMPEG.TIMEOUT, 'file_write')), PROCESSING_CONSTANTS.TIMEOUTS.FILE_WRITE);
      });

      await Promise.race([writePromise, timeoutPromise]);

      this.options.onProgress({
        isVisible: true,
        progress: 60,
        text: 'Extracting metadata...'
      });

      // Capture FFmpeg log output to parse metadata
      const ffmpegLogs: string[] = [];
      const logHandler = ({ message }: { message: string }) => {
        ffmpegLogs.push(message);
      };

      this.ffmpeg.on('log', logHandler);

      try {
        // Use -i command to get metadata info
        const execPromise = this.ffmpeg.exec(['-i', FFMPEG_CONSTANTS.TEMP_FILES.INPUT]);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new FFmpegError(ERROR_MESSAGES.FFMPEG.TIMEOUT, 'metadata_extraction')), this.options.timeout);
        });

        await Promise.race([execPromise, timeoutPromise]);
      } catch (ffmpegError) {
        // Expected error for info extraction - FFmpeg always "fails" with -i command
      }

      this.ffmpeg.off('log', logHandler);

      if (ffmpegLogs.length === 0) {
        throw new Error('FFmpeg did not produce any output. The file might be corrupted or unsupported.');
      }

      this.options.onProgress({
        isVisible: true,
        progress: 90,
        text: 'Parsing metadata...'
      });

      // Parse metadata from logs
      const metadata = this.parseMetadataFromLogs(ffmpegLogs.join('\n'), file);

      await this.cleanupFFmpegFiles();

      this.options.onProgress({
        isVisible: true,
        progress: 100,
        text: 'Metadata extraction completed!'
      });

      return metadata;

    } catch (error) {
      await this.cleanupFFmpegFiles();
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract metadata';
      this.options.onError({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to extract metadata: ${errorMessage}`);
    }
  }

  /**
   * Extract single subtitle track with comprehensive options
   */
  async extractSubtitle(
    file: File, 
    streamIndex: number, 
    options: ExtractionOptions = {}
  ): Promise<SubtitleExtractionResult> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    const { format = 'srt', quick = false, timeout = this.options.timeout, filename } = options;

    try {
      if (this.options.debug) {
        console.log(`[VideoMetadataExtractor] Extracting subtitle stream ${streamIndex} (${quick ? 'quick' : 'full'} mode)`);
      }

      this.options.onProgress({
        isVisible: true,
        progress: 10,
        text: `Preparing ${quick ? 'quick' : 'full'} subtitle extraction...`
      });

      await this.cleanupFFmpegFiles();

      // Process file - use quick mode for faster processing or full mode for complete extraction
      const fileData = quick ? file : await createCompleteFileDataInChunks(file);
      
      this.options.onProgress({
        isVisible: true,
        progress: 30,
        text: 'Loading file for subtitle extraction...'
      });

      await this.ffmpeg.writeFile('input.video', await fetchFile(fileData));

      // Determine output format and filename
      const outputFormat = format === 'vtt' ? 'webvtt' : format;
      const outputFilename = `subtitle_${streamIndex}.${format}`;

      this.options.onProgress({
        isVisible: true,
        progress: 60,
        text: `Extracting subtitle (${format} format)...`
      });

      // Extract subtitle with comprehensive parameters for full mode
      const ffmpegArgs = [
        '-i', 'input.video',
        '-map', `0:${streamIndex}`,
        '-c:s', outputFormat,
        ...(quick ? [] : [
          '-avoid_negative_ts', 'make_zero',
          '-fix_sub_duration',
          '-copyts',
          '-start_at_zero'
        ]),
        outputFilename
      ];

      try {
        const extractPromise = this.ffmpeg.exec(ffmpegArgs);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Subtitle extraction timeout')), timeout);
        });

        await Promise.race([extractPromise, timeoutPromise]);
      } catch (extractError) {
        // Try SRT fallback if original format fails
        if (format !== 'srt') {
          if (this.options.debug) {
            console.log(`[VideoMetadataExtractor] Primary extraction failed, trying SRT fallback`);
          }

          const srtFilename = outputFilename.replace(/\.[^/.]+$/, '.srt');
          await this.ffmpeg.exec([
            '-i', 'input.video',
            '-map', `0:${streamIndex}`,
            '-c:s', 'srt',
            ...(quick ? [] : ['-avoid_negative_ts', 'make_zero', '-fix_sub_duration']),
            srtFilename
          ]);
        } else {
          throw extractError;
        }
      }

      this.options.onProgress({
        isVisible: true,
        progress: 80,
        text: 'Preparing subtitle download...'
      });

      // Read extracted subtitle data
      const subtitleData = await this.ffmpeg.readFile(outputFilename);
      const dataArray = subtitleData instanceof Uint8Array ? subtitleData : new Uint8Array(subtitleData as unknown as ArrayBuffer);

      // Generate appropriate filename
      const generatedFilename = filename || generateSubtitleFilename(file.name, undefined, false, format).filename;
      const finalFilename = quick ? generatedFilename.replace(/(\.[^.]+)$/, '.quick$1') : generatedFilename.replace(/(\.[^.]+)$/, '.full$1');

      const result: SubtitleExtractionResult = {
        data: dataArray,
        filename: finalFilename,
        extension: format,
        size: dataArray.length,
        preview: safeDecodePreview(dataArray, 200)
      };

      await this.cleanupFFmpegFiles();

      this.options.onProgress({
        isVisible: true,
        progress: 100,
        text: `${quick ? 'Quick' : 'Full'} subtitle extraction completed!`
      });

      return result;

    } catch (error) {
      await this.cleanupFFmpegFiles();
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract subtitle';
      this.options.onError({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to extract subtitle: ${errorMessage}`);
    }
  }

  /**
   * Extract all subtitle tracks as ZIP
   */
  async extractAllSubtitles(file: File): Promise<BatchExtractionResult> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    try {
      // First get metadata to find subtitle streams
      const metadata = await this.extractMetadata(file);
      const subtitleStreams = metadata.streams?.filter(stream => stream.codec_type === 'subtitle') || [];
      
      if (subtitleStreams.length === 0) {
        throw new Error('No subtitle tracks found in this file');
      }

      console.log(`[EXTRACT ALL] Found ${subtitleStreams.length} subtitle streams, extracting all in single operation`);
      await this.cleanupFFmpegFiles();

      // Load the file data once (using optimized chunked processing)
      const fileBlob = await createCompleteFileDataInChunks(file);
      const fileData = new Uint8Array(await fileBlob.arrayBuffer());
      const inputFilename = `input.${getFileExtension(file.name)}`;
      await this.ffmpeg.writeFile(inputFilename, fileData);

      const zip = new JSZip();
      const extractedFiles: Array<{
        filename: string;
        data: Uint8Array;
        size: number;
        language?: string;
        forced?: boolean;
        streamIndex: number;
      }> = [];

      // Build single FFmpeg command to extract all subtitles at once
      const outputFiles: Array<{ filename: string; streamIndex: number; stream: any }> = [];
      const ffmpegArgs = ['-i', inputFilename];

      for (let i = 0; i < subtitleStreams.length; i++) {
        const stream = subtitleStreams[i];
        const streamIndex = stream.index !== undefined ? stream.index : i;
        
        // Generate filename with language and track info
        let filename = `video`;
        if (stream.language) filename += `.${stream.language}`;
        if (subtitleStreams.filter(s => s.language === stream.language).length > 1) {
          filename += `.${streamIndex}`;
        }
        filename += '.srt';
        
        outputFiles.push({ filename, streamIndex, stream });
        
        // Add mapping for this subtitle stream to SRT format
        ffmpegArgs.push('-map', `0:${streamIndex}`, '-c:s', 'srt', `${filename}`);
      }

      console.log(`[EXTRACT ALL] Running single FFmpeg command for ${subtitleStreams.length} streams:`, ffmpegArgs.join(' '));
      
      // Execute single FFmpeg operation for all subtitles
      let successfulExtractions = 0;
      try {
        await this.ffmpeg.exec(ffmpegArgs);
        
        // Read all extracted files
        for (const { filename, streamIndex, stream } of outputFiles) {
          try {
            const data = await this.ffmpeg.readFile(filename) as Uint8Array;
            
            if (data.length > 0) {
              extractedFiles.push({
                filename: filename,
                data: data,
                size: data.length,
                language: stream.language,
                forced: stream.forced,
                streamIndex: streamIndex
              });
              
              zip.file(filename, data);
              successfulExtractions++;
              console.log(`[EXTRACT ALL] Successfully extracted ${filename} (${data.length} bytes)`);
            } else {
              console.warn(`[EXTRACT ALL] Empty subtitle file for stream ${streamIndex}`);
            }
          } catch (readError) {
            console.warn(`[EXTRACT ALL] Failed to read subtitle file ${filename}:`, readError);
            // Continue with other streams
          }
        }
        
      } catch (ffmpegError) {
        console.error(`[EXTRACT ALL] FFmpeg batch extraction failed:`, ffmpegError);
        
        // Fallback to individual extraction if batch fails
        console.log(`[EXTRACT ALL] Falling back to individual extraction`);
        for (let i = 0; i < subtitleStreams.length; i++) {
          const stream = subtitleStreams[i];
          const streamIndex = stream.index !== undefined ? stream.index : i;
          
          try {
            const subtitleResult = await this.extractSubtitle(file, streamIndex, { format: 'srt' });
            
            // Generate filename with language and track info
            let filename = `video`;
            if (stream.language) filename += `.${stream.language}`;
            if (subtitleStreams.filter(s => s.language === stream.language).length > 1) {
              filename += `.${streamIndex}`;
            }
            filename += `.srt`;
            
            extractedFiles.push({
              filename: filename,
              data: subtitleResult.data,
              size: subtitleResult.size,
              language: stream.language,
              forced: stream.forced,
              streamIndex: streamIndex
            });
            
            zip.file(filename, subtitleResult.data);
            successfulExtractions++;
          } catch (streamError) {
            console.warn(`Failed to extract subtitle stream ${streamIndex}:`, streamError);
            // Continue with other streams
          }
        }
      }

      if (extractedFiles.length === 0) {
        throw new Error('No subtitle data could be extracted from any tracks');
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFilename = file.name.replace(/\.[^/.]+$/, '_subtitles.zip');

      const result: BatchExtractionResult = {
        extractedFiles,
        zipBlob,
        zipFilename,
        totalStreams: subtitleStreams.length,
        successfulExtractions
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract all subtitles';
      this.options.onError({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to extract all subtitles: ${errorMessage}`);
    }
  }

  /**
   * Download a file (handles large files automatically)
   */
  downloadFile(data: Uint8Array, filename: string): void {
    downloadLargeFile(data, filename);
  }

  /**
   * Download ZIP file
   */
  downloadZip(zipBlob: Blob, filename: string): void {
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Check if the extractor is initialized
   */
  isInitialized(): boolean {
    return this.isLoaded;
  }

  /**
   * Get supported file formats
   */
  getSupportedFormats(): readonly string[] {
    return SUPPORTED_FORMATS.ALL;
  }

  /**
   * Clean up FFmpeg temporary files using centralized constants and retry logic
   */
  private async cleanupFFmpegFiles(): Promise<void> {
    if (!this.ffmpeg) return;

    try {
      await sleep(PROCESSING_CONSTANTS.TIMEOUTS.CLEANUP);

      // Clean up known temporary files with retry logic
      const tempFiles = Object.values(FFMPEG_CONSTANTS.TEMP_FILES);
      for (const fileName of tempFiles) {
        await withRetry(
          () => this.ffmpeg.deleteFile(fileName),
          PROCESSING_CONSTANTS.RETRY.MAX_ATTEMPTS,
          PROCESSING_CONSTANTS.RETRY.BASE_DELAY
        ).catch(() => {
          // Ignore cleanup errors for individual files
        });
      }

      // Clean up any remaining files
      try {
        const files = await this.ffmpeg.listDir('/');

        for (const fileInfo of files) {
          const fileName = typeof fileInfo === 'string' ? fileInfo : fileInfo.name;
          const isDir = typeof fileInfo === 'object' && fileInfo.isDir;

          if (!FFMPEG_CONSTANTS.SYSTEM_DIRS.has(fileName) && !isDir) {
            await withRetry(
              () => this.ffmpeg.deleteFile(fileName),
              PROCESSING_CONSTANTS.RETRY.MAX_ATTEMPTS,
              PROCESSING_CONSTANTS.RETRY.BASE_DELAY
            ).catch(() => {
              // Ignore cleanup errors for individual files
            });
          }
        }
      } catch (listError) {
        // Continue on error
      }

      await sleep(300); // Final delay to ensure cleanup is complete

    } catch (cleanupError) {
      // Continue on error - cleanup failures shouldn't stop the main operation
    }
  }

  /**
   * Parse metadata from FFmpeg logs
   */
  private parseMetadataFromLogs(logOutput: string, file: File): VideoMetadata {
    // Check for errors
    if (logOutput.includes('Invalid data found when processing input') || 
        logOutput.includes('No such file or directory') ||
        logOutput.includes('Operation not permitted')) {
      throw new Error(`File "${file.name}" appears to be corrupted or not a valid media file`);
    }

    if (!logOutput.includes('Stream #')) {
      throw new Error('No audio or video streams found in the file. The file might be corrupted or encrypted.');
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
        const streamIndex = streamMatch ? parseInt(streamMatch[1]) : undefined;

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
          index: streamIndex || 0
        });
      });
    }

    // Create metadata structure with proper discriminated union types
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

    const metadata: VideoMetadata = {
      format: {
        filename: file.name,
        size: file.size.toString(),
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
        ...subtitleStreams
      ]
    };

    return metadata;
  }

  /**
   * Clean up resources and terminate FFmpeg
   */
  async terminate(): Promise<void> {
    if (this.isLoaded) {
      await this.cleanupFFmpegFiles();
      await this.ffmpeg.terminate();
      this.isLoaded = false;
      
      if (this.options.debug) {
        console.log('[VideoMetadataExtractor] FFmpeg terminated and resources cleaned up');
      }
    }
  }
}