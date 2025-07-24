/**
 * Main VideoMetadataExtractor class for programmatic use
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { VideoMetadata, ProgressState, ErrorState } from '../types';
import JSZip from 'jszip';

export interface ExtractorOptions {
  ffmpegCoreURL?: string;
  ffmpegWasmURL?: string;
  onProgress?: (progress: ProgressState) => void;
  onError?: (error: ErrorState) => void;
}

export class VideoMetadataExtractor {
  private ffmpeg: FFmpeg;
  private isLoaded: boolean = false;
  private options: ExtractorOptions;

  constructor(options: ExtractorOptions = {}) {
    this.options = options;
    this.ffmpeg = new FFmpeg();
    
    // Set up event handlers
    this.ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });
    
    this.ffmpeg.on('progress', ({ progress, time }) => {
      this.options.onProgress?.({
        isVisible: true,
        progress: Math.round(progress * 100),
        text: `Processing... ${Math.round(progress * 100)}%`
      });
    });
  }

  /**
   * Initialize FFmpeg
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const coreURL = this.options.ffmpegCoreURL || `${baseURL}/ffmpeg-core.js`;
      const wasmURL = this.options.ffmpegWasmURL || `${baseURL}/ffmpeg-core.wasm`;

      await this.ffmpeg.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
      });

      this.isLoaded = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize FFmpeg';
      this.options.onError?.({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to initialize FFmpeg: ${errorMessage}`);
    }
  }

  /**
   * Extract metadata from video file
   */
  async extractMetadata(file: File | ArrayBuffer): Promise<VideoMetadata> {
    if (!this.isLoaded) {
      throw new Error('VideoMetadataExtractor not initialized. Call initialize() first.');
    }

    try {
      const fileData = file instanceof File ? await fetchFile(file) : new Uint8Array(file);
      
      await this.ffmpeg.writeFile('input.video', fileData);
      
      await this.ffmpeg.exec([
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-i', 'input.video'
      ]);

      const metadataOutput = await this.ffmpeg.readFile('ffprobe.json') as Uint8Array;
      const metadataText = new TextDecoder().decode(metadataOutput);
      
      await this.ffmpeg.deleteFile('input.video');
      
      return JSON.parse(metadataText) as VideoMetadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract metadata';
      this.options.onError?.({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to extract metadata: ${errorMessage}`);
    }
  }

  /**
   * Extract single subtitle track
   */
  async extractSubtitle(
    file: File | ArrayBuffer, 
    streamIndex: number, 
    options: {
      language?: string;
      codec?: string;
      format?: 'srt' | 'vtt' | 'ass';
    } = {}
  ): Promise<Uint8Array> {
    if (!this.isLoaded) {
      throw new Error('VideoMetadataExtractor not initialized. Call initialize() first.');
    }

    try {
      const fileData = file instanceof File ? await fetchFile(file) : new Uint8Array(file);
      const outputFormat = options.format || 'srt';
      const outputFilename = `subtitle.${outputFormat}`;
      
      await this.ffmpeg.writeFile('input.video', fileData);
      
      await this.ffmpeg.exec([
        '-i', 'input.video',
        '-map', `0:${streamIndex}`,
        '-c:s', outputFormat,
        outputFilename
      ]);

      const subtitleData = await this.ffmpeg.readFile(outputFilename) as Uint8Array;
      
      await this.ffmpeg.deleteFile('input.video');
      await this.ffmpeg.deleteFile(outputFilename);
      
      return subtitleData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract subtitle';
      this.options.onError?.({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to extract subtitle: ${errorMessage}`);
    }
  }

  /**
   * Extract all subtitle tracks as ZIP
   */
  async extractAllSubtitles(
    file: File | ArrayBuffer,
    options: {
      format?: 'srt' | 'vtt' | 'ass';
      filename?: string;
    } = {}
  ): Promise<Uint8Array> {
    if (!this.isLoaded) {
      throw new Error('VideoMetadataExtractor not initialized. Call initialize() first.');
    }

    try {
      // First get metadata to find subtitle streams
      const metadata = await this.extractMetadata(file);
      const subtitleStreams = metadata.streams?.filter(stream => stream.codec_type === 'subtitle') || [];
      
      if (subtitleStreams.length === 0) {
        throw new Error('No subtitle tracks found in the video file');
      }

      const zip = new JSZip();
      const baseFilename = options.filename || 'video';
      const format = options.format || 'srt';

      // Extract each subtitle stream
      for (let i = 0; i < subtitleStreams.length; i++) {
        const stream = subtitleStreams[i];
        const streamIndex = stream.index !== undefined ? stream.index : i;
        
        try {
          const subtitleData = await this.extractSubtitle(file, streamIndex, { format });
          
          // Generate filename with language and track info
          let filename = `${baseFilename}`;
          if (stream.language) filename += `.${stream.language}`;
          if (subtitleStreams.filter(s => s.language === stream.language).length > 1) {
            filename += `.${streamIndex}`;
          }
          filename += `.${format}`;
          
          zip.file(filename, subtitleData);
        } catch (streamError) {
          console.warn(`Failed to extract subtitle stream ${streamIndex}:`, streamError);
          // Continue with other streams
        }
      }

      const zipData = await zip.generateAsync({ type: 'uint8array' });
      return zipData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract all subtitles';
      this.options.onError?.({
        isVisible: true,
        message: errorMessage
      });
      throw new Error(`Failed to extract all subtitles: ${errorMessage}`);
    }
  }

  /**
   * Clean up resources
   */
  async terminate(): Promise<void> {
    if (this.isLoaded) {
      await this.ffmpeg.terminate();
      this.isLoaded = false;
    }
  }
}