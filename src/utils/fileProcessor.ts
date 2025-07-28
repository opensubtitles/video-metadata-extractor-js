/**
 * File processing utilities with memory-safe chunked operations
 * Centralizes file handling logic to eliminate duplication
 */

import { PROCESSING_CONSTANTS, UI_CONSTANTS } from '../constants/index.js';
import { ProcessingStats } from '../types/index.js';
import { createProcessingStats, updateProcessingStats, sleep } from './common.js';

/**
 * File processor class for handling large files with chunked processing
 */
export class FileProcessor {
  private stats: ProcessingStats;
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.debug = debug;
    this.stats = createProcessingStats(0);
  }

  /**
   * Process file in chunks with memory-safe streaming
   */
  async processInChunks<T>(
    file: File,
    chunkProcessor: (chunk: Blob, index: number, total: number) => Promise<T>,
    options: {
      chunkSize?: number;
      onProgress?: (progress: number, text: string) => void;
    } = {}
  ): Promise<T[]> {
    const chunkSize = options.chunkSize || PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE;
    const fileSize = file.size;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    this.stats = createProcessingStats(fileSize);
    
    if (this.debug) {
      console.log(`[FileProcessor] Processing ${Math.round(fileSize / 1024 / 1024)}MB file in ${totalChunks} chunks`);
    }

    const results: T[] = [];

    for (let offset = 0; offset < fileSize; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, fileSize);
      const chunk = file.slice(offset, end);
      const chunkIndex = Math.floor(offset / chunkSize);
      
      const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
      const chunkSizeMB = Math.round((end - offset) / 1024 / 1024);
      
      if (options.onProgress) {
        options.onProgress(
          progress,
          `Processing chunk ${chunkIndex + 1}/${totalChunks} (${chunkSizeMB}MB)...`
        );
      }

      try {
        const result = await chunkProcessor(chunk, chunkIndex, totalChunks);
        results.push(result);
        
        this.stats = updateProcessingStats(this.stats, chunkIndex + 1);
        
        if (this.debug) {
          console.log(`[FileProcessor] Completed chunk ${chunkIndex + 1}/${totalChunks}`);
        }

        // Add small delay to prevent UI blocking for large files
        if (chunkIndex % UI_CONSTANTS.BATCH_PROCESSING.PROGRESS_UPDATE_FREQUENCY === 0) {
          await sleep(UI_CONSTANTS.DELAYS.CHUNK_UI_DELAY);
        }
      } catch (error) {
        throw new Error(`Failed to process chunk ${chunkIndex + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return results;
  }

  /**
   * Create complete file data using chunked streaming
   * Memory-safe approach for files of any size
   */
  async createCompleteFileData(
    file: File,
    onProgress?: (progress: number, text: string) => void
  ): Promise<Blob> {
    const fileSize = file.size;
    
    // For small files, return as-is
    if (fileSize < PROCESSING_CONSTANTS.CHUNK_SIZES.SMALL_FILE_THRESHOLD) {
      if (this.debug) {
        console.log(`[FileProcessor] Small file (${Math.round(fileSize / 1024 / 1024)}MB), returning directly`);
      }
      return file;
    }

    if (this.debug) {
      console.log(`[FileProcessor] Creating complete file data using chunked strategy`);
    }

    const chunks = await this.processInChunks(
      file,
      async (chunk) => chunk,
      { onProgress }
    );

    // Combine all chunks into a single blob
    const completeFile = new Blob(chunks, { type: file.type });
    
    if (this.debug) {
      console.log(`[FileProcessor] Combined ${chunks.length} chunks into complete file blob`);
    }

    return completeFile;
  }

  /**
   * Progressive extraction for very large files
   */
  async extractFromMultipleChunks<T>(
    file: File,
    extractor: (chunk: Blob, position: number) => Promise<T | null>,
    options: {
      maxChunks?: number;
      chunkSize?: number;
      onProgress?: (progress: number, text: string) => void;
    } = {}
  ): Promise<T | null> {
    const fileSize = file.size;
    const chunkSize = options.chunkSize || PROCESSING_CONSTANTS.CHUNK_SIZES.QUICK_EXTRACTION;
    const maxChunks = options.maxChunks || PROCESSING_CONSTANTS.LIMITS.MAX_PROGRESSIVE_CHUNKS;
    
    // Calculate strategic chunk positions
    const totalChunks = Math.min(maxChunks, Math.ceil(fileSize / (500 * 1024 * 1024))); // One chunk per 500MB
    const chunkPositions: number[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const position = Math.floor((fileSize / totalChunks) * i);
      chunkPositions.push(position);
    }

    if (this.debug) {
      console.log(`[FileProcessor] Progressive extraction with ${chunkPositions.length} strategic positions`);
    }

    // Try each chunk until we find the desired content
    for (let i = 0; i < chunkPositions.length; i++) {
      const position = chunkPositions[i];
      const chunkEnd = Math.min(position + chunkSize, fileSize);
      const chunk = file.slice(position, chunkEnd);
      
      if (options.onProgress) {
        const progress = 20 + (i / chunkPositions.length) * 60;
        options.onProgress(
          progress,
          `Scanning chunk ${i + 1}/${chunkPositions.length} at ${(position / 1024 / 1024 / 1024).toFixed(1)}GB...`
        );
      }

      try {
        const result = await extractor(chunk, position);
        if (result !== null) {
          if (this.debug) {
            console.log(`[FileProcessor] Found content in chunk ${i + 1} at position ${position}`);
          }
          return result;
        }
      } catch (error) {
        if (this.debug) {
          console.log(`[FileProcessor] Chunk ${i + 1} failed:`, error);
        }
        // Continue to next chunk
      }
    }

    if (this.debug) {
      console.log(`[FileProcessor] No content found in any of the ${chunkPositions.length} chunks`);
    }
    
    return null;
  }

  /**
   * Handle large file downloads with chunked streaming
   */
  downloadLargeFile(
    data: Uint8Array,
    filename: string,
    onProgress?: (progress: number) => void
  ): void {
    const maxBlobSize = PROCESSING_CONSTANTS.LIMITS.MAX_BLOB_SIZE;
    
    if (this.debug) {
      console.log(`[FileProcessor] Starting download for ${filename}, size: ${data.length} bytes`);
    }

    // For normal-sized files, use standard blob download
    if (data.length < maxBlobSize) {
      this._standardBlobDownload(data, filename);
      return;
    }

    // For large files, use chunked streaming download
    this._chunkedStreamDownload(data, filename, onProgress);
  }

  /**
   * Standard blob download for normal-sized files
   */
  private _standardBlobDownload(data: Uint8Array, filename: string): void {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (this.debug) {
      console.log(`[FileProcessor] Standard blob download completed for ${filename}`);
    }
  }

  /**
   * Chunked stream download for large files
   */
  private _chunkedStreamDownload(
    data: Uint8Array,
    filename: string,
    onProgress?: (progress: number) => void
  ): void {
    const chunkSize = PROCESSING_CONSTANTS.CHUNK_SIZES.DOWNLOAD;
    
    if (this.debug) {
      console.log(`[FileProcessor] Using chunked stream download for ${filename}`);
    }

    const stream = new ReadableStream({
      start(controller) {
        let offset = 0;
        
        const pump = () => {
          if (offset < data.length) {
            const chunk = data.slice(offset, Math.min(offset + chunkSize, data.length));
            controller.enqueue(chunk);
            offset += chunk.length;
            
            // Report progress
            if (onProgress) {
              onProgress((offset / data.length) * 100);
            }
            
            // Continue with next chunk
            setTimeout(pump, 0);
          } else {
            controller.close();
          }
        };
        
        pump();
      }
    });

    // Create response from stream and trigger download
    const response = new Response(stream);
    response.blob()
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (this.debug) {
          console.log(`[FileProcessor] Chunked stream download completed for ${filename}`);
        }
      })
      .catch(error => {
        console.error(`[FileProcessor] Chunked download failed:`, error);
        throw error;
      });
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.stats = createProcessingStats(0);
  }
}

/**
 * Utility functions for file operations
 */

/**
 * Check if file is considered large
 */
export function isLargeFile(file: File): boolean {
  return file.size > PROCESSING_CONSTANTS.LIMITS.VERY_LARGE_FILE_THRESHOLD;
}

/**
 * Check if file is considered very large
 */
export function isVeryLargeFile(file: File): boolean {
  return file.size > PROCESSING_CONSTANTS.LIMITS.LARGE_FILE_THRESHOLD;
}

/**
 * Get recommended processing strategy based on file size
 */
export function getRecommendedProcessingStrategy(file: File): 'quick' | 'chunked' | 'progressive' {
  if (file.size < PROCESSING_CONSTANTS.CHUNK_SIZES.SMALL_FILE_THRESHOLD) {
    return 'quick';
  } else if (file.size < PROCESSING_CONSTANTS.LIMITS.LARGE_FILE_THRESHOLD) {
    return 'chunked';
  } else {
    return 'progressive';
  }
}

/**
 * Create a file processor instance with options
 */
export function createFileProcessor(options: { 
  debug?: boolean; 
  chunkSize?: number; 
} = {}): { processCompleteFile: (file: File) => Promise<Blob> } {
  const processor = new FileProcessor(options.debug || false);
  
  return {
    processCompleteFile: (file: File) => processor.createCompleteFileData(file)
  };
}