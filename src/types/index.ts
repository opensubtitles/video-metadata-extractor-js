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
    pix_fmt?: string;
    bit_rate?: string;
    sample_rate?: string;
    channels?: number;
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