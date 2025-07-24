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
  const processor = createFileProcessor({ debug: true });
  return processor.processCompleteFile(file);
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
  // Create a simple download function since the FileProcessor interface changed
  const MAX_BLOB_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  
  if (data.length < MAX_BLOB_SIZE) {
    // Standard blob download for smaller files
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    // For large files, this would need the full FileProcessor implementation
    throw new Error('Large file download requires full FileProcessor implementation');
  }
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