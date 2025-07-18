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

const App: React.FC = () => {
  const { metadata, progress, error, handleFileSelect, hideError, hideProgress, isLoaded, selectedFile, currentMethod, extractSubtitle, extractStream } = useSmartMetadata();
  const [fileMetadataList, setFileMetadataList] = useState<FileMetadata[]>([]);
  const [processingQueue, setProcessingQueue] = useState<File[]>([]);
  const [currentlyProcessing, setCurrentlyProcessing] = useState<File | null>(null);

  const onFileSelect = (file: File) => {
    // Single file selection - clear all and process immediately
    setFileMetadataList([]);
    setProcessingQueue([file]);
  };

  const onMultipleFilesSelect = (files: File[]) => {
    console.log(`[App] Multiple files selected: ${files.length} files`);
    files.forEach((file, index) => {
      console.log(`[App] File ${index + 1}: ${file.name} (${file.size} bytes)`);
    });
    
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
  };

  // Process files from queue automatically
  useEffect(() => {
    if (processingQueue.length > 0 && !currentlyProcessing && isLoaded) {
      const nextFile = processingQueue[0];
      setCurrentlyProcessing(nextFile);
      setProcessingQueue(prev => prev.slice(1));
      
      // Update processing state
      setFileMetadataList(prev => prev.map(item => 
        item.file === nextFile 
          ? { ...item, isProcessing: true, error: null }
          : item
      ));
      
      handleFileSelect(nextFile);
    }
  }, [processingQueue, currentlyProcessing, isLoaded, handleFileSelect]);

  // Update metadata when processing completes
  useEffect(() => {
    if (currentlyProcessing && metadata) {
      setFileMetadataList(prev => prev.map(item => 
        item.file === currentlyProcessing 
          ? { ...item, metadata, method: currentMethod, isProcessing: false }
          : item
      ));
      setCurrentlyProcessing(null);
    }
  }, [metadata, currentlyProcessing, currentMethod]);

  // Handle errors
  useEffect(() => {
    if (currentlyProcessing && error.isVisible) {
      setFileMetadataList(prev => prev.map(item => 
        item.file === currentlyProcessing 
          ? { ...item, error: error.message, isProcessing: false }
          : item
      ));
      setCurrentlyProcessing(null);
    }
  }, [error, currentlyProcessing]);

  const onClearAll = () => {
    setFileMetadataList([]);
    setProcessingQueue([]);
    setCurrentlyProcessing(null);
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
        
        {progress.isVisible && currentlyProcessing && (
          <ProgressBar 
            progress={{
              ...progress,
              text: `${currentlyProcessing.name}: ${progress.text}`
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