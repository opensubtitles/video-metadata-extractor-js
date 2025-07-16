import { useState, useCallback } from 'react';
import * as MP4Box from 'mp4box';
import { VideoMetadata, ProgressState, ErrorState } from '../types';

export const useMP4BoxMetadata = () => {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    isVisible: false,
    progress: 0,
    text: ''
  });
  const [error, setError] = useState<ErrorState>({
    isVisible: false,
    message: ''
  });

  const showProgress = useCallback((text: string) => {
    setProgress({ isVisible: true, progress: 0, text });
  }, []);

  const hideProgress = useCallback(() => {
    setProgress({ isVisible: false, progress: 0, text: '' });
  }, []);

  const showError = useCallback((message: string) => {
    setError({ isVisible: true, message });
  }, []);

  const hideError = useCallback(() => {
    setError({ isVisible: false, message: '' });
  }, []);

  const extractMetadataWithMP4Box = useCallback(async (file: File): Promise<VideoMetadata | null> => {
    return new Promise((resolve, reject) => {
      showProgress('Initializing MP4Box...');
      
      const mp4boxfile = MP4Box.createFile();
      
      mp4boxfile.onError = (error: any) => {
        console.error('MP4Box error:', error);
        reject(new Error(`MP4Box parsing error: ${error.message || 'Unknown error'}`));
      };

      mp4boxfile.onReady = (info: any) => {
        
        try {
          // Convert MP4Box info to our VideoMetadata format
          const videoMetadata: VideoMetadata = {
            format: {
              filename: file.name,
              size: file.size.toString(),
              format_name: 'mp4',
              duration: info.duration ? (info.duration / info.timescale).toString() : 'unknown',
              bit_rate: info.bitrate ? info.bitrate.toString() : 'unknown',
              fps: 'unknown', // Will be calculated from video track
              movietimems: info.duration ? ((info.duration / info.timescale) * 1000).toString() : 'unknown',
              movieframes: 'unknown' // Will be calculated from video track
            },
            streams: []
          };

          // Process video and audio tracks
          info.tracks.forEach((track: any) => {
            if (track.type === 'video') {
              const fps = track.movie_timescale && track.movie_duration ? 
                (track.movie_timescale / track.movie_duration * track.nb_samples).toFixed(2) : 'unknown';
              
              const totalFrames = track.nb_samples || 'unknown';
              
              // Update format with video-specific info
              if (videoMetadata.format) {
                videoMetadata.format.fps = fps;
                videoMetadata.format.movieframes = totalFrames.toString();
              }
              
              videoMetadata.streams?.push({
                codec_type: 'video',
                codec_name: track.codec || 'unknown',
                width: track.track_width || 0,
                height: track.track_height || 0,
                r_frame_rate: fps !== 'unknown' ? `${fps}/1` : 'unknown',
                pix_fmt: 'unknown', // MP4Box doesn't provide this directly
                bit_rate: track.bitrate ? track.bitrate.toString() : 'unknown',
                profile: track.avc?.profile_string || 'unknown'
              });
            } else if (track.type === 'audio') {
              videoMetadata.streams?.push({
                codec_type: 'audio',
                codec_name: track.codec || 'unknown',
                channels: track.audio?.channel_count || 2,
                sample_rate: track.audio?.sample_rate?.toString() || '48000',
                bit_rate: track.bitrate ? track.bitrate.toString() : 'unknown'
              });
            }
          });

          resolve(videoMetadata);
        } catch (parseError) {
          console.error('Error parsing MP4Box info:', parseError);
          reject(new Error(`Failed to parse MP4Box info: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
        }
      };

      // Read the file and feed it to MP4Box
      const reader = new FileReader();
      reader.onload = function(e) {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (arrayBuffer) {
          showProgress('Parsing MP4 structure...');
          
          // MP4Box expects the buffer to have fileStart property
          const buffer = arrayBuffer as ArrayBuffer & { fileStart: number };
          buffer.fileStart = 0;
          
          try {
            mp4boxfile.appendBuffer(buffer);
            mp4boxfile.flush();
          } catch (appendError) {
            console.error('Error appending buffer to MP4Box:', appendError);
            reject(new Error(`Failed to process file with MP4Box: ${appendError instanceof Error ? appendError.message : 'Unknown error'}`));
          }
        } else {
          reject(new Error('Failed to read file'));
        }
      };

      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };

      reader.readAsArrayBuffer(file);
    });
  }, [showProgress]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    hideError();
    setMetadata(null);

    try {
      const result = await extractMetadataWithMP4Box(file);
      setMetadata(result);
      hideProgress();
    } catch (err) {
      console.error('MP4Box processing error:', err);
      
      let errorMessage: string;
      if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Unknown error occurred while processing the video with MP4Box';
      }
      
      showError(errorMessage);
      hideProgress();
    }
  }, [extractMetadataWithMP4Box, hideError, showError, hideProgress]);

  return {
    metadata,
    progress,
    error,
    handleFileSelect,
    hideError,
    isLoaded: true // MP4Box doesn't need loading like FFmpeg
  };
};