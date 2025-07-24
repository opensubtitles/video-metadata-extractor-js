/**
 * Mock FFmpeg for testing
 */

export const FFmpeg = jest.fn().mockImplementation(() => ({
  loaded: false,
  load: jest.fn().mockResolvedValue(undefined),
  exec: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(new Uint8Array([65, 66, 67])), // "ABC"
  deleteFile: jest.fn().mockResolvedValue(undefined),
  listDir: jest.fn().mockResolvedValue([]),
  on: jest.fn(),
  off: jest.fn(),
  terminate: jest.fn().mockResolvedValue(undefined)
}));