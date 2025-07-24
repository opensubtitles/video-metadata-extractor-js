import { useState } from 'react';
import { processDroppedItems, processSelectedFiles } from '../utils/fileUtils';
import { VERSION } from '../version';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onMultipleFilesSelect: (files: File[]) => void;
  selectedFile?: File | null;
  isLoaded?: boolean;
  currentMethod?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, onMultipleFilesSelect, isLoaded }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isLoaded) {
      console.log('[FILE UPLOAD] FFmpeg not loaded, ignoring file selection');
      return;
    }
    
    const fileList = event.target.files;
    if (fileList) {
      const videoFiles = processSelectedFiles(fileList);
      
      if (videoFiles.length === 1) {
        onFileSelect(videoFiles[0]);
      } else if (videoFiles.length > 1) {
        onMultipleFilesSelect(videoFiles);
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isLoaded) {
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isLoaded) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    
    if (!isLoaded) {
      console.log('[FILE UPLOAD] FFmpeg not loaded, ignoring drag and drop');
      return;
    }
    
    const items = event.dataTransfer.items;
    
    if (items) {
      try {
        const videoFiles = await processDroppedItems(items);
        
        if (videoFiles.length === 1) {
          onFileSelect(videoFiles[0]);
        } else if (videoFiles.length > 1) {
          onMultipleFilesSelect(videoFiles);
        }
      } catch (error) {
        console.error('Error processing dropped items:', error);
      }
    } else {
      // Fallback to regular file handling
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        const videoFiles = processSelectedFiles(files);
        
        if (videoFiles.length === 1) {
          onFileSelect(videoFiles[0]);
        } else if (videoFiles.length > 1) {
          onMultipleFilesSelect(videoFiles);
        }
      }
    }
  };


  return (
    <div className="mb-8">
      <div className="relative w-full">
        <input
          type="file"
          id="videoFile"
          accept="video/*"
          onChange={handleFileChange}
          className="sr-only"
          multiple
          disabled={!isLoaded}
        />
        <label
          htmlFor={isLoaded ? "videoFile" : undefined}
          className={`
            relative flex flex-col items-center justify-center gap-8 p-12 min-h-[280px]
            border-2 border-dashed rounded-xl transition-all duration-300
            ${!isLoaded 
              ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-75' 
              : isDragOver 
                ? 'border-orange-500 bg-orange-50 shadow-lg cursor-pointer' 
                : 'border-gray-300 bg-gray-50 hover:border-orange-400 hover:bg-orange-50/50 cursor-pointer'
            }
          `}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Version in top right corner */}
          <div className="absolute top-4 right-4 text-xs text-gray-400 font-mono">
            v{VERSION}
          </div>
          <div className="flex flex-col items-center gap-6">
            <div className={`
              w-20 h-20 rounded-xl flex items-center justify-center shadow-md transition-all duration-300
              ${isDragOver ? 'bg-orange-500' : 'bg-gray-400'}
            `}>
              <svg 
                className="w-10 h-10 text-white" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
              </svg>
            </div>
            
            <div className="text-center">
              {!isLoaded ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                    <span className="text-gray-600 text-lg">Loading FFmpeg...</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Please wait while we initialize the video processing engine
                  </p>
                </div>
              ) : (
                <>
                  <h3 className={`
                    text-2xl font-bold mb-2 transition-colors duration-300
                    ${isDragOver ? 'text-orange-600' : 'text-gray-700'}
                  `}>
                    {isDragOver ? 'Drop your videos here' : 'Upload Video Files'}
                  </h3>
                  <p className={`
                    text-base mb-4 transition-colors duration-300
                    ${isDragOver ? 'text-orange-500' : 'text-gray-500'}
                  `}>
                    {isDragOver ? 'Release to upload' : 'Drag & drop files/folders or click to browse'}
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 flex-wrap mb-4">
                    <span>MP4</span>
                    <span>•</span>
                    <span>MKV</span>
                    <span>•</span>
                    <span>AVI</span>
                    <span>•</span>
                    <span>MOV</span>
                    <span>•</span>
                    <span>WEBM</span>
                    <span>•</span>
                    <span>FLV</span>
                    <span>•</span>
                    <span>WMV</span>
                    <span>•</span>
                    <span className="text-gray-400">and other video formats</span>
                  </div>
                  
                  {/* OpenSubtitles Branding */}
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                    <span>Made with</span>
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                    <span>by</span>
                    <a 
                      href="https://github.com/opensubtitles/video-metadata-extractor-js" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      OpenSubtitles
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </label>
      </div>
      
    </div>
  );
};