export interface VideoMetadata {
  format?: {
    filename: string;
    format_name: string;
    duration: string;
    size: string;
    bit_rate: string;
    fps: string;
    movietimems: string;
    movieframes: string;
  };
  streams?: Array<{
    codec_type: string;
    codec_name: string;
    profile?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    pix_fmt?: string;
    bit_rate?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    duration?: string;
    nb_frames?: string;
    level?: string;
    codec_tag?: string;
    codec_tag_string?: string;
    codec_long_name?: string;
    // Subtitle-specific properties
    language?: string;
    title?: string;
    forced?: boolean;
    default?: boolean;
    index?: number;
    // Additional metadata fields
    [key: string]: any;
  }>;
}

export interface ProgressState {
  isVisible: boolean;
  progress: number;
  text: string;
}

export interface ErrorState {
  isVisible: boolean;
  message: string;
}

export type MP4ProcessingStrategy = 
  | 'chunks-32mb-dual'     // Default: 32MB from start + 32MB from end
  | 'whole-file'           // Read entire file