import React from 'react';
import { ProgressState } from '../types';

interface ProgressBarProps {
  progress: ProgressState;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  if (!progress.isVisible) return null;

  return (
    <div className="mb-8">
      <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out"
          style={{ width: `${progress.progress}%` }}
        />
      </div>
      <p className="text-center text-indigo-500 font-medium">{progress.text}</p>
    </div>
  );
};