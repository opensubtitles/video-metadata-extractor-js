/**
 * Mock FFmpeg utilities for testing
 */

export const toBlobURL = jest.fn().mockResolvedValue('mock-blob-url');
export const fetchFile = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));