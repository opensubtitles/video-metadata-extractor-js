// Utility functions for file handling

// Video file extensions - only supported formats
export const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v',
  '.ogv', '.3gp', '.3g2', '.f4v'
];

/**
 * Check if a file is a supported video file based on extension only
 * Only accepts formats that are explicitly supported by the metadata extractor
 */
export const isVideoFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  const hasVideoExtension = VIDEO_EXTENSIONS.some(ext => fileName.endsWith(ext));
  
  return hasVideoExtension;
};

/**
 * Recursively scan a directory entry and extract all video files
 */
export const scanDirectory = async (entry: FileSystemDirectoryEntry): Promise<File[]> => {
  const readDirectory = (dirEntry: FileSystemDirectoryEntry): Promise<File[]> => {
    return new Promise((resolve) => {
      const dirReader = dirEntry.createReader();
      const allFiles: File[] = [];
      
      const readEntries = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(allFiles);
            return;
          }
          
          for (const entry of entries) {
            if (entry.isFile) {
              const file = await getFileFromEntry(entry as FileSystemFileEntry);
              if (file && isVideoFile(file)) {
                allFiles.push(file);
              }
            } else if (entry.isDirectory) {
              const subFiles = await readDirectory(entry as FileSystemDirectoryEntry);
              allFiles.push(...subFiles);
            }
          }
          
          // Continue reading (there might be more entries)
          readEntries();
        });
      };
      
      readEntries();
    });
  };
  
  return readDirectory(entry);
};

/**
 * Get File object from FileSystemFileEntry
 */
export const getFileFromEntry = (entry: FileSystemFileEntry): Promise<File> => {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
};

/**
 * Process dropped items (files and directories)
 */
export const processDroppedItems = async (items: DataTransferItemList): Promise<File[]> => {
  const files: File[] = [];
  const filteredFiles: string[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      
      if (entry?.isFile) {
        const file = await getFileFromEntry(entry as FileSystemFileEntry);
        if (isVideoFile(file)) {
          files.push(file);
        } else {
          filteredFiles.push(file.name);
        }
      } else if (entry?.isDirectory) {
        const dirFiles = await scanDirectory(entry as FileSystemDirectoryEntry);
        files.push(...dirFiles);
      }
    }
  }
  
  
  return files;
};

/**
 * Process selected files from input element
 */
export const processSelectedFiles = (fileList: FileList): File[] => {
  const files: File[] = [];
  const filteredFiles: string[] = [];
  
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (isVideoFile(file)) {
      files.push(file);
    } else {
      filteredFiles.push(file.name);
    }
  }
  
  
  return files;
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Extract directory path from file for grouping
 */
export const getDirectoryPath = (file: File): string => {
  // For files with webkitRelativePath, use the directory part
  if (file.webkitRelativePath) {
    const parts = file.webkitRelativePath.split('/');
    return parts.slice(0, -1).join('/');
  }
  
  // For regular files, return empty string
  return '';
};

/**
 * Group files by directory
 */
export const groupFilesByDirectory = (files: File[]): Map<string, File[]> => {
  const groups = new Map<string, File[]>();
  
  files.forEach(file => {
    const directory = getDirectoryPath(file);
    const key = directory || 'root';
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(file);
  });
  
  return groups;
};