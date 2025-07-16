import React from 'react';
import { ErrorState } from '../types';

interface ErrorDisplayProps {
  error: ErrorState;
  onDismiss: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onDismiss }) => {
  if (!error.isVisible) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-5 mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-red-800 font-semibold mb-2">Error</h3>
        <button
          onClick={onDismiss}
          className="text-red-500 hover:text-red-700 text-xl font-bold"
        >
          ×
        </button>
      </div>
      <p className="text-red-700">{error.message}</p>
    </div>
  );
};