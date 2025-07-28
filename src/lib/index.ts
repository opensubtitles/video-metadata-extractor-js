/**
 * @opensubtitles/video-metadata-extractor - NPM Package
 * 
 * A comprehensive video metadata and subtitle extraction library using FFmpeg WASM.
 * Supports metadata extraction, individual subtitle extraction, batch subtitle extraction 
 * with ZIP downloads, and memory-safe processing of files of any size using chunked streaming.
 * 
 * @example
 * ```typescript
 * // Simple API for external projects
 * import { extractMetadata, extractSubtitle, extractAllSubtitles } from '@opensubtitles/video-metadata-extractor';
 * 
 * // Fast metadata detection
 * const metadata = await extractMetadata(file);
 * console.log(`Duration: ${metadata.format.duration}s, Resolution: ${metadata.streams[0].width}x${metadata.streams[0].height}`);
 * 
 * // Extract individual subtitle
 * const subtitle = await extractSubtitle(file, 2, { format: 'srt', quick: true });
 * // subtitle.data contains the subtitle file content
 * 
 * // Extract all subtitles as ZIP
 * const allSubtitles = await extractAllSubtitles(file);
 * // allSubtitles.zipBlob contains ZIP file with all subtitles
 * ```
 * 
 * @example
 * ```typescript
 * // Advanced API with full control
 * import { VideoMetadataExtractor } from '@opensubtitles/video-metadata-extractor';
 * 
 * const extractor = new VideoMetadataExtractor({ debug: true });
 * await extractor.initialize();
 * 
 * const metadata = await extractor.extractMetadata(file);
 * const subtitle = await extractor.extractSubtitle(file, 2, { format: 'srt', quick: true });
 * const batch = await extractor.extractAllSubtitles(file);
 * ```
 */

// Main extractor class
export {
  VideoMetadataExtractor,
  type VideoMetadataExtractorOptions,
  type ExtractionOptions,
  type SubtitleExtractionResult,
  type BatchExtractionResult
} from './VideoMetadataExtractor.js';

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
} from './utils.js';

// Common utilities
export {
  withRetry,
  safeAsync,
  formatFileSize,
  formatDuration,
  validateFile,
  sleep
} from '../utils/common.js';

// File processing utilities
export {
  FileProcessor,
  createFileProcessor,
  isLargeFile,
  isVeryLargeFile,
  getRecommendedProcessingStrategy
} from '../utils/fileProcessor.js';

// Constants
export {
  PROCESSING_CONSTANTS,
  UI_CONSTANTS,
  SUPPORTED_FORMATS,
  LANGUAGE_CODES,
  FFMPEG_CONSTANTS,
  ERROR_MESSAGES
} from '../constants/index.js';

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
} from '../types/index.js';

// Type guards
export {
  isVideoStream,
  isAudioStream,
  isSubtitleStream
} from '../types/index.js';

// React hooks (for React applications)
export { useVideoMetadata } from '../hooks/useVideoMetadata.js';
export { useOptimizedVideoMetadata } from '../hooks/useOptimizedVideoMetadata.js';

// =============================================================================
// SIMPLIFIED API FOR EXTERNAL PROJECTS
// =============================================================================

import { 
  VideoMetadataExtractor,
  type VideoMetadataExtractorOptions,
  type ExtractionOptions,
  type SubtitleExtractionResult,
  type BatchExtractionResult
} from './VideoMetadataExtractor.js';
import type { VideoMetadata } from '../types/index.js';
import { formatFileSize } from '../utils/common.js';

/**
 * Global extractor instance for simplified API
 */
let globalExtractor: VideoMetadataExtractor | null = null;

/**
 * Initialize the global extractor instance
 */
async function initializeExtractor(options: VideoMetadataExtractorOptions = {}): Promise<VideoMetadataExtractor> {
  if (!globalExtractor) {
    globalExtractor = new VideoMetadataExtractor(options);
    await globalExtractor.initialize();
  }
  return globalExtractor;
}

/**
 * Fast metadata detection - simplified API for external projects
 * 
 * @example
 * ```typescript
 * import { extractMetadata } from '@opensubtitles/video-metadata-extractor';
 * 
 * const metadata = await extractMetadata(videoFile);
 * console.log(`Duration: ${metadata.format.duration}s`);
 * console.log(`Resolution: ${metadata.streams[0].width}x${metadata.streams[0].height}`);
 * console.log(`Subtitle tracks: ${metadata.streams.filter(s => s.codec_type === 'subtitle').length}`);
 * ```
 */
export async function extractMetadata(
  file: File,
  options: VideoMetadataExtractorOptions = {}
): Promise<VideoMetadata> {
  const extractor = await initializeExtractor(options);
  return extractor.extractMetadata(file);
}

/**
 * Extract individual subtitle track - simplified API for external projects
 * 
 * @example
 * ```typescript
 * import { extractSubtitle } from '@opensubtitles/video-metadata-extractor';
 * 
 * // Quick extraction (faster, may be incomplete)
 * const subtitle = await extractSubtitle(videoFile, 2, { format: 'srt', quick: true });
 * console.log(`Extracted: ${subtitle.filename} (${subtitle.size} bytes)`);
 * 
 * // Full extraction (slower, complete)
 * const fullSubtitle = await extractSubtitle(videoFile, 2, { format: 'srt', quick: false });
 * 
 * // Save to file or process the data
 * const subtitleText = new TextDecoder().decode(subtitle.data);
 * ```
 */
export async function extractSubtitle(
  file: File,
  streamIndex: number,
  options: ExtractionOptions & VideoMetadataExtractorOptions = {}
): Promise<SubtitleExtractionResult> {
  const { format, quick, timeout, filename, ...extractorOptions } = options;
  const extractor = await initializeExtractor(extractorOptions);
  return extractor.extractSubtitle(file, streamIndex, { format, quick, timeout, filename });
}

/**
 * Extract all subtitle tracks as ZIP - simplified API for external projects
 * 
 * @example
 * ```typescript
 * import { extractAllSubtitles } from '@opensubtitles/video-metadata-extractor';
 * 
 * const result = await extractAllSubtitles(videoFile);
 * console.log(`Extracted ${result.successfulExtractions}/${result.totalStreams} subtitles`);
 * 
 * // Download ZIP file
 * const url = URL.createObjectURL(result.zipBlob);
 * const a = document.createElement('a');
 * a.href = url;
 * a.download = result.zipFilename;
 * a.click();
 * URL.revokeObjectURL(url);
 * 
 * // Or access individual files
 * result.extractedFiles.forEach(file => {
 *   console.log(`${file.filename}: ${file.size} bytes (${file.language})`);
 * });
 * ```
 */
export async function extractAllSubtitles(
  file: File,
  options: VideoMetadataExtractorOptions = {}
): Promise<BatchExtractionResult> {
  const extractor = await initializeExtractor(options);
  return extractor.extractAllSubtitles(file);
}

/**
 * Get metadata with subtitle information - convenient helper for external projects
 * 
 * @example
 * ```typescript
 * import { getVideoInfo } from '@opensubtitles/video-metadata-extractor';
 * 
 * const info = await getVideoInfo(videoFile);
 * console.log(`Video: ${info.resolution} @ ${info.fps}fps`);
 * console.log(`Duration: ${info.duration}`);
 * console.log(`Subtitles: ${info.subtitles.length} tracks`);
 * info.subtitles.forEach((sub, i) => {
 *   console.log(`  ${i}: ${sub.language} (${sub.codec}) ${sub.forced ? '[FORCED]' : ''}`);
 * });
 * ```
 */
export async function getVideoInfo(
  file: File,
  options: VideoMetadataExtractorOptions = {}
): Promise<{
  filename: string;
  size: string;
  duration: string;
  resolution: string;
  fps: string;
  videoCodec: string;
  audioCodec: string;
  subtitles: Array<{
    index: number;
    language?: string;
    codec: string;
    forced?: boolean;
    default?: boolean;
  }>;
  metadata: VideoMetadata;
}> {
  const metadata = await extractMetadata(file, options);
  
  const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
  const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');
  const subtitleStreams = metadata.streams?.filter(s => s.codec_type === 'subtitle') || [];
  
  return {
    filename: metadata.format.filename,
    size: formatFileSize(parseInt(metadata.format.size || '0')),
    duration: `${metadata.format.duration}s`,
    resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : 'unknown',
    fps: metadata.format.fps || 'unknown',
    videoCodec: videoStream?.codec_name || 'unknown',
    audioCodec: audioStream?.codec_name || 'unknown',
    subtitles: subtitleStreams.map(stream => ({
      index: stream.index || 0,
      language: stream.language,
      codec: stream.codec_name || 'unknown',
      forced: stream.forced,
      default: stream.default
    })),
    metadata
  };
}

/**
 * Clean up the global extractor instance
 * Call this when you're done processing videos to free up resources
 */
export async function cleanup(): Promise<void> {
  if (globalExtractor) {
    await globalExtractor.terminate();
    globalExtractor = null;
  }
}