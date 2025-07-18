import React, { useState, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProgressBar } from './components/ProgressBar';
import { MetadataDisplay } from './components/MetadataDisplay';
import { ErrorDisplay } from './components/ErrorDisplay';
import { useSmartMetadata } from './hooks/useSmartMetadata';
import { VideoMetadata } from './types';

interface FileMetadata {
  file: File;
  metadata: VideoMetadata | null;
  method: string;
  isProcessing: boolean;
  error: string | null;
}

interface BatchProgress {
  isVisible: boolean;
  currentFile: number;
  totalFiles: number;
  fileName: string;
  text: string;
  progress: number;
}

const App: React.FC = () => {
  const { metadata, progress, error, handleFileSelect, hideError, hideProgress, isLoaded, selectedFile, currentMethod, extractSubtitle, extractStream } = useSmartMetadata();
  const [fileMetadataList, setFileMetadataList] = useState<FileMetadata[]>([]);
  const [processingQueue, setProcessingQueue] = useState<File[]>([]);
  const [currentlyProcessing, setCurrentlyProcessing] = useState<File | null>(null);
  const [isProcessingLocked, setIsProcessingLocked] = useState(false);
  const [lastProcessedFile, setLastProcessedFile] = useState<File | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    isVisible: false,
    currentFile: 0,
    totalFiles: 0,
    fileName: '',
    text: '',
    progress: 0
  });

  const onFileSelect = (file: File) => {
    // Single file selection - clear all and process immediately
    setFileMetadataList([]);
    setProcessingQueue([file]);
    setBatchProgress({
      isVisible: false,
      currentFile: 0,
      totalFiles: 0,
      fileName: '',
      text: '',
      progress: 0
    });
  };

  const onMultipleFilesSelect = (files: File[]) => {
    console.log(`[BATCH DEBUG] Starting batch processing with ${files.length} files`);
    
    // Initialize file metadata list
    const initialMetadata: FileMetadata[] = files.map(file => ({
      file,
      metadata: null,
      method: 'Unknown',
      isProcessing: false,
      error: null
    }));
    
    setFileMetadataList(initialMetadata);
    setProcessingQueue(files);
    setLastProcessedFile(null); // Reset last processed file for new batch
    setBatchProgress({
      isVisible: true,
      currentFile: 0,
      totalFiles: files.length,
      fileName: '',
      text: '',
      progress: 0
    });
    
    console.log(`[BATCH DEBUG] Initialized processing queue with ${files.length} files`);
  };

  // Simple sequential processing - only start next file when current is done
  useEffect(() => {
    console.log(`[BATCH DEBUG] Processing check: queue=${processingQueue.length}, current=${currentlyProcessing?.name || 'none'}, locked=${isProcessingLocked}, loaded=${isLoaded}`);
    
    if (processingQueue.length > 0 && !currentlyProcessing && !isProcessingLocked && isLoaded) {
      const nextFile = processingQueue[0];
      if (!nextFile) {
        console.log(`[BATCH DEBUG] No next file found in queue`);
        return;
      }
      
      console.log(`[BATCH DEBUG] Starting to process: ${nextFile.name}`);
      
      // Lock processing and set current file
      setIsProcessingLocked(true);
      setCurrentlyProcessing(nextFile);
      setProcessingQueue(prev => prev.slice(1));
      
      // Calculate overall batch progress
      const totalFiles = fileMetadataList.length;
      const completedFiles = fileMetadataList.filter(item => item.metadata || item.error).length;
      const currentFileIndex = completedFiles + 1;
      const overallProgress = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
      
      console.log(`[BATCH DEBUG] Progress: ${currentFileIndex}/${totalFiles} (${overallProgress}%) - Completed: ${completedFiles}`);
      
      // Update batch progress
      setBatchProgress(prev => ({
        ...prev,
        isVisible: true,
        currentFile: currentFileIndex,
        totalFiles: totalFiles,
        fileName: nextFile.name,
        text: `Processing file ${currentFileIndex} of ${totalFiles}`,
        progress: overallProgress
      }));
      
      // Update processing state
      setFileMetadataList(prev => prev.map(item => 
        item.file === nextFile 
          ? { ...item, isProcessing: true, error: null }
          : item
      ));
      
      // Start processing this file with a longer delay to ensure proper cleanup and memory management
      const fileBeingProcessed: File = nextFile;
      setTimeout(() => {
        console.log(`[BATCH DEBUG] Calling handleFileSelect for: ${fileBeingProcessed.name}`);
        handleFileSelect(fileBeingProcessed);
        
        // Add a timeout to prevent processing from getting stuck
        setTimeout(() => {
          if (currentlyProcessing === fileBeingProcessed && isProcessingLocked) {
            console.log(`[BATCH DEBUG] Processing timeout for: ${fileBeingProcessed.name}`);
            setFileMetadataList(prev => prev.map(item => 
              item.file === fileBeingProcessed 
                ? { ...item, error: 'Processing timeout - file took too long to process', isProcessing: false }
                : item
            ));
            setCurrentlyProcessing(null);
            setIsProcessingLocked(false);
          }
        }, 60000); // 60 second timeout
      }, 3000); // Much longer delay to ensure proper cleanup and memory management between files
    }
  }, [processingQueue, currentlyProcessing, isProcessingLocked, isLoaded, handleFileSelect]);

  // Update metadata when processing completes
  useEffect(() => {
    console.log(`[BATCH DEBUG] Metadata useEffect triggered: currentlyProcessing=${currentlyProcessing?.name || 'none'}, metadata=${metadata ? 'present' : 'null'}, lastProcessed=${lastProcessedFile?.name || 'none'}`);
    
    if (currentlyProcessing && metadata && currentlyProcessing !== lastProcessedFile) {
      console.log(`[BATCH DEBUG] Processing completed for: ${currentlyProcessing.name}`);
      
      // Store current file reference before async operations
      const completedFile = currentlyProcessing;
      setLastProcessedFile(completedFile);
      
      setFileMetadataList(prev => {
        const updated = prev.map(item => 
          item.file === completedFile 
            ? { ...item, metadata, method: currentMethod, isProcessing: false }
            : item
        );
        
        // Calculate overall batch progress
        const totalFiles = updated.length;
        const completedFiles = updated.filter(item => item.metadata || item.error).length;
        const overallProgress = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
        
        console.log(`[BATCH DEBUG] Metadata updated: ${completedFiles}/${totalFiles} completed (${overallProgress}%)`);
        
        // Update batch progress
        setBatchProgress(prevProgress => ({
          ...prevProgress,
          progress: overallProgress,
          text: overallProgress === 100 ? 'All files processed!' : `Processing file ${completedFiles} of ${totalFiles}`
        }));
        
        // If this is the last file, keep progress visible with close button
        if (completedFiles === totalFiles) {
          console.log(`[BATCH DEBUG] All files completed! Final progress: ${overallProgress}%`);
          setBatchProgress(prevProgress => ({
            ...prevProgress,
            progress: 100,
            text: 'All files processed!'
          }));
        }
        
        return updated;
      });
      
      // Longer delay to ensure state is fully updated and cleanup is complete before unlocking
      setTimeout(() => {
        console.log(`[BATCH DEBUG] Unlocking processing after completion of: ${completedFile.name}`);
        setCurrentlyProcessing(null);
        setIsProcessingLocked(false); // Unlock processing for next file
      }, 2000); // Increased delay to allow for proper cleanup
    }
  }, [metadata, currentlyProcessing, currentMethod, lastProcessedFile]);

  // Handle errors
  useEffect(() => {
    if (currentlyProcessing && error.isVisible) {
      console.log(`[BATCH DEBUG] Processing error for: ${currentlyProcessing.name} - ${error.message}`);
      
      setFileMetadataList(prev => {
        const updated = prev.map(item => 
          item.file === currentlyProcessing 
            ? { ...item, error: error.message, isProcessing: false }
            : item
        );
        
        // Calculate overall batch progress
        const totalFiles = updated.length;
        const completedFiles = updated.filter(item => item.metadata || item.error).length;
        const overallProgress = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
        
        console.log(`[BATCH DEBUG] Error handled: ${completedFiles}/${totalFiles} completed (${overallProgress}%)`);
        
        // Update batch progress for error
        setBatchProgress(prevProgress => ({
          ...prevProgress,
          progress: overallProgress,
          text: overallProgress === 100 ? 'All files processed!' : `Processing file ${completedFiles} of ${totalFiles}`
        }));
        
        // Check if all files are done (including errors)
        if (completedFiles === totalFiles) {
          console.log(`[BATCH DEBUG] All files completed with errors! Final progress: ${overallProgress}%`);
          setBatchProgress(prevProgress => ({
            ...prevProgress,
            progress: 100,
            text: 'All files processed!'
          }));
        }
        
        return updated;
      });
      
      // Clear the error and continue with next file
      hideError();
      
      // Much longer delay to ensure cleanup is complete before unlocking after error
      setTimeout(() => {
        console.log(`[BATCH DEBUG] Unlocking processing after error for: ${currentlyProcessing.name}`);
        setCurrentlyProcessing(null);
        setIsProcessingLocked(false); // Unlock processing for next file
      }, 3000); // Increased delay to allow for proper cleanup after error
    }
  }, [error, currentlyProcessing, hideError]);

  // Don't update batch progress with individual file progress - keep overall progress steady

  const onClearAll = () => {
    setFileMetadataList([]);
    setProcessingQueue([]);
    setCurrentlyProcessing(null);
    setIsProcessingLocked(false);
    setBatchProgress({
      isVisible: false,
      currentFile: 0,
      totalFiles: 0,
      fileName: '',
      text: '',
      progress: 0
    });
  };


  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Video Metadata Extractor
          </h1>
        </div>
        
        <FileUpload onFileSelect={onFileSelect} onMultipleFilesSelect={onMultipleFilesSelect} isLoaded={isLoaded} currentMethod={currentMethod} />
        
        {/* Processing Status */}
        {(processingQueue.length > 0 || currentlyProcessing) && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-800 font-medium">
                  {currentlyProcessing ? `Processing: ${currentlyProcessing.name}` : 'Processing queue...'}
                </p>
                <p className="text-blue-600 text-sm">
                  {processingQueue.length} files remaining in queue
                </p>
              </div>
              <button
                onClick={onClearAll}
                className="text-sm text-blue-600 hover:text-red-600 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
        
        {/* Show batch progress when processing multiple files */}
        {batchProgress.isVisible && batchProgress.totalFiles > 1 && (
          <ProgressBar 
            progress={{
              isVisible: true,
              progress: batchProgress.progress,
              text: batchProgress.text
            }} 
            onClose={batchProgress.progress === 100 ? () => setBatchProgress(prev => ({ ...prev, isVisible: false })) : undefined} 
          />
        )}
        
        {/* Show individual file progress only for single file processing */}
        {batchProgress.totalFiles <= 1 && progress.isVisible && (
          <ProgressBar 
            progress={{
              ...progress,
              text: currentlyProcessing ? `${currentlyProcessing.name}: ${progress.text}` : progress.text
            }} 
            onClose={hideProgress} 
          />
        )}
        
        {error.isVisible && (
          <ErrorDisplay error={error} onDismiss={hideError} />
        )}
        
        {/* Multiple Files Results */}
        {fileMetadataList.length > 0 && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Processing Results ({fileMetadataList.length} files)
              </h2>
            </div>
            
            {fileMetadataList.map((fileItem, index) => (
              <div key={index} className="border-2 border-gray-300 rounded-lg p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{fileItem.file.name}</h3>
                    <p className="text-sm text-gray-500">
                      {fileItem.isProcessing ? 'Processing...' : 
                       fileItem.error ? `Error: ${fileItem.error}` : 
                       fileItem.metadata ? `Processed with ${fileItem.method}` : 'Waiting to process...'}
                    </p>
                  </div>
                  {fileItem.isProcessing && (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  )}
                </div>
                
                {fileItem.metadata && (
                  <MetadataDisplay 
                    metadata={fileItem.metadata} 
                    selectedFile={fileItem.file} 
                    extractSubtitle={extractSubtitle} 
                    extractStream={extractStream} 
                  />
                )}
                
                {fileItem.error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">Failed to process: {fileItem.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Single File Result */}
        {fileMetadataList.length === 0 && metadata && (
          <MetadataDisplay metadata={metadata} selectedFile={selectedFile} extractSubtitle={extractSubtitle} extractStream={extractStream} />
        )}
      </div>
    </div>
  );
};

export default App;