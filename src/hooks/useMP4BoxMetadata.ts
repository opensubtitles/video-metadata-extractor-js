import { useState, useCallback } from 'react';
import * as MP4Box from 'mp4box';
import { VideoMetadata, ProgressState, ErrorState } from '../types';

// Helper function for downloading large files (>2GB) that exceed browser Blob limits
const downloadLargeFile = (data: Uint8Array, filename: string, progressCallback?: (progress: number) => void): void => {
  const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
  const MAX_BLOB_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit
  
  // If file is smaller than 2GB, use normal blob download
  if (data.length < MAX_BLOB_SIZE) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  
  // Create a download stream
  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      const pump = () => {
        if (offset < data.length) {
          const chunk = data.slice(offset, Math.min(offset + CHUNK_SIZE, data.length));
          controller.enqueue(chunk);
          offset += chunk.length;
          
          // Report progress
          if (progressCallback) {
            progressCallback((offset / data.length) * 100);
          }
          
          // Continue with next chunk
          setTimeout(pump, 0);
        } else {
          controller.close();
        }
      };
      pump();
    }
  });
  
  // Create response from stream and trigger download
  const response = new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': data.length.toString()
    }
  });
  
  response.blob().then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }).catch(error => {
    console.error(`[MP4Box Large File Download] Failed to download ${filename}:`, error);
  });
};

// Helper function to generate subtitle filename based on movie name
const generateSubtitleFilename = (movieFilename: string, language?: string, isForced?: boolean, codecName?: string): { filename: string; extension: string } => {
  // Remove extension from movie filename
  const nameWithoutExt = movieFilename.replace(/\.[^/.]+$/, '');
  
  // Map language codes to standard 2-letter codes
  const languageMap: { [key: string]: string } = {
    'eng': 'en',
    'english': 'en',
    'spa': 'es',
    'spanish': 'es',
    'fre': 'fr',
    'french': 'fr',
    'ger': 'de',
    'german': 'de',
    'ita': 'it',
    'italian': 'it',
    'por': 'pt',
    'portuguese': 'pt',
    'rus': 'ru',
    'russian': 'ru',
    'jpn': 'ja',
    'japanese': 'ja',
    'chi': 'zh',
    'chinese': 'zh',
    'kor': 'ko',
    'korean': 'ko',
    'ara': 'ar',
    'arabic': 'ar',
    'dut': 'nl',
    'dutch': 'nl',
    'swe': 'sv',
    'swedish': 'sv',
    'nor': 'no',
    'norwegian': 'no',
    'dan': 'da',
    'danish': 'da',
    'fin': 'fi',
    'finnish': 'fi',
    'pol': 'pl',
    'polish': 'pl',
    'cze': 'cs',
    'czech': 'cs',
    'hun': 'hu',
    'hungarian': 'hu',
    'gre': 'el',
    'greek': 'el',
    'tur': 'tr',
    'turkish': 'tr',
    'heb': 'he',
    'hebrew': 'he',
    'tha': 'th',
    'thai': 'th',
    'vie': 'vi',
    'vietnamese': 'vi',
    'hin': 'hi',
    'hindi': 'hi',
    'und': 'unknown',
    'unknown': 'unknown'
  };
  
  // Get standardized language code
  const langCode = language ? (languageMap[language.toLowerCase()] || language.toLowerCase()) : 'unknown';
  
  // Determine file extension based on codec
  let extension = 'srt'; // Default to SRT
  if (codecName) {
    const codec = codecName.toLowerCase();
    if (codec.includes('ass') || codec.includes('ssa')) {
      extension = 'ass';
    } else if (codec.includes('vtt') || codec.includes('webvtt')) {
      extension = 'vtt';
    } else if (codec.includes('srt') || codec.includes('subrip')) {
      extension = 'srt';
    } else if (codec.includes('dvd') || codec.includes('vobsub')) {
      extension = 'srt'; // Convert DVD subtitles to SRT
    }
  }
  
  // Build filename: MovieName.lang[.forced].ext
  let filename = `${nameWithoutExt}.${langCode}`;
  if (isForced) {
    filename += '.forced';
  }
  filename += `.${extension}`;
  
  return { filename, extension };
};

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

  const showProgress = useCallback((text: string, progressPercent: number = 0) => {
    setProgress({ isVisible: true, progress: progressPercent, text });
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

          // Process video, audio, and subtitle tracks
          info.tracks.forEach((track: any, index: number) => {
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
                index: index,
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
                index: index,
                codec_type: 'audio',
                codec_name: track.codec || 'unknown',
                channels: track.audio?.channel_count || 2,
                sample_rate: track.audio?.sample_rate?.toString() || '48000',
                bit_rate: track.bitrate ? track.bitrate.toString() : 'unknown'
              });
            } else if (track.type === 'text') {
              // Subtitle/text track
              videoMetadata.streams?.push({
                index: index,
                codec_type: 'subtitle',
                codec_name: track.codec || 'unknown',
                language: track.language || 'unknown',
                default: track.default || false,
                forced: track.forced || false
              });
            }
          });

          resolve(videoMetadata);
        } catch (parseError) {
          console.error('Error parsing MP4Box info:', parseError);
          reject(new Error(`Failed to parse MP4Box info: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
        }
      };

      // For large files, read only the first chunk needed for metadata
      const fileSize = file.size;
      const maxChunkSize = 50 * 1024 * 1024; // 50MB max for MP4Box metadata parsing
      const fileData = fileSize > maxChunkSize ? file.slice(0, maxChunkSize) : file;
      
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

      reader.readAsArrayBuffer(fileData);
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

  const extractSubtitle = useCallback(async (file: File, streamIndex: number, language?: string, codecName?: string, isForced?: boolean) => {
    try {
      showProgress(`Extracting subtitle track ${streamIndex}...`);
      
      return new Promise<void>((resolve, reject) => {
        const mp4boxfile = MP4Box.createFile();
        let subtitleTrack: any = null;
        let extractedData = '';
        
        mp4boxfile.onError = (error: any) => {
          reject(new Error(`MP4Box extraction error: ${error.message || 'Unknown error'}`));
        };
        
        // Find the subtitle track by index
        mp4boxfile.onReady = (info: any) => {
          try {
            const tracks = info.tracks || [];
            
            // Find text/subtitle track matching the stream index
            const textTracks = tracks.filter((track: any) => track.type === 'text');
            subtitleTrack = textTracks[streamIndex];
            
            if (!subtitleTrack) {
              reject(new Error(`Subtitle track ${streamIndex} not found`));
              return;
            }
            
            // Set extraction options for this track
            mp4boxfile.setExtractionOptions(subtitleTrack.id, null, {
              nbSamples: 1000 // Extract more samples to get complete subtitle
            });
            
            mp4boxfile.start();
          } catch (err) {
            reject(err);
          }
        };
        
        mp4boxfile.onSamples = (id: number, _user: any, samples: any[]) => {
          if (id === subtitleTrack?.id) {
            samples.forEach((sample: any) => {
              try {
                // Convert sample data to text
                const decoder = new TextDecoder('utf-8');
                const subtitleText = decoder.decode(sample.data);
                
                // Add timing information if available
                if (sample.cts !== undefined) {
                  const startTime = sample.cts / subtitleTrack.timescale;
                  const endTime = (sample.cts + sample.duration) / subtitleTrack.timescale;
                  
                  // Format as SRT
                  const startTimeSRT = formatTimeToSRT(startTime);
                  const endTimeSRT = formatTimeToSRT(endTime);
                  
                  const srtEntry = `${samples.indexOf(sample) + 1}\n${startTimeSRT} --> ${endTimeSRT}\n${subtitleText}\n\n`;
                  extractedData += srtEntry;
                } else {
                  extractedData += subtitleText + '\n';
                }
              } catch (decodeError) {
                console.warn('Failed to decode subtitle sample:', decodeError);
              }
            });
          }
        };
        
        // Process the file (use chunked reading for large files)
        const fileSize = file.size;
        const maxChunkSize = 100 * 1024 * 1024; // 100MB max for subtitle extraction
        const fileData = fileSize > maxChunkSize ? file.slice(0, maxChunkSize) : file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          // Convert to the format MP4Box expects
          const buffer = arrayBuffer.slice(0) as any;
          buffer.fileStart = 0;
          
          mp4boxfile.appendBuffer(buffer);
          mp4boxfile.flush();
          
          // Wait for processing to complete
          setTimeout(() => {
            if (extractedData) {
              // Generate proper filename based on movie name
              const { filename: outputFilename } = generateSubtitleFilename(
                file.name, 
                language, 
                isForced, 
                codecName
              );
              const blob = new Blob([extractedData], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = outputFilename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              
              hideProgress();
              resolve();
            } else {
              reject(new Error('No subtitle data extracted'));
            }
          }, 2000); // Give more time for processing
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(fileData);
      });
      
    } catch (err) {
      console.error('MP4Box subtitle extraction error:', err);
      
      let errorMessage = 'Failed to extract subtitle with MP4Box';
      if (err instanceof Error) {
        errorMessage = `Failed to extract subtitle: ${err.message}`;
      }
      
      showError(errorMessage);
      hideProgress();
    }
  }, [showProgress, hideProgress, showError]);
  
  // Helper function to format time to SRT format
  const formatTimeToSRT = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  };

  const extractStream = useCallback(async (file: File, streamIndex: number, streamType: string, codecName?: string) => {
    const startTime = performance.now();

    try {
      showProgress(`Preparing ${streamType} stream ${streamIndex}...`, 10);
      
      return new Promise<void>((resolve, reject) => {
        const mp4boxfile = MP4Box.createFile();
        let targetTrack: any = null;
        let extractedData: Uint8Array[] = [];
        let sampleCount = 0;
        
        mp4boxfile.onError = (error: any) => {
          reject(new Error(`MP4Box stream extraction error: ${error.message || 'Unknown error'}`));
        };
        
        mp4boxfile.onReady = (info: any) => {
          try {
            const tracks = info.tracks || [];
            
            showProgress(`Analyzing ${streamType} tracks...`, 25);
            
            // Find the target track by type and index
            const typeTracks = tracks.filter((track: any) => track.type === streamType);
            
            // Use streamIndex to find the correct track within the type
            targetTrack = typeTracks[streamIndex];
            
            if (!targetTrack) {
              targetTrack = tracks.find((track: any) => track.id === streamIndex + 1);
            }
            
            if (!targetTrack) {
              reject(new Error(`${streamType} stream ${streamIndex} not found`));
              return;
            }
            
            if (targetTrack.type !== streamType) {
              reject(new Error(`Track ${streamIndex} is not a ${streamType} stream`));
              return;
            }
            
            showProgress(`Extracting ${streamType} stream data...`, 50);
            
            // Set extraction options for this track
            mp4boxfile.setExtractionOptions(targetTrack.id, null, {
              nbSamples: 10000 // Extract many samples to get complete stream
            });
            
            mp4boxfile.start();
          } catch (err) {
            reject(err);
          }
        };
        
        mp4boxfile.onSamples = (id: number, _user: any, samples: any[]) => {
          if (id === targetTrack?.id) {
            samples.forEach((sample: any) => {
              if (sample.data) {
                extractedData.push(new Uint8Array(sample.data));
                sampleCount++;
              }
            });
            
            if (sampleCount % 100 === 0) {
              const progress = Math.min(50 + (sampleCount / 10000) * 25, 75);
              showProgress(`Extracting ${streamType} stream (${sampleCount} samples)...`, progress);
            }
          }
        };
        
        // Process the file (use full file for stream extraction to ensure complete streams)
        const fileSize = file.size;
        const maxChunkSize = 200 * 1024 * 1024; // 200MB max for stream extraction
        const fileData = fileSize > maxChunkSize ? file : file; // Use full file for streams
        
        const reader = new FileReader();
        reader.onload = (e) => {
          const loadStartTime = performance.now();
          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          showProgress(`Loading ${streamType} stream into MP4Box...`, 35);
          
          const buffer = arrayBuffer.slice(0) as any;
          buffer.fileStart = 0;
          
          mp4boxfile.appendBuffer(buffer);
          mp4boxfile.flush();
          
          // Wait for processing to complete
          setTimeout(() => {
            
            if (extractedData.length > 0) {
              showProgress(`Preparing ${streamType} stream download...`, 80);
              
              // Combine all extracted data
              const combineStartTime = performance.now();
              const totalLength = extractedData.reduce((sum, arr) => sum + arr.length, 0);
              const combinedData = new Uint8Array(totalLength);
              let offset = 0;
              
              for (const chunk of extractedData) {
                combinedData.set(chunk, offset);
                offset += chunk.length;
              }
              
              // Determine file extension based on codec
              let fileExt = 'bin';
              if (streamType === 'video') {
                if (codecName?.toLowerCase().includes('h264') || codecName?.toLowerCase().includes('avc')) {
                  fileExt = 'h264';
                } else if (codecName?.toLowerCase().includes('h265') || codecName?.toLowerCase().includes('hevc')) {
                  fileExt = 'h265';
                } else {
                  fileExt = 'mp4';
                }
              } else if (streamType === 'audio') {
                if (codecName?.toLowerCase().includes('aac')) {
                  fileExt = 'aac';
                } else if (codecName?.toLowerCase().includes('mp3')) {
                  fileExt = 'mp3';
                } else {
                  fileExt = 'aac';
                }
              }
              
              // Create download
              const outputFilename = `${streamType}_stream_${streamIndex}.${fileExt}`;
              
              // Use smart download function that handles large files (>2GB)
              downloadLargeFile(combinedData, outputFilename, (progress) => {
                if (progress % 10 === 0) { // Update every 10%
                  showProgress(`Downloading ${streamType} stream (${progress.toFixed(1)}%)...`, 90 + (progress / 10));
                }
              });
              
              const totalTime = performance.now() - startTime;
              
              // Show completion message and let user manually close
              showProgress(`${streamType} stream extraction completed successfully! Download should start automatically.`, 100);
              resolve();
            } else {
              reject(new Error('No stream data extracted'));
            }
          }, 3000); // Give more time for processing
        };
        
        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };
        
        reader.readAsArrayBuffer(fileData);
      });
      
    } catch (err) {
      const totalTime = performance.now() - startTime;
      
      let errorMessage = 'Failed to extract stream with MP4Box';
      if (err instanceof Error) {
        errorMessage = `Failed to extract stream: ${err.message}`;
      }
      
      showError(errorMessage);
      hideProgress();
    }
  }, [showProgress, hideProgress, showError]);

  return {
    metadata,
    progress,
    error,
    handleFileSelect,
    hideError,
    hideProgress,
    showProgress,
    isLoaded: true, // MP4Box doesn't need loading like FFmpeg
    extractSubtitle,
    extractStream
  };
};