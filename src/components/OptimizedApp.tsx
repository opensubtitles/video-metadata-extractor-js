/**
 * Optimized App component with simplified batch processing and better state management
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './FileUpload';
import { ProgressBar } from './ProgressBar';
import { MetadataDisplay } from './MetadataDisplay';
import { ErrorDisplay } from './ErrorDisplay';
import { useOptimizedVideoMetadata } from '../hooks/useOptimizedVideoMetadata';
import { VideoMetadata } from '../types';
import { formatFileSize, sleep } from '../utils/common';

interface FileProcessingItem {
  file: File;
  metadata: VideoMetadata | null;
  method: string;
  isProcessing: boolean;
  error: string | null;
  completed: boolean;
}

interface BatchProgress {
  isVisible: boolean;
  currentFile: number;
  totalFiles: number;
  fileName: string;
  text: string;
  progress: number;
}

const OptimizedApp: React.FC = () => {
  const { 
    metadata, 
    progress, 
    error, 
    handleFileSelect, 
    hideError, 
    hideProgress, 
    isLoaded, 
    selectedFile, 
    currentMethod, 
    extractSubtitle, 
    extractStream,
    extractAllSubtitles
  } = useOptimizedVideoMetadata();

  // Refs to access current state values inside callbacks
  const metadataRef = useRef(metadata);
  const selectedFileRef = useRef(selectedFile);
  const progressRef = useRef(progress);
  
  // Update refs when state changes
  useEffect(() => {
    metadataRef.current = metadata;
    selectedFileRef.current = selectedFile;
    progressRef.current = progress;
  }, [metadata, selectedFile, progress]);

  // Debug logging
  console.log('[APP DEBUG] Current state:', {
    isLoaded,
    selectedFile: selectedFile?.name,
    currentMethod,
    hasMetadata: !!metadata,
    hasError: !!error.isVisible,
    progressVisible: progress.isVisible,
    progressText: progress.text
  });

  const [fileList, setFileList] = useState<FileProcessingItem[]>([]);
  const [processingQueue, setProcessingQueue] = useState<File[]>([]);
  const [currentlyProcessing, setCurrentlyProcessing] = useState<File | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    isVisible: false,
    currentFile: 0,
    totalFiles: 0,
    fileName: '',
    text: '',
    progress: 0
  });
  
  const [saveAllSubtitles, setSaveAllSubtitles] = useState(true);
  const [batchSubtitleExtractionTriggered, setBatchSubtitleExtractionTriggered] = useState(false);
  const [batchSubtitleExtractionCancelled, setBatchSubtitleExtractionCancelled] = useState(false);

  // Single file selection handler
  const onFileSelect = useCallback((file: File) => {
    console.log('[APP DEBUG] File selected:', file.name, 'Size:', file.size);
    console.log('[APP DEBUG] isLoaded before processing:', isLoaded);
    
    // Clear batch state for single file processing
    setFileList([]);
    setProcessingQueue([]);
    setCurrentlyProcessing(null);
    setBatchProgress(prev => ({ ...prev, isVisible: false }));
    setBatchSubtitleExtractionTriggered(false);
    setBatchSubtitleExtractionCancelled(false);
    
    // Process single file immediately
    console.log('[APP DEBUG] Calling handleFileSelect...');
    handleFileSelect(file);
  }, [handleFileSelect, isLoaded]);

  // Handle batch subtitle extraction for all MKV files
  const handleBatchSubtitleExtraction = useCallback(async (items: FileProcessingItem[]) => {
    console.log('[BATCH SUBTITLE DEBUG] *** FUNCTION ENTRY *** Starting batch subtitle extraction with items:', items.length);
    
    const mkvFiles = items.filter(item => 
      item.completed && 
      item.metadata && 
      (item.file.name.toLowerCase().endsWith('.mkv') || item.file.name.toLowerCase().endsWith('.webm'))
    );

    console.log('[BATCH SUBTITLE DEBUG] File filtering results:', {
      totalItems: items.length,
      itemsWithResults: items.map(item => ({
        name: item.file.name,
        completed: item.completed,
        hasMetadata: !!item.metadata,
        isTargetFormat: item.file.name.toLowerCase().endsWith('.mkv') || item.file.name.toLowerCase().endsWith('.webm'),
        qualifiesForExtraction: item.completed && item.metadata && (item.file.name.toLowerCase().endsWith('.mkv') || item.file.name.toLowerCase().endsWith('.webm'))
      })),
      qualifiedFiles: mkvFiles.length
    });

    console.log('[BATCH SUBTITLE DEBUG] MKV files found:', {
      total: mkvFiles.length,
      files: mkvFiles.map(item => ({
        name: item.file.name,
        completed: item.completed,
        hasMetadata: !!item.metadata,
        subtitleCount: item.metadata?.streams?.filter(s => s.codec_type === 'subtitle').length || 0
      }))
    });

    if (mkvFiles.length === 0) {
      console.log('[BATCH SUBTITLE DEBUG] No MKV files found, hiding progress');
      setBatchProgress(prev => ({ ...prev, isVisible: false }));
      return;
    }

    try {
      // Clear any existing errors and progress before starting
      hideError();
      hideProgress();
      
      // Calculate total subtitles across all files for smooth progress
      const totalSubtitles = mkvFiles.reduce((total, item) => {
        const subtitleCount = item.metadata?.streams?.filter(s => s.codec_type === 'subtitle').length || 0;
        return total + subtitleCount;
      }, 0);

      console.log('[BATCH SUBTITLE DEBUG] Total subtitles to extract:', totalSubtitles);

      setBatchProgress(prev => ({
        ...prev,
        isVisible: true,
        text: `Extracting ${totalSubtitles} subtitles from ${mkvFiles.length} files...`,
        progress: 0
      }));

      let extractedCount = 0;
      
      // Create a progress tracker that intercepts individual subtitle progress
      const progressTracker = {
        currentFileIndex: 0,
        currentFile: null as FileProcessingItem | null,
        fileSubtitleCount: 0,
        fileExtractedCount: 0
      };

      // Extract subtitles from each MKV file
      for (let fileIndex = 0; fileIndex < mkvFiles.length; fileIndex++) {
        const item = mkvFiles[fileIndex];
        const subtitleStreams = item.metadata?.streams?.filter(s => s.codec_type === 'subtitle') || [];
        
        console.log(`[BATCH SUBTITLE DEBUG] Processing file ${fileIndex + 1}/${mkvFiles.length}: ${item.file.name} (${subtitleStreams.length} subtitles)`);
        
        // Update tracker
        progressTracker.currentFileIndex = fileIndex;
        progressTracker.currentFile = item;
        progressTracker.fileSubtitleCount = subtitleStreams.length;
        progressTracker.fileExtractedCount = 0;

        setBatchProgress(prev => ({
          ...prev,
          text: `File ${fileIndex + 1}/${mkvFiles.length}: ${item.file.name} - Starting...`,
          progress: Math.round((extractedCount / totalSubtitles) * 100)
        }));

        try {
          // Mirror the hook's progress (text + percent) into batchProgress so
          // the user sees real activity during extraction. Handles both the
          // legacy 'Extracting subtitle N/M' FFmpeg format and the MKV
          // fast-path format ('Reading clusters… t=... • read/total MB
          // (NN%) • eta Ns'). Without this mirror the bar was stuck at
          // 'File 1/1: ... - Starting...' / 0 % for the entire ~18 s
          // extraction run.
          let progressInterval: NodeJS.Timeout | null = null;
          const startMonitoring = () => {
            progressInterval = setInterval(() => {
              const currentProgress = progressRef.current;
              if (!currentProgress.isVisible || !currentProgress.text) return;

              const subMatch = currentProgress.text.match(/Extracting subtitle (\d+)\/(\d+)/);
              if (subMatch) {
                const currentSub = parseInt(subMatch[1], 10);
                const totalSubs = parseInt(subMatch[2], 10);
                const fileProgress = (currentSub / totalSubs) * subtitleStreams.length;
                const overallProgress = extractedCount + fileProgress;
                setBatchProgress(prev => ({
                  ...prev,
                  text: `File ${fileIndex + 1}/${mkvFiles.length}: ${item.file.name} - Subtitle ${currentSub}/${totalSubs}`,
                  progress: Math.round((overallProgress / totalSubtitles) * 100),
                }));
                return;
              }

              // Generic fallback: surface the hook's text and percent
              // directly, scaled across the file's share of the total
              // subtitle count so the overall bar advances proportionally.
              const fileFrac = Math.min(1, Math.max(0, currentProgress.progress / 100));
              const fileProgress = fileFrac * subtitleStreams.length;
              const overallProgress = extractedCount + fileProgress;
              setBatchProgress(prev => ({
                ...prev,
                text: `File ${fileIndex + 1}/${mkvFiles.length}: ${currentProgress.text}`,
                progress: Math.round((overallProgress / totalSubtitles) * 100),
              }));
            }, 150);
          };

          const stopMonitoring = () => {
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
          };

          startMonitoring();
          try {
            // Extract all subtitles from this file
            console.log(`[BATCH SUBTITLE DEBUG] Starting extractAllSubtitles for file ${fileIndex + 1}/${mkvFiles.length}: ${item.file.name}`);
            await extractAllSubtitles(item.file);
            console.log(`[BATCH SUBTITLE DEBUG] Completed extractAllSubtitles for file ${fileIndex + 1}/${mkvFiles.length}: ${item.file.name}`);
          } finally {
            stopMonitoring();
          }
          // Hide any lingering individual-progress modal now that
          // extraction is done; the batch bar continues to own the UI.
          hideProgress();
          
          // Clear any errors that might have occurred during extraction
          hideError();
          
          // Update progress for all subtitles in this file
          extractedCount += subtitleStreams.length;
          
          setBatchProgress(prev => ({
            ...prev,
            text: `File ${fileIndex + 1}/${mkvFiles.length}: ${item.file.name} - Completed (${subtitleStreams.length} subtitles)`,
            progress: Math.round((extractedCount / totalSubtitles) * 100)
          }));
          
          // Small delay between files
          if (fileIndex < mkvFiles.length - 1) {
            await sleep(1000);
          }
        } catch (error) {
          console.error(`Failed to extract subtitles from ${item.file.name}:`, error);
          // Still count the subtitles as "processed" to keep progress moving
          extractedCount += subtitleStreams.length;
          
          setBatchProgress(prev => ({
            ...prev,
            text: `File ${fileIndex + 1}/${mkvFiles.length}: ${item.file.name} - Failed, continuing...`,
            progress: Math.round((extractedCount / totalSubtitles) * 100)
          }));
        }
      }

      setBatchProgress(prev => ({
        ...prev,
        text: `Batch extraction completed! ${totalSubtitles} subtitles from ${mkvFiles.length} files`,
        progress: 100
      }));

      // Auto-hide after 5 seconds
      setTimeout(() => {
        setBatchProgress(prev => ({ ...prev, isVisible: false }));
      }, 5000);

    } catch (error) {
      console.error('Batch subtitle extraction failed:', error);
      setBatchProgress(prev => ({
        ...prev,
        text: 'Batch subtitle extraction failed',
        progress: 100
      }));
      
      setTimeout(() => {
        setBatchProgress(prev => ({ ...prev, isVisible: false }));
      }, 3000);
    }
  }, [extractAllSubtitles, hideError, hideProgress]);

  // Multiple files selection handler
  const onMultipleFilesSelect = useCallback((files: File[]) => {
    console.log(`[BATCH DEBUG] Starting batch processing with ${files.length} files:`, files.map(f => f.name));
    
    // Initialize file list
    const initialItems: FileProcessingItem[] = files.map(file => ({
      file,
      metadata: null,
      method: 'Pending',
      isProcessing: false,
      error: null,
      completed: false
    }));
    
    setFileList(initialItems);
    setProcessingQueue([...files]);
    setBatchSubtitleExtractionTriggered(false);
    setBatchSubtitleExtractionCancelled(false);
    setBatchProgress({
      isVisible: true,
      currentFile: 0,
      totalFiles: files.length,
      fileName: '',
      text: 'Initializing batch processing...',
      progress: 0
    });

    // Start processing the first file
    processBatchQueue([...files], initialItems);
  }, []);

  // Process batch queue sequentially
  const processBatchQueue = useCallback(async (
    queue: File[], 
    items: FileProcessingItem[]
  ) => {
    if (queue.length === 0) {
      // Clear processing states
      setProcessingQueue([]);
      setCurrentlyProcessing(null);
      
      setBatchProgress(prev => ({
        ...prev,
        text: 'All files processed!',
        progress: 100
      }));
      
      // Auto-hide progress bar after 3 seconds if not extracting subtitles
      if (!saveAllSubtitles) {
        setTimeout(() => {
          setBatchProgress(prev => ({ ...prev, isVisible: false }));
        }, 3000);
      }
      
      return;
    }

    const currentFile = queue[0];
    const remainingQueue = queue.slice(1);
    
    setCurrentlyProcessing(currentFile);
    
    // Update progress
    const currentIndex = items.length - queue.length + 1;
    const progressPerFile = 100 / items.length;
    const baseProgress = (currentIndex - 1) * progressPerFile;
    
    console.log('[BATCH PROGRESS DEBUG] Starting file:', {
      fileName: currentFile.name,
      currentIndex,
      totalFiles: items.length,
      progressPerFile,
      baseProgress: Math.round(baseProgress),
      previousProgress: 'N/A (from setBatchProgress)'
    });
    
    setBatchProgress(prev => ({
      ...prev,
      currentFile: currentIndex,
      fileName: currentFile.name,
      text: `File ${currentIndex}/${items.length}: Starting ${currentFile.name}`,
      progress: Math.round(baseProgress)
    }));

    // Update file list to show current processing
    setFileList(prev => prev.map(item => 
      item.file === currentFile 
        ? { ...item, isProcessing: true, error: null }
        : item
    ));

    try {
      console.log('[BATCH PROCESSING DEBUG] Before processing:', {
        fileName: currentFile.name
      });
      
      // Process the current file and capture metadata immediately after completion
      await handleFileSelect(currentFile);
      
      // Small delay to let React state settle
      await sleep(100);
      
      // Capture metadata if it's available and matches our file
      let capturedMetadata = null;
      const currentMetadata = metadataRef.current;
      const currentSelectedFile = selectedFileRef.current;
      
      if (currentMetadata && currentSelectedFile?.name === currentFile.name) {
        capturedMetadata = JSON.parse(JSON.stringify(currentMetadata));
        console.log('[BATCH PROCESSING DEBUG] Metadata captured for:', currentFile.name);
      } else {
        console.log('[BATCH PROCESSING DEBUG] No metadata captured for:', currentFile.name, {
          hasMetadata: !!currentMetadata,
          selectedFileName: currentSelectedFile?.name,
          expectedFileName: currentFile.name
        });
      }

      // Update file list with success
      console.log('[BATCH PROCESSING DEBUG] File completed:', {
        fileName: currentFile.name,
        hasMetadata: !!capturedMetadata,
        metadataPreview: capturedMetadata ? {
          format: capturedMetadata.format?.filename,
          streamsCount: capturedMetadata.streams?.length
        } : null
      });
      
      setFileList(prev => prev.map(item => 
        item.file === currentFile 
          ? { 
              ...item, 
              isProcessing: false, 
              completed: true,
              method: 'Optimized Processing',
              metadata: capturedMetadata
            }
          : item
      ));

    } catch (error) {
      // Update file list with error
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
      
      setFileList(prev => prev.map(item => 
        item.file === currentFile 
          ? { 
              ...item, 
              isProcessing: false, 
              error: errorMessage,
              completed: true
            }
          : item
      ));
    }

    setCurrentlyProcessing(null);
    
    // Update processing queue to reflect completed file
    setProcessingQueue(remainingQueue);
    
    // Add longer delay between files to ensure metadata capture
    await sleep(1000); // 1 second delay between files
    
    // Process next file
    processBatchQueue(remainingQueue, items);
  }, [handleFileSelect, saveAllSubtitles]);

  // Clear all processing
  const onClearAll = useCallback(() => {
    setFileList([]);
    setProcessingQueue([]);
    setCurrentlyProcessing(null);
    setBatchSubtitleExtractionTriggered(false);
    setBatchSubtitleExtractionCancelled(false);
    setBatchProgress({
      isVisible: false,
      currentFile: 0,
      totalFiles: 0,
      fileName: '',
      text: '',
      progress: 0
    });
  }, []);


  // Track when batch processing is complete and trigger subtitle extraction
  useEffect(() => {
    console.log('[BATCH DEBUG] useEffect triggered with:', {
      fileListLength: fileList.length,
      allCompleted: fileList.every(item => item.completed),
      saveAllSubtitles,
      batchSubtitleExtractionTriggered,
      processingQueueLength: processingQueue.length,
      fileList: fileList.map(item => ({ name: item.file.name, completed: item.completed, hasMetadata: !!item.metadata }))
    });
    
    // Check if all files are completed and we haven't triggered subtitle extraction yet
    if (fileList.length > 0 && 
        fileList.every(item => item.completed) && 
        saveAllSubtitles && 
        !batchSubtitleExtractionTriggered &&
        !batchSubtitleExtractionCancelled &&
        processingQueue.length === 0) {
      
      console.log('[BATCH DEBUG] All files completed, triggering subtitle extraction');
      setBatchSubtitleExtractionTriggered(true);
      
      setTimeout(async () => {
        console.log('[BATCH DEBUG] setTimeout callback executing, calling handleBatchSubtitleExtraction...');
        console.log('[BATCH DEBUG] Current fileList in setTimeout:', fileList.map(f => ({ name: f.file.name, completed: f.completed, hasMetadata: !!f.metadata })));
        try {
          await handleBatchSubtitleExtraction(fileList);
          console.log('[BATCH DEBUG] handleBatchSubtitleExtraction completed successfully');
        } catch (error) {
          console.error('[BATCH DEBUG] handleBatchSubtitleExtraction failed:', error);
        }
      }, 1000);
    }
  }, [fileList, saveAllSubtitles, batchSubtitleExtractionTriggered, batchSubtitleExtractionCancelled, processingQueue.length, handleBatchSubtitleExtraction]);

  // Update batch progress when individual file progress changes
  useEffect(() => {
    if (currentlyProcessing && batchProgress.isVisible && processingQueue.length > 0 && progress.isVisible) {
      const currentIndex = batchProgress.currentFile;
      const totalFiles = batchProgress.totalFiles;
      
      // Calculate progress ranges for each file
      // File 1: 0-50%, File 2: 50-100% (for 2 files)
      // File 1: 0-33%, File 2: 33-66%, File 3: 66-100% (for 3 files)
      const progressPerFile = 100 / totalFiles;
      const fileStartProgress = (currentIndex - 1) * progressPerFile;
      const fileProgressContribution = (progress.progress / 100) * progressPerFile;
      const overallProgress = fileStartProgress + fileProgressContribution;
      
      console.log('[BATCH PROGRESS DEBUG] Progress calculation:', {
        fileName: currentlyProcessing.name,
        currentIndex,
        totalFiles,
        individualProgress: progress.progress,
        progressPerFile,
        fileStartProgress,
        fileProgressContribution,
        overallProgress: Math.round(Math.min(overallProgress, 100)),
        previousProgress: batchProgress.progress,
        progressVisible: progress.isVisible
      });
      
      setBatchProgress(prev => ({
        ...prev,
        progress: Math.round(Math.min(overallProgress, 100)),
        text: `File ${currentIndex}/${totalFiles}: ${progress.text || 'Processing...'}`
      }));
    }
  }, [progress.progress, progress.text, progress.isVisible, currentlyProcessing, batchProgress.isVisible, batchProgress.currentFile, batchProgress.totalFiles, processingQueue.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2">
            Video Metadata Extractor
          </h1>
          <p className="text-gray-600 text-lg">
            Extract comprehensive metadata and subtitles from video files
          </p>
        </div>
        
        {/* File Upload */}
        <FileUpload 
          onFileSelect={onFileSelect} 
          onMultipleFilesSelect={onMultipleFilesSelect} 
          isLoaded={isLoaded} 
          currentMethod={currentMethod}
          saveAllSubtitles={saveAllSubtitles}
          onSaveAllSubtitlesChange={setSaveAllSubtitles}
        />


        {/* File Navigation Bar */}
        {fileList.length > 0 && fileList.some(item => item.completed) && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Quick Navigation:</h3>
            <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="grid gap-2">
                {/* Enhanced file navigation with stream info */}
                {fileList.map((item, index) => {
                  // Calculate stream counts
                  const videoStreams = item.metadata?.streams?.filter(s => s.codec_type === 'video').length || 0;
                  const audioStreams = item.metadata?.streams?.filter(s => s.codec_type === 'audio').length || 0;
                  const subtitleStreams = item.metadata?.streams?.filter(s => s.codec_type === 'subtitle').length || 0;
                  const fileSize = formatFileSize(item.file.size);
                  
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        const element = document.getElementById(`file-result-${index}`);
                        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`flex items-center gap-3 px-4 py-3 text-sm rounded-lg transition-colors w-full justify-between hover:shadow-sm ${
                        item.completed && item.metadata
                          ? 'bg-green-50 hover:bg-green-100 text-green-800 border border-green-200'
                          : item.error
                          ? 'bg-red-50 hover:bg-red-100 text-red-800 border border-red-200'
                          : item.isProcessing
                          ? 'bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-200'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                        </svg>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{item.file.name}</div>
                          <div className="text-xs opacity-75 mt-0.5">{fileSize}</div>
                        </div>
                      </div>
                      
                      {item.completed && item.metadata && (
                        <div className="flex items-center gap-3 text-xs">
                          {/* Video streams */}
                          {videoStreams > 0 && (
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/>
                              </svg>
                              <span>{videoStreams}V</span>
                            </div>
                          )}
                          
                          {/* Audio streams */}
                          {audioStreams > 0 && (
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/>
                              </svg>
                              <span>{audioStreams}A</span>
                            </div>
                          )}
                          
                          {/* Subtitle streams */}
                          {subtitleStreams > 0 && (
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,12H6V14H4V12M20,18H4V16H20V18M4,8H6V10H4V8M8,12H16V14H8V12M8,8H20V10H8V8Z"/>
                              </svg>
                              <span>{subtitleStreams}S</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Status icons */}
                      <div className="flex-shrink-0">
                        {item.completed && item.metadata && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                        {item.error && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        )}
                        {item.isProcessing && (
                          <div className="w-4 h-4">
                            <div className="animate-spin rounded-full h-4 w-4 border-b border-current"></div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        
        {/* Processing Status */}
        {(processingQueue.length > 0 || currentlyProcessing) && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-800 font-medium">
                  {currentlyProcessing ? (
                    <>Processing: {currentlyProcessing.name} ({formatFileSize(currentlyProcessing.size)})</>
                  ) : (
                    'Processing queue...'
                  )}
                </p>
                <p className="text-blue-600 text-sm">
                  {processingQueue.length} files remaining
                </p>
              </div>
              <button
                onClick={onClearAll}
                className="text-sm text-blue-600 hover:text-red-600 transition-colors font-medium"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
        
        {/* Batch Progress */}
        {((batchProgress.isVisible && batchProgress.totalFiles > 1) || batchSubtitleExtractionTriggered) && (
          <ProgressBar 
            progress={{
              isVisible: true,
              progress: batchProgress.progress,
              text: batchProgress.text
            }} 
            onClose={() => {
              setBatchProgress(prev => ({ ...prev, isVisible: false }));
              setBatchSubtitleExtractionTriggered(false);
              setBatchSubtitleExtractionCancelled(true);
            }} 
          />
        )}
        
        {/* Individual File Progress - Show for single file mode OR when batch is complete and individual extraction is happening */}
        {progress.isVisible && (fileList.length === 0 || (fileList.length > 0 && !batchProgress.isVisible && processingQueue.length === 0)) && (
          <ProgressBar 
            progress={progress} 
            onClose={hideProgress} 
          />
        )}
        
        {/* Error Display */}
        {error.isVisible && (
          <ErrorDisplay error={error} onDismiss={hideError} />
        )}
        
        {/* Batch Results */}
        {fileList.length > 0 && (
          <div className="space-y-6 mb-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                {fileList.length === 1 ? 'Processing Results' : 'Batch Processing Results'}
              </h2>
              <p className="text-gray-600">
                {fileList.length === 1 
                  ? `File processed: ${fileList[0]?.file.name || 'Unknown'}`
                  : `${fileList.filter(item => item.completed).length} of ${fileList.length} files processed`
                }
                {saveAllSubtitles && fileList.some(item => item.completed && (item.file.name.toLowerCase().endsWith('.mkv') || item.file.name.toLowerCase().endsWith('.webm'))) && (
                  <span className="ml-2 inline-flex items-center gap-1 text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                      <path d="M10,19L12,21L16,17"/>
                    </svg>
                    Auto-extracting subtitles
                  </span>
                )}
              </p>
            </div>
            
            <div className="grid gap-4">
              {fileList.map((item, index) => {
                // Alternating background colors for better visual separation
                const bgColor = index % 2 === 0 ? 'bg-blue-50' : 'bg-green-50';
                const borderColor = index % 2 === 0 ? 'border-blue-200' : 'border-green-200';
                
                return (
                <div key={index} id={`file-result-${index}`} className={`border-2 ${borderColor} rounded-lg p-4 ${bgColor} shadow-sm scroll-mt-6`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-800 truncate">
                        {item.file.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(item.file.size)} • {
                          item.isProcessing ? 'Processing...' : 
                          item.error ? `Error: ${item.error}` : 
                          item.completed ? `Completed with ${item.method}` : 'Waiting...'
                        }
                      </p>
                    </div>
                    {item.isProcessing && (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 ml-4"></div>
                    )}
                    {item.completed && !item.error && (
                      <div className="text-green-600 ml-4">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    {item.error && (
                      <div className="text-red-600 ml-4">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {item.metadata && (
                    <MetadataDisplay 
                      metadata={item.metadata} 
                      selectedFile={item.file} 
                      extractSubtitle={extractSubtitle}
                      extractStream={extractStream}
                      extractAllSubtitles={extractAllSubtitles} 
                    />
                  )}
                  
                  
                  {item.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                      <p className="text-red-800 text-sm">
                        <strong>Processing failed:</strong> {item.error}
                      </p>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}
        
        
        
        {/* Footer */}
        <footer className="text-center text-gray-500 text-sm mt-12 pt-8 border-t border-gray-200">
          <p>
            Powered by{' '}
            <a 
              href="https://github.com/ffmpegwasm/ffmpeg.wasm" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 transition-colors"
            >
              FFmpeg WebAssembly
            </a>
            {', '}
            <a 
              href="https://github.com/gpac/mp4box.js" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 transition-colors"
            >
              MP4Box
            </a>
            {' '}•{' '}
            Supports files of any size with memory-safe processing • 
            All processing happens in your browser
          </p>
        </footer>
      </div>
    </div>
  );
};

export default OptimizedApp;