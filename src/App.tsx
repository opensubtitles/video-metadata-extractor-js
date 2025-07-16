import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProgressBar } from './components/ProgressBar';
import { MetadataDisplay } from './components/MetadataDisplay';
import { ErrorDisplay } from './components/ErrorDisplay';
import { useVideoMetadata } from './hooks/useVideoMetadata';

const App: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { metadata, progress, error, handleFileSelect, hideError, isLoaded } = useVideoMetadata();
  
  console.log('App render: isLoaded =', isLoaded);

  const onFileSelect = (file: File) => {
    setSelectedFile(file);
    handleFileSelect(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          Video Metadata Extractor
        </h1>
        
        {!isLoaded && (
          <div className="mb-6 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mr-2"></div>
            <span className="text-gray-600">Loading FFmpeg...</span>
          </div>
        )}
        
        <FileUpload onFileSelect={onFileSelect} selectedFile={selectedFile} />
        
        {progress.isVisible && (
          <ProgressBar progress={progress} />
        )}
        
        {error.isVisible && (
          <ErrorDisplay error={error} onDismiss={hideError} />
        )}
        
        {metadata && (
          <MetadataDisplay metadata={metadata} />
        )}
      </div>
    </div>
  );
};

export default App;