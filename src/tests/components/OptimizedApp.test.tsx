/**
 * Tests for OptimizedApp component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OptimizedApp from '../../components/OptimizedApp';
import { createMockVideoFile } from '../setup';

// Mock the optimized hook
const mockHookReturn = {
  metadata: null,
  progress: { isVisible: false, progress: 0, text: '' },
  error: { isVisible: false, message: '' },
  handleFileSelect: jest.fn(),
  hideError: jest.fn(),
  hideProgress: jest.fn(),
  isLoaded: true,
  selectedFile: null,
  currentMethod: 'Optimized Processing',
  extractSubtitle: jest.fn(),
  extractAllSubtitles: jest.fn()
};

jest.mock('../../hooks/useOptimizedVideoMetadata', () => ({
  useOptimizedVideoMetadata: () => mockHookReturn
}));

// Mock components
jest.mock('../../components/FileUpload', () => ({
  FileUpload: ({ onFileSelect, onMultipleFilesSelect, isLoaded, currentMethod }: any) => (
    <div data-testid="file-upload">
      <button onClick={() => onFileSelect(createMockVideoFile(1, 'test.mp4'))}>
        Select Single File
      </button>
      <button onClick={() => onMultipleFilesSelect([
        createMockVideoFile(1, 'test1.mp4'),
        createMockVideoFile(1, 'test2.mp4')
      ])}>
        Select Multiple Files
      </button>
      <span>Loaded: {isLoaded.toString()}</span>
      <span>Method: {currentMethod}</span>
    </div>
  )
}));

jest.mock('../../components/ProgressBar', () => ({
  ProgressBar: ({ progress, onClose }: any) => (
    <div data-testid="progress-bar">
      <span>Progress: {progress.progress}%</span>
      <span>{progress.text}</span>
      {onClose && <button onClick={onClose}>Close</button>}
    </div>
  )
}));

jest.mock('../../components/MetadataDisplay', () => ({
  MetadataDisplay: ({ metadata, selectedFile, extractSubtitle, extractAllSubtitles }: any) => (
    <div data-testid="metadata-display">
      <span>File: {selectedFile?.name || 'none'}</span>
      <span>Metadata: {metadata ? 'present' : 'none'}</span>
      <button onClick={() => extractSubtitle(selectedFile, 0)}>Extract Subtitle</button>
      <button onClick={() => extractAllSubtitles(selectedFile)}>Extract All</button>
    </div>
  )
}));

jest.mock('../../components/ErrorDisplay', () => ({
  ErrorDisplay: ({ error, onDismiss }: any) => (
    <div data-testid="error-display">
      <span>{error.message}</span>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  )
}));

describe('OptimizedApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock hook return to default state
    Object.assign(mockHookReturn, {
      metadata: null,
      progress: { isVisible: false, progress: 0, text: '' },
      error: { isVisible: false, message: '' },
      selectedFile: null,
      isLoaded: true
    });
  });

  describe('rendering', () => {
    it('should render main components', () => {
      render(<OptimizedApp />);
      
      expect(screen.getByText('Video Metadata Extractor')).toBeInTheDocument();
      expect(screen.getByTestId('file-upload')).toBeInTheDocument();
    });

    it('should display loading state correctly', () => {
      mockHookReturn.isLoaded = false;
      render(<OptimizedApp />);
      
      expect(screen.getByText('Loaded: false')).toBeInTheDocument();
    });

    it('should display current method', () => {
      render(<OptimizedApp />);
      
      expect(screen.getByText('Method: Optimized Processing')).toBeInTheDocument();
    });
  });

  describe('single file processing', () => {
    it('should handle single file selection', () => {
      render(<OptimizedApp />);
      
      const selectButton = screen.getByText('Select Single File');
      fireEvent.click(selectButton);
      
      expect(mockHookReturn.handleFileSelect).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test.mp4' })
      );
    });

    it('should display metadata when available', () => {
      const mockFile = createMockVideoFile(1, 'test.mp4');
      mockHookReturn.metadata = {
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
      mockHookReturn.selectedFile = mockFile;
      
      render(<OptimizedApp />);
      
      expect(screen.getByTestId('metadata-display')).toBeInTheDocument();
      expect(screen.getByText('File: test.mp4')).toBeInTheDocument();
      expect(screen.getByText('Metadata: present')).toBeInTheDocument();
    });
  });

  describe('multiple file processing', () => {
    it('should handle multiple file selection', async () => {
      render(<OptimizedApp />);
      
      const selectButton = screen.getByText('Select Multiple Files');
      fireEvent.click(selectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Batch Processing Results')).toBeInTheDocument();
      });
    });

    it('should display processing queue', async () => {
      render(<OptimizedApp />);
      
      const selectButton = screen.getByText('Select Multiple Files');
      fireEvent.click(selectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/files remaining in queue/)).toBeInTheDocument();
      });
    });

    it('should show batch progress', async () => {
      render(<OptimizedApp />);
      
      const selectButton = screen.getByText('Select Multiple Files');
      fireEvent.click(selectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Initializing batch processing...')).toBeInTheDocument();
      });
    });

    it('should handle clear all action', async () => {
      render(<OptimizedApp />);
      
      // Start batch processing
      const selectButton = screen.getByText('Select Multiple Files');
      fireEvent.click(selectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument();
      });
      
      // Click clear all
      const clearButton = screen.getByText('Clear All');
      fireEvent.click(clearButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Batch Processing Results')).not.toBeInTheDocument();
      });
    });
  });

  describe('progress display', () => {
    it('should show progress bar when progress is visible', () => {
      mockHookReturn.progress = {
        isVisible: true,
        progress: 50,
        text: 'Processing file...'
      };
      
      render(<OptimizedApp />);
      
      expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
      expect(screen.getByText('Progress: 50%')).toBeInTheDocument();
      expect(screen.getByText('Processing file...')).toBeInTheDocument();
    });

    it('should hide progress bar when not visible', () => {
      mockHookReturn.progress = {
        isVisible: false,
        progress: 0,
        text: ''
      };
      
      render(<OptimizedApp />);
      
      expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
    });

    it('should call hideProgress when close button is clicked', () => {
      mockHookReturn.progress = {
        isVisible: true,
        progress: 100,
        text: 'Complete'
      };
      
      render(<OptimizedApp />);
      
      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);
      
      expect(mockHookReturn.hideProgress).toHaveBeenCalled();
    });
  });

  describe('error display', () => {
    it('should show error when error is visible', () => {
      mockHookReturn.error = {
        isVisible: true,
        message: 'Processing failed'
      };
      
      render(<OptimizedApp />);
      
      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByText('Processing failed')).toBeInTheDocument();
    });

    it('should hide error when not visible', () => {
      mockHookReturn.error = {
        isVisible: false,
        message: ''
      };
      
      render(<OptimizedApp />);
      
      expect(screen.queryByTestId('error-display')).not.toBeInTheDocument();
    });

    it('should call hideError when dismiss button is clicked', () => {
      mockHookReturn.error = {
        isVisible: true,
        message: 'Test error'
      };
      
      render(<OptimizedApp />);
      
      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);
      
      expect(mockHookReturn.hideError).toHaveBeenCalled();
    });
  });

  describe('subtitle extraction', () => {
    it('should call extractSubtitle when button is clicked', () => {
      const mockFile = createMockVideoFile(1, 'test.mp4');
      mockHookReturn.metadata = {
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
      mockHookReturn.selectedFile = mockFile;
      
      render(<OptimizedApp />);
      
      const extractButton = screen.getByText('Extract Subtitle');
      fireEvent.click(extractButton);
      
      expect(mockHookReturn.extractSubtitle).toHaveBeenCalledWith(mockFile, 0);
    });

    it('should call extractAllSubtitles when button is clicked', () => {
      const mockFile = createMockVideoFile(1, 'test.mp4');
      mockHookReturn.metadata = {
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
      mockHookReturn.selectedFile = mockFile;
      
      render(<OptimizedApp />);
      
      const extractAllButton = screen.getByText('Extract All');
      fireEvent.click(extractAllButton);
      
      expect(mockHookReturn.extractAllSubtitles).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('responsive design', () => {
    it('should display footer information', () => {
      render(<OptimizedApp />);
      
      expect(screen.getByText(/Powered by FFmpeg WebAssembly/)).toBeInTheDocument();
      expect(screen.getByText(/All processing happens in your browser/)).toBeInTheDocument();
    });

    it('should have proper CSS classes for responsive layout', () => {
      render(<OptimizedApp />);
      
      const mainContainer = screen.getByText('Video Metadata Extractor').closest('div');
      expect(mainContainer).toHaveClass('max-w-7xl', 'mx-auto');
    });
  });
});