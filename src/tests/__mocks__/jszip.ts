/**
 * Mock JSZip for testing
 */

const mockJSZip = jest.fn().mockImplementation(() => ({
  file: jest.fn(),
  generateAsync: jest.fn().mockResolvedValue(new Blob(['mock zip data']))
}));

export default mockJSZip;