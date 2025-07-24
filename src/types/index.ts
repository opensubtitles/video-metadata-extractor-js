/**
 * Improved type definitions with discriminated unions and strong typing
 */

/**
 * Stream type discriminator
 */
export type StreamType = 'video' | 'audio' | 'subtitle';

/**
 * Base stream interface with common properties
 */
interface BaseStream {
  codec_type: StreamType;
  codec_name: string;
  index: number;
  duration?: string;
  codec_tag?: string;
  codec_tag_string?: string;
  codec_long_name?: string;
  profile?: string;
}

/**
 * Video stream with video-specific properties
 */
export interface VideoStream extends BaseStream {
  codec_type: 'video';
  width: number;
  height: number;
  r_frame_rate: string;
  avg_frame_rate?: string;
  pix_fmt: string;
  bit_rate: string;
  nb_frames?: string;
  level?: string;
}

/**
 * Audio stream with audio-specific properties
 */
export interface AudioStream extends BaseStream {
  codec_type: 'audio';
  sample_rate: string;
  channels: number;
  channel_layout?: string;
  bit_rate: string;
}

/**
 * Subtitle stream with subtitle-specific properties
 */
export interface SubtitleStream extends BaseStream {
  codec_type: 'subtitle';
  language?: string;
  title?: string;
  forced?: boolean;
  default?: boolean;
  size?: string;
}

/**
 * Union type for all stream types
 */
export type MediaStream = VideoStream | AudioStream | SubtitleStream;

/**
 * Format information for the video file
 */
export interface FormatInfo {
  filename: string;
  format_name: string;
  duration: string;
  size: string;
  bit_rate: string;
  fps: string;
  movietimems: string;
  movieframes: string;
}

/**
 * Complete video metadata structure with strongly typed streams
 */
export interface VideoMetadata {
  format: FormatInfo;
  streams: MediaStream[];
}

export interface ProgressState {
  isVisible: boolean;
  progress: number;
  text: string;
}

export interface ErrorState {
  isVisible: boolean;
  message: string;
}

/**
 * Processing strategy types
 */
export type MP4ProcessingStrategy = 
  | 'chunks-32mb-dual'     // Default: 32MB from start + 32MB from end
  | 'whole-file'           // Read entire file
  | 'chunked-streaming';   // Memory-safe chunked processing

/**
 * Error types for better error handling
 */
export class FFmpegError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'FFmpegError';
  }
}

export class FileProcessingError extends Error {
  constructor(
    message: string,
    public readonly filename: string,
    public readonly fileSize?: number
  ) {
    super(message);
    this.name = 'FileProcessingError';
  }
}

export class SubtitleExtractionError extends Error {
  constructor(
    message: string,
    public readonly streamIndex: number,
    public readonly format?: string
  ) {
    super(message);
    this.name = 'SubtitleExtractionError';
  }
}

/**
 * Result type for better error handling
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Processing options interfaces
 */
export interface ProcessingOptions {
  timeout?: number;
  retryAttempts?: number;
  chunkSize?: number;
  debug?: boolean;
}

export interface SubtitleExtractionOptions extends ProcessingOptions {
  format?: 'srt' | 'ass' | 'vtt' | 'webvtt';
  quick?: boolean;
  filename?: string;
}

export interface BatchExtractionOptions extends ProcessingOptions {
  includeForced?: boolean;
  preferredLanguages?: string[];
}

/**
 * File validation result
 */
export interface FileValidationResult {
  isValid: boolean;
  extension: string;
  size: number;
  errors: string[];
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
  startTime: number;
  endTime?: number;
  fileSize: number;
  chunksProcessed: number;
  memoryUsed?: number;
}

/**
 * Type guards for stream types
 */
export const isVideoStream = (stream: MediaStream): stream is VideoStream => {
  return stream.codec_type === 'video';
};

export const isAudioStream = (stream: MediaStream): stream is AudioStream => {
  return stream.codec_type === 'audio';
};

export const isSubtitleStream = (stream: MediaStream): stream is SubtitleStream => {
  return stream.codec_type === 'subtitle';
};