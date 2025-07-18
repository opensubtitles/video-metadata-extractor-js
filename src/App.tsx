import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProgressBar } from './components/ProgressBar';
import { MetadataDisplay } from './components/MetadataDisplay';
import { ErrorDisplay } from './components/ErrorDisplay';
import { MultipleFilesDisplay } from './components/MultipleFilesDisplay';
import { useSmartMetadata } from './hooks/useSmartMetadata';
import { VERSION } from './version';

const App: React.FC = () => {
  const { metadata, progress, error, handleFileSelect, hideError, hideProgress, isLoaded, selectedFile, currentMethod, extractSubtitle, extractStream } = useSmartMetadata();
  const [multipleFiles, setMultipleFiles] = useState<File[]>([]);

  const onFileSelect = (file: File) => {
    setMultipleFiles([]); // Clear multiple files when selecting a single file
    handleFileSelect(file);
  };

  const onMultipleFilesSelect = (files: File[]) => {
    console.log(`[App] Multiple files selected: ${files.length} files`);
    files.forEach((file, index) => {
      console.log(`[App] File ${index + 1}: ${file.name} (${file.size} bytes)`);
    });
    setMultipleFiles(files);
  };

  const onClearMultipleFiles = () => {
    setMultipleFiles([]);
  };

  const onProcessFileFromMultiple = (file: File) => {
    handleFileSelect(file);
  };


  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Video Metadata Extractor
          </h1>
          <p className="text-sm text-gray-500">
            v{VERSION}
          </p>
        </div>
        
        
        <FileUpload onFileSelect={onFileSelect} onMultipleFilesSelect={onMultipleFilesSelect} isLoaded={isLoaded} currentMethod={currentMethod} />
        
        <MultipleFilesDisplay 
          files={multipleFiles}
          onFileSelect={onProcessFileFromMultiple}
          onClearAll={onClearMultipleFiles}
        />
        
        {selectedFile && (
          <div className="mb-4 text-center">
            <p className="text-gray-700 font-medium">{selectedFile.name}</p>
            <p className="text-sm text-gray-500">Processing with {currentMethod}</p>
          </div>
        )}
        
        {progress.isVisible && (
          <ProgressBar progress={progress} onClose={hideProgress} />
        )}
        
        {error.isVisible && (
          <ErrorDisplay error={error} onDismiss={hideError} />
        )}
        
        {metadata && (
          <MetadataDisplay metadata={metadata} selectedFile={selectedFile} extractSubtitle={extractSubtitle} extractStream={extractStream} />
        )}
      </div>
    </div>
  );
};

export default App;