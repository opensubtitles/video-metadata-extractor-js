/**
 * Tests for file processor utilities
 */

import { FileProcessor, createFileProcessor, isLargeFile, isVeryLargeFile, getRecommendedProcessingStrategy } from '../../utils/fileProcessor';
import { MockFile, createMockVideoFile, waitFor } from '../setup';

describe('FileProcessor', () => {
  let processor: FileProcessor;

  beforeEach(() => {
    processor = new FileProcessor();
  });

  describe('processInChunks', () => {
    it('should process small file in single chunk', async () => {
      const file = createMockVideoFile(1, 'small.mp4'); // 1MB file
      const chunkProcessor = jest.fn().mockResolvedValue('processed');
      
      const results = await processor.processInChunks(
        file,
        chunkProcessor,
        { chunkSize: 2 * 1024 * 1024 } // 2MB chunks
      );
      
      expect(results).toEqual(['processed']);
      expect(chunkProcessor).toHaveBeenCalledTimes(1);
    });

    it('should process large file in multiple chunks', async () => {
      const file = createMockVideoFile(10, 'large.mp4'); // 10MB file
      const chunkProcessor = jest.fn().mockResolvedValue('processed');
      
      const results = await processor.processInChunks(
        file,
        chunkProcessor,
        { chunkSize: 3 * 1024 * 1024 } // 3MB chunks
      );
      
      expect(results).toHaveLength(4); // 10MB / 3MB = 4 chunks (rounded up)
      expect(chunkProcessor).toHaveBeenCalledTimes(4);
    });

    it('should call progress callback', async () => {
      const file = createMockVideoFile(2, 'test.mp4'); // 2MB file
      const chunkProcessor = jest.fn().mockResolvedValue('processed');
      const progressCallback = jest.fn();
      
      await processor.processInChunks(
        file,
        chunkProcessor,
        { 
          chunkSize: 1 * 1024 * 1024, // 1MB chunks
          onProgress: progressCallback 
        }
      );
      
      expect(progressCallback).toHaveBeenCalledWith(50, expect.stringContaining('1/2'));
      expect(progressCallback).toHaveBeenCalledWith(100, expect.stringContaining('2/2'));
    });

    it('should handle processing errors', async () => {
      const file = createMockVideoFile(1, 'test.mp4');
      const chunkProcessor = jest.fn().mockRejectedValue(new Error('Processing failed'));
      
      await expect(
        processor.processInChunks(file, chunkProcessor)
      ).rejects.toThrow('Failed to process chunk 1: Processing failed');
    });
  });

  describe('createCompleteFileData', () => {
    it('should return small file directly', async () => {
      const file = createMockVideoFile(0.1, 'small.mp4'); // 0.1MB file
      const result = await processor.createCompleteFileData(file);
      
      expect(result).toBe(file);
    });

    it('should process large file in chunks', async () => {
      const file = createMockVideoFile(100, 'large.mp4'); // 100MB file
      const result = await processor.createCompleteFileData(file);
      
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe(file.type);
    });

    it('should call progress callback for large files', async () => {
      const file = createMockVideoFile(100, 'large.mp4'); // 100MB file
      const progressCallback = jest.fn();
      
      await processor.createCompleteFileData(file, progressCallback);
      
      expect(progressCallback).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('chunk')
      );
    });
  });

  describe('extractFromMultipleChunks', () => {
    it('should find content in first chunk', async () => {
      const file = createMockVideoFile(10, 'test.mp4');
      const extractor = jest.fn()
        .mockResolvedValueOnce('found content')
        .mockResolvedValue(null);
      
      const result = await processor.extractFromMultipleChunks(
        file,
        extractor,
        { maxChunks: 3 }
      );
      
      expect(result).toBe('found content');
      expect(extractor).toHaveBeenCalledTimes(1);
    });

    it('should continue searching through chunks', async () => {
      const file = createMockVideoFile(10, 'test.mp4');
      const extractor = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('found content');
      
      const result = await processor.extractFromMultipleChunks(
        file,
        extractor,
        { maxChunks: 5 }
      );
      
      expect(result).toBe('found content');
      expect(extractor).toHaveBeenCalledTimes(3);
    });

    it('should return null if content not found', async () => {
      const file = createMockVideoFile(10, 'test.mp4');
      const extractor = jest.fn().mockResolvedValue(null);
      
      const result = await processor.extractFromMultipleChunks(
        file,
        extractor,
        { maxChunks: 2 }
      );
      
      expect(result).toBe(null);
      expect(extractor).toHaveBeenCalledTimes(2);
    });

    it('should handle extractor errors and continue', async () => {
      const file = createMockVideoFile(10, 'test.mp4');
      const extractor = jest.fn()
        .mockRejectedValueOnce(new Error('Chunk error'))
        .mockResolvedValueOnce('found content');
      
      const result = await processor.extractFromMultipleChunks(
        file,
        extractor,
        { maxChunks: 3 }
      );
      
      expect(result).toBe('found content');
      expect(extractor).toHaveBeenCalledTimes(2);
    });
  });

  describe('downloadLargeFile', () => {
    it('should use standard download for small files', () => {
      const data = new Uint8Array(1024); // 1KB
      const filename = 'small.txt';
      
      processor.downloadLargeFile(data, filename);
      
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');
    });

    it('should use chunked download for large files', () => {
      // Mock a file larger than 2GB
      const data = new Uint8Array(3 * 1024 * 1024 * 1024); // 3GB (mock)
      Object.defineProperty(data, 'length', { value: 3 * 1024 * 1024 * 1024 });
      
      const filename = 'large.bin';
      const progressCallback = jest.fn();
      
      processor.downloadLargeFile(data, filename, progressCallback);
      
      // Should create a ReadableStream for chunked download
      expect(ReadableStream).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return processing statistics', () => {
      const stats = processor.getStats();
      
      expect(stats).toHaveProperty('startTime');
      expect(stats).toHaveProperty('fileSize');
      expect(stats).toHaveProperty('chunksProcessed');
    });
  });

  describe('reset', () => {
    it('should reset processor state', async () => {
      const file = createMockVideoFile(1, 'test.mp4');
      
      // Process a file to change state
      await processor.processInChunks(file, async () => 'processed');
      
      const statsBefore = processor.getStats();
      expect(statsBefore.chunksProcessed).toBeGreaterThan(0);
      
      processor.reset();
      
      const statsAfter = processor.getStats();
      expect(statsAfter.chunksProcessed).toBe(0);
    });
  });
});

describe('File Processing Utilities', () => {
  describe('isLargeFile', () => {
    it('should identify large files correctly', () => {
      const smallFile = createMockVideoFile(100, 'small.mp4'); // 100MB
      const largeFile = createMockVideoFile(2000, 'large.mp4'); // 2GB
      
      expect(isLargeFile(smallFile)).toBe(false);
      expect(isLargeFile(largeFile)).toBe(true);
    });
  });

  describe('isVeryLargeFile', () => {
    it('should identify very large files correctly', () => {
      const normalFile = createMockVideoFile(1000, 'normal.mp4'); // 1GB
      const veryLargeFile = createMockVideoFile(6000, 'verylarge.mp4'); // 6GB
      
      expect(isVeryLargeFile(normalFile)).toBe(false);
      expect(isVeryLargeFile(veryLargeFile)).toBe(true);
    });
  });

  describe('getRecommendedProcessingStrategy', () => {
    it('should recommend quick strategy for small files', () => {
      const smallFile = createMockVideoFile(10, 'small.mp4'); // 10MB
      expect(getRecommendedProcessingStrategy(smallFile)).toBe('quick');
    });

    it('should recommend chunked strategy for medium files', () => {
      const mediumFile = createMockVideoFile(1000, 'medium.mp4'); // 1GB
      expect(getRecommendedProcessingStrategy(mediumFile)).toBe('chunked');
    });

    it('should recommend progressive strategy for very large files', () => {
      const largeFile = createMockVideoFile(6000, 'large.mp4'); // 6GB
      expect(getRecommendedProcessingStrategy(largeFile)).toBe('progressive');
    });
  });

  describe('createFileProcessor', () => {
    it('should create processor with default options', () => {
      const processor = createFileProcessor();
      
      expect(processor).toHaveProperty('processCompleteFile');
      expect(processor).toHaveProperty('processInChunks');
      expect(processor).toHaveProperty('getStats');
    });

    it('should create processor with custom options', () => {
      const processor = createFileProcessor({ debug: true, chunkSize: 1024 });
      
      expect(processor).toHaveProperty('processCompleteFile');
      expect(typeof processor.processCompleteFile).toBe('function');
    });
  });
});