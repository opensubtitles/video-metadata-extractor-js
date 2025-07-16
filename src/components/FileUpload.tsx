import { useState } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  isLoaded?: boolean;
  currentMethod?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, selectedFile, isLoaded, currentMethod }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    
    const files = event.dataTransfer.files;
    
    if (files.length > 0) {
      const file = files[0];
      
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.ogv', '.3gp', '.flv', '.wmv', '.m4v'];
      const fileName = file.name.toLowerCase();
      const hasVideoExtension = videoExtensions.some(ext => fileName.endsWith(ext));
      
      if (file.type.startsWith('video/') || hasVideoExtension) {
        onFileSelect(file);
      } else {
        // Could show an error message to user here if needed
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        />
        <label
          htmlFor="videoFile"
          className={`
            relative flex flex-col items-center justify-center gap-8 p-12 min-h-[280px]
            border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300
            ${isDragOver 
              ? 'border-orange-500 bg-orange-50 shadow-lg' 
              : 'border-gray-300 bg-gray-50 hover:border-orange-400 hover:bg-orange-50/50'
            }
          `}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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
              {!isLoaded && currentMethod === 'FFmpeg' ? (
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
                    {isDragOver ? 'Drop your video here' : 'Upload Video File'}
                  </h3>
                  <p className={`
                    text-base mb-4 transition-colors duration-300
                    ${isDragOver ? 'text-orange-500' : 'text-gray-500'}
                  `}>
                    {isDragOver ? 'Release to upload' : 'Drag & drop or click to browse'}
                  </p>
                  <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
                    <span>MP4</span>
                    <span>•</span>
                    <span>MOV</span>
                    <span>•</span>
                    <span>AVI</span>
                    <span>•</span>
                    <span>MKV</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </label>
      </div>
      
      {selectedFile && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
          <p className="text-gray-700 mb-1">
            File: {selectedFile.name}
          </p>
          <p className="text-gray-700">
            Size: {formatFileSize(selectedFile.size)}
          </p>
        </div>
      )}
    </div>
  );
};