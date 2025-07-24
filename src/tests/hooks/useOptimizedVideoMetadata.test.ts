/**
 * Tests for optimized video metadata hook
 */

import { renderHook, act } from '@testing-library/react';
import { useOptimizedVideoMetadata } from '../../hooks/useOptimizedVideoMetadata';
import { MockFile, createMockVideoFile, createMockFFmpegLogs, waitFor } from '../setup';

// Mock FFmpeg
const mockFFmpeg = {
  loaded: false,
  load: jest.fn().mockResolvedValue(undefined),
  exec: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(new Uint8Array([65, 66, 67])), // "ABC"
  deleteFile: jest.fn().mockResolvedValue(undefined),
  listDir: jest.fn().mockResolvedValue([]),
  on: jest.fn(),
  off: jest.fn(),
  terminate: jest.fn().mockResolvedValue(undefined)
};

// Mock @ffmpeg/ffmpeg
jest.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: jest.fn(() => mockFFmpeg)
}));

// Mock @ffmpeg/util
jest.mock('@ffmpeg/util', () => ({
  toBlobURL: jest.fn().mockResolvedValue('mock-blob-url'),
  fetchFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
}));

// Mock JSZip
jest.mock('jszip', () => {
  return jest.fn().mockImplementation(() => ({
    file: jest.fn(),
    generateAsync: jest.fn().mockResolvedValue(new Blob(['mock zip data']))
  }));
});

describe('useOptimizedVideoMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFFmpeg.loaded = false;
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      expect(result.current.metadata).toBe(null);
      expect(result.current.selectedFile).toBe(null);
      expect(result.current.progress.isVisible).toBe(false);
      expect(result.current.error.isVisible).toBe(false);
      expect(result.current.isLoaded).toBe(false);
    });

    it('should load FFmpeg on mount', async () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      await act(async () => {
        await waitFor(100);
      });
      
      expect(mockFFmpeg.load).toHaveBeenCalled();
    });

    it('should set isLoaded to true after FFmpeg loads', async () => {
      mockFFmpeg.loaded = true;
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      await act(async () => {
        await waitFor(100);
      });
      
      expect(result.current.isLoaded).toBe(true);
    });

    it('should handle FFmpeg initialization error', async () => {
      mockFFmpeg.load.mockRejectedValueOnce(new Error('Load failed'));
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      await act(async () => {
        await waitFor(100);
      });
      
      expect(result.current.error.isVisible).toBe(true);
      expect(result.current.error.message).toContain('Failed to initialize FFmpeg');
    });
  });

  describe('handleFileSelect', () => {
    it('should process valid video file', async () => {
      mockFFmpeg.loaded = true;
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = createMockVideoFile(1, 'test.mp4');
      
      // Mock FFmpeg logs to return valid metadata
      let logHandler: (data: { message: string }) => void;
      mockFFmpeg.on.mockImplementation((event: string, handler: any) => {
        if (event === 'log') {
          logHandler = handler;
        }
      });
      
      mockFFmpeg.exec.mockImplementation(async () => {
        // Simulate FFmpeg log output
        if (logHandler) {
          const logs = createMockFFmpegLogs().split('\n');
          logs.forEach(line => logHandler({ message: line }));
        }
        throw new Error('Expected FFmpeg error for -i command');
      });
      
      await act(async () => {
        await result.current.handleFileSelect(file);
      });
      
      expect(result.current.metadata).not.toBe(null);
      expect(result.current.selectedFile).toBe(file);
    });

    it('should handle invalid file format', async () => {
      mockFFmpeg.loaded = true;
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = new MockFile('test data', 'test.txt'); // Invalid format
      
      await act(async () => {
        await result.current.handleFileSelect(file);
      });
      
      expect(result.current.error.isVisible).toBe(true);
      expect(result.current.error.message).toContain('Unsupported file format');
    });

    it('should handle empty file', async () => {
      mockFFmpeg.loaded = true;
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = new MockFile('', 'empty.mp4'); // Empty file
      
      await act(async () => {
        await result.current.handleFileSelect(file);
      });
      
      expect(result.current.error.isVisible).toBe(true);
      expect(result.current.error.message).toContain('empty');
    });

    it('should show progress during processing', async () => {
      mockFFmpeg.loaded = true;
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = createMockVideoFile(1, 'test.mp4');
      
      let progressUpdates: any[] = [];
      
      // Monitor progress changes
      const originalHandleFileSelect = result.current.handleFileSelect;
      
      act(() => {
        originalHandleFileSelect(file);
      });
      
      await act(async () => {
        await waitFor(50);
      });
      
      // Should show progress at some point
      expect(result.current.progress.isVisible || progressUpdates.length > 0).toBe(true);
    });
  });

  describe('extractSubtitle', () => {
    beforeEach(() => {
      mockFFmpeg.loaded = true;
    });

    it('should extract subtitle successfully', async () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = createMockVideoFile(1, 'test.mp4');
      
      // Mock subtitle data
      const subtitleData = new TextEncoder().encode('1\n00:00:00,000 --> 00:00:05,000\nTest subtitle\n');
      mockFFmpeg.readFile.mockResolvedValueOnce(subtitleData);
      
      await act(async () => {
        await result.current.extractSubtitle(file, 0, 'eng', 'subrip', false);
      });
      
      expect(mockFFmpeg.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['-i', 'input.video', '-map', '0:0'])
      );
      expect(mockFFmpeg.readFile).toHaveBeenCalled();
    });

    it('should handle subtitle extraction error', async () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = createMockVideoFile(1, 'test.mp4');
      
      mockFFmpeg.exec.mockRejectedValueOnce(new Error('Extraction failed'));
      
      await act(async () => {
        await result.current.extractSubtitle(file, 0, 'eng', 'subrip', false);
      });
      
      expect(result.current.error.isVisible).toBe(true);
    });

    it('should fallback to SRT format on failure', async () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = createMockVideoFile(1, 'test.mp4');
      
      // Mock first call to fail, second to succeed
      mockFFmpeg.exec
        .mockRejectedValueOnce(new Error('Primary format failed'))
        .mockResolvedValueOnce(undefined);
      
      const subtitleData = new TextEncoder().encode('SRT subtitle data');
      mockFFmpeg.readFile.mockResolvedValueOnce(subtitleData);
      
      await act(async () => {
        await result.current.extractSubtitle(file, 0, 'eng', 'ass', false);
      });
      
      // Should try original format first, then SRT fallback
      expect(mockFFmpeg.exec).toHaveBeenCalledTimes(2);
    });
  });

  describe('extractAllSubtitles', () => {
    beforeEach(() => {
      mockFFmpeg.loaded = true;
    });

    it('should extract all subtitle tracks', async () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      // Set up metadata with subtitle streams
      act(() => {
        result.current.metadata = {
          format: {
            filename: 'test.mp4',
            size: '1048576',
            format_name: 'mp4',
            duration: '120',
            bit_rate: '1000000',
            fps: '25',
            movietimems: '120000',
            movieframes: '3000'
          },
          streams: [
            {
              codec_type: 'subtitle',
              codec_name: 'subrip',
              language: 'eng',
              index: 2
            },
            {
              codec_type: 'subtitle',
              codec_name: 'subrip',
              language: 'spa',
              index: 3
            }
          ]
        };
      });
      
      const file = createMockVideoFile(1, 'test.mp4');
      const subtitleData = new TextEncoder().encode('Subtitle content');
      mockFFmpeg.readFile.mockResolvedValue(subtitleData);
      
      await act(async () => {
        await result.current.extractAllSubtitles(file);
      });
      
      // Should extract both subtitle streams
      expect(mockFFmpeg.exec).toHaveBeenCalledTimes(2);
    });

    it('should handle no subtitle tracks', async () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      // Set up metadata without subtitle streams
      act(() => {
        result.current.metadata = {
          format: {
            filename: 'test.mp4',
            size: '1048576',
            format_name: 'mp4',
            duration: '120',
            bit_rate: '1000000',
            fps: '25',
            movietimems: '120000',
            movieframes: '3000'
          },
          streams: []
        };
      });
      
      const file = createMockVideoFile(1, 'test.mp4');
      
      await act(async () => {
        await result.current.extractAllSubtitles(file);
      });
      
      expect(result.current.error.isVisible).toBe(true);
      expect(result.current.error.message).toContain('No subtitle tracks found');
    });
  });

  describe('error and progress management', () => {
    it('should hide error when hideError is called', () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      // Manually set error state
      act(() => {
        result.current.error.isVisible = true;
        result.current.error.message = 'Test error';
      });
      
      act(() => {
        result.current.hideError();
      });
      
      expect(result.current.error.isVisible).toBe(false);
      expect(result.current.error.message).toBe('');
    });

    it('should hide progress when hideProgress is called', () => {
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      
      // Manually set progress state
      act(() => {
        result.current.progress.isVisible = true;
        result.current.progress.progress = 50;
        result.current.progress.text = 'Processing...';
      });
      
      act(() => {
        result.current.hideProgress();
      });
      
      expect(result.current.progress.isVisible).toBe(false);
      expect(result.current.progress.progress).toBe(0);
      expect(result.current.progress.text).toBe('');
    });
  });

  describe('cleanup', () => {
    it('should clean up FFmpeg files after processing', async () => {
      mockFFmpeg.loaded = true;
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = createMockVideoFile(1, 'test.mp4');
      
      await act(async () => {
        await result.current.handleFileSelect(file);
      });
      
      // Should call deleteFile for cleanup
      expect(mockFFmpeg.deleteFile).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFFmpeg.loaded = true;
      mockFFmpeg.deleteFile.mockRejectedValue(new Error('Cleanup failed'));
      
      const { result } = renderHook(() => useOptimizedVideoMetadata());
      const file = createMockVideoFile(1, 'test.mp4');
      
      // Should not throw error even if cleanup fails
      await expect(
        act(async () => {
          await result.current.handleFileSelect(file);
        })
      ).resolves.not.toThrow();
    });
  });
});