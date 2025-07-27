/**
 * Application constants for video metadata extraction
 * Centralizes all configuration values to eliminate duplication and magic numbers
 */

export const PROCESSING_CONSTANTS = {
  /**
   * Chunk sizes for different processing modes (in bytes)
   */
  CHUNK_SIZES: {
    /** Complete file processing chunk size: 500MB */
    COMPLETE_FILE: 500 * 1024 * 1024,
    /** Quick extraction chunk size: 64MB */
    QUICK_EXTRACTION: 64 * 1024 * 1024,
    /** Download chunk size: 100MB */
    DOWNLOAD: 100 * 1024 * 1024,
    /** Small file threshold: 32MB */
    SMALL_FILE_THRESHOLD: 32 * 1024 * 1024,
    /** MKV metadata extraction chunk size: 10MB */
    MKV_METADATA_CHUNK: 10 * 1024 * 1024
  },

  /**
   * Timeout configurations (in milliseconds)
   */
  TIMEOUTS: {
    /** File write operation timeout: 30 seconds */
    FILE_WRITE: 30000,
    /** FFmpeg execution timeout: 60 seconds */
    FFMPEG_EXECUTION: 60000,
    /** Cleanup operation timeout: 500ms */
    CLEANUP: 500,
    /** Progressive extraction timeout per chunk: 30 seconds */
    PROGRESSIVE_CHUNK: 30000
  },

  /**
   * Processing limits and thresholds
   */
  LIMITS: {
    /** Maximum blob size before using chunked download: 2GB */
    MAX_BLOB_SIZE: 2 * 1024 * 1024 * 1024,
    /** Maximum number of progressive chunks for large files */
    MAX_PROGRESSIVE_CHUNKS: 10,
    /** Large file threshold for special processing: 5GB */
    LARGE_FILE_THRESHOLD: 5 * 1024 * 1024 * 1024,
    /** Very large file threshold: 1GB */
    VERY_LARGE_FILE_THRESHOLD: 1024 * 1024 * 1024
  },

  /**
   * Retry configurations
   */
  RETRY: {
    /** Maximum number of retry attempts */
    MAX_ATTEMPTS: 3,
    /** Base delay between retries in milliseconds */
    BASE_DELAY: 100,
    /** File write retry attempts */
    FILE_WRITE_ATTEMPTS: 3
  }
} as const;

export const UI_CONSTANTS = {
  /**
   * UI update delays and timing
   */
  DELAYS: {
    /** Progress bar update interval: 100ms */
    PROGRESS_UPDATE: 100,
    /** Batch processing completion display: 3 seconds */
    BATCH_COMPLETION_DISPLAY: 3000,
    /** Cleanup status display: 2 seconds */
    CLEANUP_DISPLAY: 2000,
    /** UI blocking prevention during chunking */
    CHUNK_UI_DELAY: 10
  },

  /**
   * Batch processing configurations
   */
  BATCH_PROCESSING: {
    /** Timeout between batch operations: 60 seconds */
    OPERATION_TIMEOUT: 60000,
    /** Delay between batch items: 200ms */
    ITEM_DELAY: 200,
    /** Progress update frequency for batch operations */
    PROGRESS_UPDATE_FREQUENCY: 5
  },

  /**
   * Preview and display limits
   */
  DISPLAY: {
    /** Maximum characters for subtitle preview */
    SUBTITLE_PREVIEW_LENGTH: 200,
    /** Maximum items to show in lists */
    MAX_LIST_ITEMS: 100
  }
} as const;

/**
 * Supported video file formats
 * Centralized list to eliminate duplication across files
 */
export const SUPPORTED_FORMATS = {
  /**
   * Video container formats
   */
  VIDEO: [
    // QuickTime/MOV family
    'mp4', 'm4v', 'mov', '3gp', '3g2', 'mj2',
    // AVI
    'avi',
    // Matroska/WebM
    'mkv', 'webm',
    // Flash Video
    'flv',
    // Windows Media
    'asf', 'wmv',
    // MPEG formats
    'mpg', 'mpeg', 'ts', 'm2ts',
    // Ogg
    'ogv', 'ogg',
    // Other formats
    'gif', 'swf', 'rm', 'rmvb', 'dv', 'mxf', 'nut', 'nuv',
    // Streaming formats
    'roq', 'nsv', 'wtv', 'ty', 'pva', 'ivf', 'yuv', 'r3d'
  ],

  /**
   * Audio formats that may contain video streams
   */
  AUDIO: [
    'aac', 'mp3', 'flac', 'wav', 'wv', 'ape', 'mpc', 'tta', 'tak',
    'au', 'caf', 'w64', 'voc', 'aiff', 'gsm', 'amr', 'ac3', 'eac3',
    'dts', 'dtshd', 'truehd', 'mlp', 'opus', 'vorbis', 'spx'
  ],

  /**
   * Subtitle formats
   */
  SUBTITLE: ['srt', 'ass', 'vtt', 'sub', 'ssa', 'webvtt'],

  /**
   * Get all supported formats as a single array
   */
  get ALL() {
    return [...this.VIDEO, ...this.AUDIO];
  }
} as const;

/**
 * Language code mapping for subtitle filename generation
 * ISO 639-1/639-2 language codes mapped to standardized 2-letter codes
 */
export const LANGUAGE_CODES = {
  // English
  'eng': 'en', 'english': 'en',
  // Spanish
  'spa': 'es', 'spanish': 'es',
  // French
  'fre': 'fr', 'french': 'fr',
  // German
  'ger': 'de', 'german': 'de',
  // Italian
  'ita': 'it', 'italian': 'it',
  // Portuguese
  'por': 'pt', 'portuguese': 'pt',
  // Russian
  'rus': 'ru', 'russian': 'ru',
  // Japanese
  'jpn': 'ja', 'japanese': 'ja',
  // Chinese
  'chi': 'zh', 'chinese': 'zh',
  // Korean
  'kor': 'ko', 'korean': 'ko',
  // Arabic
  'ara': 'ar', 'arabic': 'ar',
  // Dutch
  'dut': 'nl', 'dutch': 'nl',
  // Swedish
  'swe': 'sv', 'swedish': 'sv',
  // Norwegian
  'nor': 'no', 'norwegian': 'no',
  // Danish
  'dan': 'da', 'danish': 'da',
  // Finnish
  'fin': 'fi', 'finnish': 'fi',
  // Polish
  'pol': 'pl', 'polish': 'pl',
  // Czech
  'cze': 'cs', 'czech': 'cs',
  // Hungarian
  'hun': 'hu', 'hungarian': 'hu',
  // Greek
  'gre': 'el', 'greek': 'el',
  // Turkish
  'tur': 'tr', 'turkish': 'tr',
  // Hebrew
  'heb': 'he', 'hebrew': 'he',
  // Thai
  'tha': 'th', 'thai': 'th',
  // Vietnamese
  'vie': 'vi', 'vietnamese': 'vi',
  // Hindi
  'hin': 'hi', 'hindi': 'hi',
  // Unknown/undefined
  'und': 'unknown', 'unknown': 'unknown'
} as const;

/**
 * FFmpeg-related constants
 */
export const FFMPEG_CONSTANTS = {
  /**
   * FFmpeg core URLs
   */
  CORE_URLS: {
    BASE: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm',
    get CORE_JS() { return `${this.BASE}/ffmpeg-core.js`; },
    get WASM() { return `${this.BASE}/ffmpeg-core.wasm`; }
  },

  /**
   * Temporary file names used in FFmpeg virtual filesystem
   */
  TEMP_FILES: {
    INPUT: 'input.video',
    OUTPUT: 'output.video',
    SUBTITLE_SRT: 'subtitle.srt',
    SUBTITLE_ASS: 'subtitle.ass',
    SUBTITLE_VTT: 'subtitle.vtt'
  },

  /**
   * System directories to preserve during cleanup
   */
  SYSTEM_DIRS: new Set(['.', '..', 'tmp', 'home', 'dev', 'proc', 'usr', 'bin', 'etc', 'var', 'lib']),

  /**
   * Default codec parameters
   */
  CODECS: {
    VIDEO: {
      DEFAULT: 'libx264',
      PRESET: 'fast',
      CRF: '23'
    },
    AUDIO: {
      DEFAULT: 'aac',
      BITRATE: '128k'
    },
    SUBTITLE: {
      DEFAULT: 'srt',
      ENCODING: 'UTF-8'
    }
  }
} as const;

/**
 * Error message templates
 */
export const ERROR_MESSAGES = {
  FFMPEG: {
    INIT_FAILED: 'Failed to initialize FFmpeg',
    EXECUTION_FAILED: 'FFmpeg execution failed',
    FILE_WRITE_FAILED: 'Failed to write file to FFmpeg virtual filesystem',
    FILE_READ_FAILED: 'Failed to read file from FFmpeg virtual filesystem',
    TIMEOUT: 'FFmpeg operation timed out'
  },
  FILE: {
    EMPTY: 'File appears to be empty',
    CORRUPTED: 'File appears to be corrupted or not a valid media file',
    UNSUPPORTED_FORMAT: 'Unsupported file format',
    TOO_LARGE: 'File size exceeds processing limits',
    READ_FAILED: 'Failed to read file'
  },
  SUBTITLE: {
    NO_TRACKS: 'No subtitle tracks found in this file',
    EXTRACTION_FAILED: 'Failed to extract subtitle',
    INVALID_STREAM: 'Invalid subtitle stream index',
    EMPTY_RESULT: 'No subtitle data could be extracted'
  },
  NETWORK: {
    CONNECTION_FAILED: 'Network connection failed',
    CORS_ERROR: 'CORS error occurred',
    FETCH_FAILED: 'Failed to fetch resource'
  }
} as const;

/**
 * Type guard functions for constants
 */
export const isValidFormat = (format: string): format is keyof typeof LANGUAGE_CODES => {
  return format.toLowerCase() in LANGUAGE_CODES;
};

export const isSupportedVideoFormat = (extension: string): boolean => {
  return SUPPORTED_FORMATS.VIDEO.includes(extension.toLowerCase() as any);
};

export const isSupportedAudioFormat = (extension: string): boolean => {
  return SUPPORTED_FORMATS.AUDIO.includes(extension.toLowerCase() as any);
};

export const isSupportedFormat = (extension: string): boolean => {
  return SUPPORTED_FORMATS.ALL.includes(extension.toLowerCase() as any);
};