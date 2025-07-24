/**
 * Utility functions for video metadata extraction and subtitle processing
 */

/**
 * Helper function to get file format from filename
 */
export const getFormatFromFileName = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension || 'unknown';
};

/**
 * Helper function to generate subtitle filename based on movie name
 */
export const generateSubtitleFilename = (
  movieFilename: string, 
  language?: string, 
  isForced?: boolean, 
  codecName?: string
): { filename: string; extension: string } => {
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

/**
 * Helper function to safely decode data for preview
 */
export const safeDecodePreview = (data: Uint8Array | string, maxLength: number = 200): string => {
  if (typeof data === 'string') {
    return data.slice(0, maxLength);
  }
  const previewData = data.slice(0, Math.min(maxLength, data.length));
  return new TextDecoder().decode(previewData);
};

/**
 * Helper function to create complete file data using streaming chunks for 100% subtitle extraction
 * Uses unified chunked strategy for all file sizes to keep implementation simple and consistent
 */
export const createCompleteFileDataInChunks = async (file: File): Promise<Blob> => {
  const fileSize = file.size;
  const fileSizeMB = Math.round(fileSize / 1024 / 1024);
  
  console.log(`[COMPLETE CHUNKED READING] Processing entire file (${fileSizeMB}MB) using unified chunked strategy`);
  
  // Use 500MB chunks for all files to maintain consistent memory usage and simplify logic
  const chunkSize = 500 * 1024 * 1024; // 500MB chunks
  const chunks: Blob[] = [];
  const totalChunks = Math.ceil(fileSize / chunkSize);
  
  console.log(`[COMPLETE CHUNKED READING] Creating ${totalChunks} chunks of up to 500MB each`);
  
  for (let offset = 0; offset < fileSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, fileSize);
    const chunk = file.slice(offset, end);
    chunks.push(chunk);
    
    const chunkNumber = Math.floor(offset / chunkSize) + 1;
    const progress = Math.round((chunkNumber / totalChunks) * 100);
    console.log(`[COMPLETE CHUNKED READING] Created chunk ${chunkNumber}/${totalChunks} (${Math.round((end - offset) / 1024 / 1024)}MB) - ${progress}% complete`);
    
    // Add small delay to prevent UI blocking during chunking for large files
    if (chunkNumber % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  // Combine all chunks into a single blob representing the complete file
  const completeFile = new Blob(chunks, { type: file.type });
  
  console.log(`[COMPLETE CHUNKED READING] Combined ${chunks.length} chunks into complete file blob (${Math.round(completeFile.size / 1024 / 1024)}MB)`);
  console.log(`[COMPLETE CHUNKED READING] Unified chunked strategy ensures consistent performance for any file size`);
  
  return completeFile;
};

/**
 * Helper function to handle large file downloads (> 2GB blob limit)
 */
export const downloadLargeFile = (
  data: Uint8Array, 
  filename: string, 
  progressCallback?: (progress: number) => void
): void => {
  const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
  const MAX_BLOB_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit
  
  console.log(`[Large File Download] Starting download for ${filename}, size: ${data.length} bytes`);
  
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
    console.log(`[Large File Download] Normal blob download completed for ${filename}`);
    return;
  }
  
  // For files > 2GB, use chunked download via streams
  console.log(`[Large File Download] Using chunked download for ${filename} (${data.length} bytes)`);
  
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
  const response = new Response(stream);
  response.blob().then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[Large File Download] Chunked download completed for ${filename}`);
  }).catch(error => {
    console.error(`[Large File Download] Chunked download failed:`, error);
    throw error;
  });
};

/**
 * Validate file extension against supported formats
 */
export const validateFileExtension = (filename: string): { isValid: boolean; extension: string } => {
  const validExtensions = [
    // Common video formats
    'mp4', 'm4v', 'mov', '3gp', '3g2', 'mj2',  // QuickTime/MOV family
    'avi',                                      // AVI
    'mkv', 'webm',                             // Matroska/WebM
    'flv',                                     // Flash Video
    'asf', 'wmv',                              // Windows Media
    'mpg', 'mpeg', 'ts', 'm2ts',              // MPEG formats
    'ogv', 'ogg',                              // Ogg
    'gif',                                     // GIF
    'swf',                                     // SWF
    'rm', 'rmvb',                              // RealMedia
    'dv',                                      // DV
    'mxf',                                     // MXF
    'nut',                                     // NUT
    'nuv',                                     // NuppelVideo
    'roq',                                     // id RoQ
    'nsv',                                     // Nullsoft Streaming Video
    'wtv',                                     // Windows Television
    'ty',                                      // TiVo
    'pva',                                     // TechnoTrend PVA
    'ivf',                                     // On2 IVF
    'yuv',                                     // YUV4MPEG
    'r3d',                                     // REDCODE R3D
    
    // Audio formats that may contain video
    'aac', 'mp3', 'flac', 'wav', 'wv', 'ape', 'mpc', 'tta', 'tak',
    'au', 'caf', 'w64', 'voc', 'aiff', 'gsm', 'amr', 'ac3', 'eac3',
    'dts', 'dtshd', 'truehd', 'mlp', 'opus', 'vorbis', 'spx'
  ];
  
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  return {
    isValid: validExtensions.includes(extension),
    extension
  };
};