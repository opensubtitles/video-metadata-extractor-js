/**
 * Video processing utilities
 */

import { VideoMetadata } from '../types';

/**
 * Parse video duration to seconds
 */
export function parseDuration(duration: string): number {
  if (!duration) return 0;
  
  const parts = duration.split(':');
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  return parseFloat(duration) || 0;
}

/**
 * Format file size to human readable format
 */
export function formatFileSize(bytes: number | string): string {
  const size = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (size === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(size) / Math.log(k));
  
  return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Parse frame rate to number
 */
export function parseFrameRate(frameRate: string): number {
  if (!frameRate) return 0;
  
  const [num, den] = frameRate.split('/').map(Number);
  return den ? num / den : 0;
}

/**
 * Get video codec information
 */
export function getVideoCodec(metadata: VideoMetadata): {
  codec: string;
  profile?: string;
  level?: string;
} | null {
  const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video');
  
  if (!videoStream) return null;
  
  return {
    codec: videoStream.codec_name || 'unknown',
    profile: videoStream.profile,
    level: videoStream.level?.toString()
  };
}

/**
 * Get audio codec information
 */
export function getAudioCodec(metadata: VideoMetadata): {
  codec: string;
  channels?: number;
  sampleRate?: number;
} | null {
  const audioStream = metadata.streams?.find(stream => stream.codec_type === 'audio');
  
  if (!audioStream) return null;
  
  return {
    codec: audioStream.codec_name || 'unknown',
    channels: audioStream.channels,
    sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate) : undefined
  };
}

/**
 * Get subtitle tracks information
 */
export function getSubtitleTracks(metadata: VideoMetadata): Array<{
  index: number;
  language?: string;
  codec: string;
  title?: string;
  forced?: boolean;
  default?: boolean;
}> {
  const subtitleStreams = metadata.streams?.filter(stream => stream.codec_type === 'subtitle') || [];
  
  return subtitleStreams.map((stream, index) => ({
    index: stream.index !== undefined ? stream.index : index,
    language: stream.language,
    codec: stream.codec_name || 'unknown',
    title: stream.title,
    forced: stream.forced,
    default: stream.default
  }));
}

/**
 * Check if file is a video file based on metadata
 */
export function isVideoFile(metadata: VideoMetadata): boolean {
  return metadata.streams?.some(stream => stream.codec_type === 'video') || false;
}

/**
 * Get video resolution
 */
export function getVideoResolution(metadata: VideoMetadata): {
  width: number;
  height: number;
} | null {
  const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video');
  
  if (!videoStream || !videoStream.width || !videoStream.height) return null;
  
  return {
    width: videoStream.width,
    height: videoStream.height
  };
}