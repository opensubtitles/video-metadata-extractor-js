/**
 * Utility functions for video metadata extraction and subtitle processing
 * Now using centralized utilities to eliminate duplication
 */

import { 
  getFormatFromFileName,
  generateSubtitleFilename,
  safeDecodePreview,
  validateFile
} from '../utils/common';
import { createFileProcessor } from '../utils/fileProcessor';
import { SUPPORTED_FORMATS } from '../constants';

// Re-export centralized utilities for backward compatibility
export { getFormatFromFileName, generateSubtitleFilename, safeDecodePreview };

/**
 * Create complete file data using memory-safe chunked processing
 * Now uses the centralized FileProcessor for consistency
 */
export const createCompleteFileDataInChunks = async (
  file: File,
  onProgress?: (progress: number, text: string) => void
): Promise<Blob> => {
  const processor = createFileProcessor(true);
  return processor.createCompleteFileData(file, onProgress);
};

/**
 * Handle large file downloads with automatic chunking
 * Now uses the centralized FileProcessor for consistency
 */
export const downloadLargeFile = (
  data: Uint8Array, 
  filename: string, 
  progressCallback?: (progress: number) => void
): void => {
  const processor = createFileProcessor(true);
  processor.downloadLargeFile(data, filename, progressCallback);
};

/**
 * Validate file extension against supported formats
 * Now uses centralized constants and validation logic
 */
export const validateFileExtension = (filename: string): { isValid: boolean; extension: string } => {
  const validation = validateFile({ name: filename, size: 1 } as File);
  return {
    isValid: validation.isValid && validation.errors.length === 0,
    extension: validation.extension
  };
};

/**
 * Check if format is supported for video processing  
 */
export const isSupportedFormat = (extension: string): boolean => {
  return SUPPORTED_FORMATS.ALL.includes(extension.toLowerCase() as any);
};

/**
 * Get all supported video formats
 */
export const getSupportedVideoFormats = (): readonly string[] => {
  return SUPPORTED_FORMATS.VIDEO;
};

/**
 * Get all supported audio formats
 */
export const getSupportedAudioFormats = (): readonly string[] => {
  return SUPPORTED_FORMATS.AUDIO;
};

/**
 * Get all supported formats (video + audio)
 */
export const getAllSupportedFormats = (): readonly string[] => {
  return SUPPORTED_FORMATS.ALL;
};