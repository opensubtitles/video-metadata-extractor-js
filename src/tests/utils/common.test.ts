/**
 * Tests for common utility functions
 */

import {
  withRetry,
  safeAsync,
  sleep,
  formatFileSize,
  formatDuration,
  getFormatFromFileName,
  validateFile,
  generateSubtitleFilename,
  safeDecodePreview,
  debounce,
  throttle,
  deepClone
} from '../../utils/common';
import { MockFile } from '../setup';

describe('Common Utilities', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      const result = await withRetry(mockOperation, 3, 100);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const result = await withRetry(mockOperation, 3, 10);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max attempts', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('persistent failure'));
      
      await expect(withRetry(mockOperation, 2, 10)).rejects.toThrow('persistent failure');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('safeAsync', () => {
    it('should return success result for successful operation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('data');
      const result = await safeAsync(mockOperation);
      
      expect(result).toEqual({ success: true, data: 'data' });
    });

    it('should return error result for failed operation', async () => {
      const error = new Error('operation failed');
      const mockOperation = jest.fn().mockRejectedValue(error);
      const result = await safeAsync(mockOperation);
      
      expect(result).toEqual({ success: false, error });
    });
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      const start = Date.now();
      await sleep(50);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(40); // Allow for small timing variations
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('should handle decimal places', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB'); // 1.5 KB
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB'); // 2.5 MB
    });
  });

  describe('formatDuration', () => {
    it('should format seconds to time string', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(30)).toBe('0:30');
      expect(formatDuration(90)).toBe('1:30');
      expect(formatDuration(3661)).toBe('1:01:01'); // 1 hour, 1 minute, 1 second
    });

    it('should handle string input', () => {
      expect(formatDuration('120')).toBe('2:00');
      expect(formatDuration('3600')).toBe('1:00:00');
    });

    it('should handle invalid input', () => {
      expect(formatDuration('invalid')).toBe('Unknown');
      expect(formatDuration(NaN)).toBe('Unknown');
    });
  });

  describe('getFormatFromFileName', () => {
    it('should extract file extension', () => {
      expect(getFormatFromFileName('video.mp4')).toBe('mp4');
      expect(getFormatFromFileName('movie.mkv')).toBe('mkv');
      expect(getFormatFromFileName('file.name.avi')).toBe('avi');
    });

    it('should handle files without extension', () => {
      expect(getFormatFromFileName('noextension')).toBe('unknown');
      expect(getFormatFromFileName('')).toBe('unknown');
    });

    it('should handle case insensitive extensions', () => {
      expect(getFormatFromFileName('VIDEO.MP4')).toBe('mp4');
      expect(getFormatFromFileName('Movie.MKV')).toBe('mkv');
    });
  });

  describe('validateFile', () => {
    it('should validate correct file', () => {
      const file = new MockFile('test data', 'test.mp4', { type: 'video/mp4' });
      const result = validateFile(file);
      
      expect(result.isValid).toBe(true);
      expect(result.extension).toBe('mp4');
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty file', () => {
      const file = new MockFile('', 'empty.mp4');
      const result = validateFile(file);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File appears to be empty');
    });

    it('should reject unsupported format', () => {
      const file = new MockFile('test data', 'test.xyz');
      const result = validateFile(file);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('generateSubtitleFilename', () => {
    it('should generate correct filename with language', () => {
      const result = generateSubtitleFilename('movie.mp4', 'eng', false, 'subrip');
      
      expect(result.filename).toBe('movie.en.srt');
      expect(result.extension).toBe('srt');
    });

    it('should handle forced subtitles', () => {
      const result = generateSubtitleFilename('movie.mp4', 'spa', true, 'subrip');
      
      expect(result.filename).toBe('movie.es.forced.srt');
      expect(result.extension).toBe('srt');
    });

    it('should handle different codecs', () => {
      const result = generateSubtitleFilename('movie.mp4', 'eng', false, 'ass');
      
      expect(result.filename).toBe('movie.en.ass');
      expect(result.extension).toBe('ass');
    });

    it('should handle unknown language', () => {
      const result = generateSubtitleFilename('movie.mp4', 'unknown', false, 'subrip');
      
      expect(result.filename).toBe('movie.unknown.srt');
      expect(result.extension).toBe('srt');
    });
  });

  describe('safeDecodePreview', () => {
    it('should decode string data', () => {
      const result = safeDecodePreview('Hello world', 5);
      expect(result).toBe('Hello');
    });

    it('should decode Uint8Array data', () => {
      const data = new TextEncoder().encode('Hello world');
      const result = safeDecodePreview(data, 5);
      expect(result).toBe('Hello');
    });

    it('should handle decoding errors gracefully', () => {
      // Create invalid UTF-8 sequence
      const invalidData = new Uint8Array([0xFF, 0xFE, 0xFD]);
      const result = safeDecodePreview(invalidData);
      
      expect(typeof result).toBe('string');
      // Should not throw an error
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', async () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 50);
      
      debouncedFn('call1');
      debouncedFn('call2');
      debouncedFn('call3');
      
      // Should not be called immediately
      expect(mockFn).not.toHaveBeenCalled();
      
      // Wait for debounce delay
      await sleep(60);
      
      // Should be called only once with the last arguments
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('call3');
    });
  });

  describe('throttle', () => {
    it('should throttle function calls', async () => {
      const mockFn = jest.fn();
      const throttledFn = throttle(mockFn, 50);
      
      throttledFn('call1');
      throttledFn('call2');
      throttledFn('call3');
      
      // Should be called immediately once
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('call1');
      
      // Wait for throttle period
      await sleep(60);
      
      throttledFn('call4');
      
      // Should be called again after throttle period
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenCalledWith('call4');
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
    });

    it('should clone arrays', () => {
      const original = [1, 2, [3, 4]];
      const clone = deepClone(original);
      
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone[2]).not.toBe(original[2]);
    });

    it('should clone objects', () => {
      const original = {
        name: 'test',
        nested: {
          value: 42
        }
      };
      const clone = deepClone(original);
      
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.nested).not.toBe(original.nested);
    });

    it('should clone dates', () => {
      const original = new Date('2023-01-01');
      const clone = deepClone(original);
      
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone instanceof Date).toBe(true);
    });
  });
});