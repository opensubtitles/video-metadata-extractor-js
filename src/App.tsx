import React from 'react';
import { FileUpload } from './components/FileUpload';
import { ProgressBar } from './components/ProgressBar';
import { MetadataDisplay } from './components/MetadataDisplay';
import { ErrorDisplay } from './components/ErrorDisplay';
import { useSmartMetadata } from './hooks/useSmartMetadata';

const App: React.FC = () => {
  const { metadata, progress, error, handleFileSelect, hideError, isLoaded, selectedFile, currentMethod } = useSmartMetadata();
  

  const onFileSelect = (file: File) => {
    handleFileSelect(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          Video Metadata Extractor
        </h1>
        
        {!isLoaded && currentMethod === 'FFmpeg' && (
          <div className="mb-6 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mr-2"></div>
            <span className="text-gray-600">Loading FFmpeg...</span>
          </div>
        )}
        
        {selectedFile && (
          <div className="mb-4 text-center">
            <span className="text-sm text-gray-600">
              Using <span className="font-semibold text-blue-600">{currentMethod}</span> for {selectedFile.name}
            </span>
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