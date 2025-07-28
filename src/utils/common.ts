/**
 * Common utility functions used across the application
 * Centralizes reusable functionality to eliminate duplication
 */

import { PROCESSING_CONSTANTS, LANGUAGE_CODES, SUPPORTED_FORMATS, ERROR_MESSAGES } from '../constants/index.js';
import { Result, FileValidationResult, ProcessingStats } from '../types/index.js';

/**
 * Async retry utility with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = PROCESSING_CONSTANTS.RETRY.MAX_ATTEMPTS,
  baseDelay: number = PROCESSING_CONSTANTS.RETRY.BASE_DELAY
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

/**
 * Safe async operation wrapper that returns Result type
 */
export async function safeAsync<T>(
  operation: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Sleep utility for delays
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Format file size in human-readable format
 * Eliminates duplication across multiple files
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Format duration from seconds to human-readable format
 */
export function formatDuration(seconds: number | string): string {
  const totalSeconds = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  
  if (isNaN(totalSeconds)) return 'Unknown';
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get file format from filename
 */
export function getFormatFromFileName(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension || 'unknown';
}

/**
 * Validate file extension and properties
 */
export function validateFile(file: File): FileValidationResult {
  const errors: string[] = [];
  const extension = getFormatFromFileName(file.name);
  
  // Check file size
  if (file.size === 0) {
    errors.push(ERROR_MESSAGES.FILE.EMPTY);
  }
  
  // Check file format
  if (!SUPPORTED_FORMATS.ALL.includes(extension as any)) {
    errors.push(`${ERROR_MESSAGES.FILE.UNSUPPORTED_FORMAT}: ${extension}`);
  }
  
  return {
    isValid: errors.length === 0,
    extension,
    size: file.size,
    errors
  };
}

/**
 * Generate subtitle filename with language code and metadata
 */
export function generateSubtitleFilename(
  movieFilename: string,
  language?: string,
  isForced?: boolean,
  codecName?: string
): { filename: string; extension: string } {
  // Remove extension from movie filename
  const nameWithoutExt = movieFilename.replace(/\.[^/.]+$/, '');
  
  // Get standardized language code
  const langCode = language 
    ? (LANGUAGE_CODES[language.toLowerCase() as keyof typeof LANGUAGE_CODES] || language.toLowerCase())
    : 'unknown';
  
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
}

/**
 * Safely decode data for preview with proper error handling
 */
export function safeDecodePreview(
  data: Uint8Array | string, 
  maxLength: number = PROCESSING_CONSTANTS.LIMITS.MAX_PROGRESSIVE_CHUNKS
): string {
  try {
    if (typeof data === 'string') {
      return data.slice(0, maxLength);
    }
    
    const previewData = data.slice(0, Math.min(maxLength, data.length));
    return new TextDecoder('utf-8', { fatal: false }).decode(previewData);
  } catch (error) {
    return '[Preview unavailable - encoding error]';
  }
}

/**
 * Create processing statistics tracker
 */
export function createProcessingStats(fileSize: number): ProcessingStats {
  return {
    startTime: Date.now(),
    fileSize,
    chunksProcessed: 0
  };
}

/**
 * Update processing statistics
 */
export function updateProcessingStats(
  stats: ProcessingStats,
  chunksProcessed: number,
  memoryUsed?: number
): ProcessingStats {
  return {
    ...stats,
    chunksProcessed,
    memoryUsed,
    endTime: Date.now()
  };
}

/**
 * Calculate processing duration
 */
export function getProcessingDuration(stats: ProcessingStats): number {
  if (!stats.endTime) return 0;
  return stats.endTime - stats.startTime;
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: any;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone utility for objects
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T;
  if (typeof obj === 'object') {
    const clonedObj = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
  return obj;
}

/**
 * Check if running in browser environment
 */
export const isBrowser = (): boolean => {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
};

/**
 * Check if WebAssembly is supported
 */
export const isWebAssemblySupported = (): boolean => {
  return typeof WebAssembly !== 'undefined';
};

/**
 * Generate unique ID for operations
 */
export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}