import React from 'react';
import { formatFileSize } from '../utils/fileUtils';

interface MultipleFilesDisplayProps {
  files: File[];
  onFileSelect: (file: File) => void;
  onClearAll: () => void;
}

export const MultipleFilesDisplay: React.FC<MultipleFilesDisplayProps> = ({ files, onFileSelect, onClearAll }) => {
  if (files.length === 0) return null;

  return (
    <div className="mb-8 p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          {files.length} Video Files Selected
        </h3>
        <button
          onClick={onClearAll}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Clear All
        </button>
      </div>
      
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {files.map((file, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-500">
                {formatFileSize(file.size)}
              </p>
            </div>
            <button
              onClick={() => onFileSelect(file)}
              className="ml-4 px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              Process
            </button>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-sm text-gray-600 text-center">
        Click "Process" on any file to analyze its metadata
      </div>
    </div>
  );
};