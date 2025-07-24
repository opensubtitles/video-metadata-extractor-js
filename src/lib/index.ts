/**
 * @opensubtitles/video-metadata-extractor - NPM Package
 * 
 * A comprehensive video metadata and subtitle extraction library using FFmpeg WASM.
 * Supports metadata extraction, individual subtitle extraction, batch subtitle extraction 
 * with ZIP downloads, and memory-safe processing of files of any size using chunked streaming.
 * 
 * @example
 * ```typescript
 * import { VideoMetadataExtractor } from '@opensubtitles/video-metadata-extractor';
 * 
 * const extractor = new VideoMetadataExtractor({ debug: true });
 * await extractor.initialize();
 * 
 * // Extract metadata
 * const metadata = await extractor.extractMetadata(file);
 * 
 * // Extract individual subtitle
 * const subtitle = await extractor.extractSubtitle(file, 2, { format: 'srt', quick: true });
 * 
 * // Extract all subtitles as ZIP
 * const batch = await extractor.extractAllSubtitles(file);
 * extractor.downloadZip(batch.zipBlob, batch.zipFilename);
 * ```
 */

// Main extractor class
export {
  VideoMetadataExtractor,
  type VideoMetadataExtractorOptions,
  type ExtractionOptions,
  type SubtitleExtractionResult,
  type BatchExtractionResult
} from './VideoMetadataExtractor';

// Utility functions
export {
  generateSubtitleFilename,
  safeDecodePreview,
  downloadLargeFile,
  createCompleteFileDataInChunks,
  validateFileExtension,
  getFormatFromFileName,
  isSupportedFormat,
  getSupportedVideoFormats,
  getSupportedAudioFormats,
  getAllSupportedFormats
} from './utils';

// Common utilities
export {
  withRetry,
  safeAsync,
  formatFileSize,
  formatDuration,
  validateFile,
  sleep
} from '../utils/common';

// File processing utilities
export {
  FileProcessor,
  createFileProcessor,
  isLargeFile,
  isVeryLargeFile,
  getRecommendedProcessingStrategy
} from '../utils/fileProcessor';

// Constants
export {
  PROCESSING_CONSTANTS,
  UI_CONSTANTS,
  SUPPORTED_FORMATS,
  LANGUAGE_CODES,
  FFMPEG_CONSTANTS,
  ERROR_MESSAGES
} from '../constants';

// Types from the main application
export type {
  VideoMetadata,
  ProgressState,
  ErrorState,
  MediaStream,
  VideoStream,
  AudioStream,
  SubtitleStream,
  FormatInfo,
  StreamType,
  FFmpegError,
  FileProcessingError,
  SubtitleExtractionError,
  Result,
  ProcessingOptions,
  SubtitleExtractionOptions,
  BatchExtractionOptions,
  FileValidationResult,
  ProcessingStats
} from '../types';

// Type guards
export {
  isVideoStream,
  isAudioStream,
  isSubtitleStream
} from '../types';

// React hook (for React applications)
export { useVideoMetadata } from '../hooks/useVideoMetadata';