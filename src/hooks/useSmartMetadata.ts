import { useState, useCallback } from 'react';
import { useVideoMetadata } from './useVideoMetadata';
import { useMP4BoxMetadata } from './useMP4BoxMetadata';

export const useSmartMetadata = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const ffmpegHook = useVideoMetadata();
  const mp4boxHook = useMP4BoxMetadata();

  const getFileExtension = useCallback((filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || '';
  }, []);

  const shouldUseMp4Box = useCallback((file: File): boolean => {
    const extension = getFileExtension(file.name);
    // MP4Box supports ISO Base Media File Format containers
    return extension === 'mp4' || extension === 'mov' || extension === 'm4v' || 
           extension === '3gp' || extension === '3g2' || extension === 'f4v';
  }, [getFileExtension]);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    
    const useMp4Box = shouldUseMp4Box(file);
    
    if (useMp4Box) {
      await mp4boxHook.handleFileSelect(file);
    } else {
      await ffmpegHook.handleFileSelect(file);
    }
  }, [shouldUseMp4Box, getFileExtension, mp4boxHook, ffmpegHook]);

  // Return the appropriate hook's state based on the selected file
  const currentHook = selectedFile && shouldUseMp4Box(selectedFile) ? mp4boxHook : ffmpegHook;

  return {
    metadata: currentHook.metadata,
    progress: currentHook.progress,
    error: currentHook.error,
    handleFileSelect,
    hideError: currentHook.hideError,
    hideProgress: currentHook.hideProgress,
    showProgress: currentHook.showProgress,
    isLoaded: currentHook.isLoaded,
    selectedFile,
    currentMethod: selectedFile ? (shouldUseMp4Box(selectedFile) ? 'MP4Box' : 'FFmpeg') : 'FFmpeg',
    // Use the appropriate extraction method based on the processing method
    extractSubtitle: currentHook.extractSubtitle,
    extractStream: currentHook.extractStream
  };
};