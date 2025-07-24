/**
 * Subtitle extraction utilities
 */

import { VideoMetadata } from '../types';

export interface SubtitleTrack {
  index: number;
  language?: string;
  codec: string;
  title?: string;
  forced?: boolean;
  default?: boolean;
  size?: string;
}

export interface SubtitleExtractionOptions {
  format?: 'srt' | 'vtt' | 'ass';
  language?: string;
  includeForced?: boolean;
  includeDefault?: boolean;
}

/**
 * Get all subtitle tracks from metadata
 */
export function getSubtitleTracks(metadata: VideoMetadata): SubtitleTrack[] {
  const subtitleStreams = metadata.streams?.filter(stream => stream.codec_type === 'subtitle') || [];
  
  return subtitleStreams.map((stream) => ({
    index: stream.index !== undefined ? stream.index : 0,
    language: stream.language,
    codec: stream.codec_name || 'unknown',
    title: stream.title,
    forced: stream.forced,
    default: stream.default,
    size: stream.size
  }));
}

/**
 * Filter subtitle tracks by language
 */
export function filterSubtitlesByLanguage(
  tracks: SubtitleTrack[], 
  language: string
): SubtitleTrack[] {
  return tracks.filter(track => 
    track.language === language || 
    track.language === mapLanguageCode(language)
  );
}

/**
 * Filter subtitle tracks by options
 */
export function filterSubtitleTracks(
  tracks: SubtitleTrack[],
  options: SubtitleExtractionOptions
): SubtitleTrack[] {
  let filtered = tracks;

  if (options.language) {
    filtered = filterSubtitlesByLanguage(filtered, options.language);
  }

  if (options.includeForced === false) {
    filtered = filtered.filter(track => !track.forced);
  }

  if (options.includeDefault === false) {
    filtered = filtered.filter(track => !track.default);
  }

  return filtered;
}

/**
 * Generate subtitle filename
 */
export function generateSubtitleFilename(
  videoFilename: string,
  track: SubtitleTrack,
  options: SubtitleExtractionOptions = {}
): string {
  const nameWithoutExt = videoFilename.replace(/\.[^/.]+$/, '');
  const format = options.format || 'srt';
  
  let filename = nameWithoutExt;
  
  if (track.language) {
    filename += `.${track.language}`;
  }
  
  if (track.forced) {
    filename += `.forced`;
  }
  
  if (track.title && track.title !== track.language) {
    filename += `.${track.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
  
  filename += `.${format}`;
  
  return filename;
}

/**
 * Map language codes to standard formats
 */
export function mapLanguageCode(language: string): string {
  const languageMap: { [key: string]: string } = {
    'eng': 'en',
    'english': 'en',
    'fra': 'fr',
    'french': 'fr',
    'deu': 'de',
    'ger': 'de',
    'german': 'de',
    'spa': 'es',
    'spanish': 'es',
    'ita': 'it',
    'italian': 'it',
    'por': 'pt',
    'portuguese': 'pt',
    'rus': 'ru',
    'russian': 'ru',
    'jpn': 'ja',
    'japanese': 'ja',
    'kor': 'ko',
    'korean': 'ko',
    'chi': 'zh',
    'chinese': 'zh',
    'ara': 'ar',
    'arabic': 'ar',
    'hin': 'hi',
    'hindi': 'hi'
  };

  return languageMap[language.toLowerCase()] || language.toLowerCase();
}

/**
 * Get default subtitle format based on codec
 */
export function getDefaultSubtitleFormat(codec: string): 'srt' | 'vtt' | 'ass' {
  const codecFormatMap: { [key: string]: 'srt' | 'vtt' | 'ass' } = {
    'subrip': 'srt',
    'srt': 'srt',
    'webvtt': 'vtt',
    'vtt': 'vtt',
    'ass': 'ass',
    'ssa': 'ass',
    'pgs': 'srt', // Convert PGS to SRT
    'dvd_subtitle': 'srt', // Convert DVD subtitles to SRT
    'dvdsub': 'srt'
  };

  return codecFormatMap[codec.toLowerCase()] || 'srt';
}

/**
 * Validate subtitle data
 */
export function validateSubtitleData(data: Uint8Array, format: string): boolean {
  if (data.length === 0) return false;

  const text = new TextDecoder().decode(data.slice(0, Math.min(1000, data.length)));

  switch (format.toLowerCase()) {
    case 'srt':
      return /^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/m.test(text);
    case 'vtt':
      return text.startsWith('WEBVTT') || /^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/m.test(text);
    case 'ass':
      return text.includes('[Script Info]') || text.includes('[V4+ Styles]');
    default:
      return true; // Assume valid for unknown formats
  }
}

/**
 * Convert subtitle format (basic conversion)
 */
export function convertSubtitleFormat(
  data: Uint8Array, 
  fromFormat: string, 
  toFormat: string
): Uint8Array {
  if (fromFormat === toFormat) return data;

  // This is a simplified conversion - in a real implementation,
  // you would use FFmpeg or a dedicated subtitle conversion library
  const text = new TextDecoder().decode(data);
  
  // Basic SRT to VTT conversion
  if (fromFormat === 'srt' && toFormat === 'vtt') {
    const vttText = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return new TextEncoder().encode(vttText);
  }

  // For other conversions, return original data
  return data;
}