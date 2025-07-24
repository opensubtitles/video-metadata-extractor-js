/**
 * Video Metadata Extractor - NPM Package
 * 
 * A comprehensive video metadata and subtitle extraction library
 * that supports browser and Node.js environments.
 */

export { useVideoMetadata } from '../hooks/useVideoMetadata';
export { useMP4BoxMetadata } from '../hooks/useMP4BoxMetadata';
export { useSmartMetadata } from '../hooks/useSmartMetadata';

// Export types
export type { VideoMetadata, StreamInfo, FormatInfo, ProgressState, ErrorState } from '../types';

// Export version
export { VERSION } from '../version';

// Re-export commonly used functionality
export {
  // Helper functions for video processing
  // These would be extracted from the hooks for standalone use
} from './videoProcessor';

export {
  // Helper functions for subtitle extraction
  // These would be extracted from the hooks for standalone use
} from './subtitleExtractor';

// Default export
export { VideoMetadataExtractor } from './VideoMetadataExtractor';