/**
 * Test setup and utilities
 * Provides common test utilities and mock implementations
 */

// Mock HTMLAnchorElement for download tests
Object.defineProperty(document, 'createElement', {
  value: (tagName: string) => {
    if (tagName === 'a') {
      return {
        href: '',
        download: '',
        click: jest.fn(),
        remove: jest.fn()
      };
    }
    return {};
  }
});

// Mock URL.createObjectURL and revokeObjectURL
Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: jest.fn(() => 'mock-url'),
    revokeObjectURL: jest.fn()
  }
});

// Mock document.body for download tests
Object.defineProperty(document, 'body', {
  value: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  }
});

// Mock TextEncoder and TextDecoder
Object.defineProperty(global, 'TextEncoder', {
  value: class TextEncoder {
    encode(text: string): Uint8Array {
      return new Uint8Array(Buffer.from(text, 'utf8'));
    }
  }
});

Object.defineProperty(global, 'TextDecoder', {
  value: class TextDecoder {
    decode(data: Uint8Array): string {
      return Buffer.from(data).toString('utf8');
    }
  }
});

// Mock ReadableStream for large file downloads
Object.defineProperty(global, 'ReadableStream', {
  value: class ReadableStream {
    constructor(underlyingSource: any) {
      this.underlyingSource = underlyingSource;
    }
    underlyingSource: any;
  }
});

// Mock Response for streaming downloads
Object.defineProperty(global, 'Response', {
  value: class Response {
    constructor(body: any) {
      this.body = body;
    }
    body: any;
    
    async blob(): Promise<Blob> {
      return new Blob(['mock blob data']);
    }
  }
});

// Mock File constructor
export class MockFile implements File {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  webkitRelativePath: string = '';
  
  constructor(data: string | Uint8Array, name: string, options: { type?: string } = {}) {
    this.name = name;
    this.type = options.type || '';
    this.lastModified = Date.now();
    
    if (typeof data === 'string') {
      this.size = data.length;
      this._data = new TextEncoder().encode(data);
    } else {
      this.size = data.length;
      this._data = data;
    }
  }
  
  private _data: Uint8Array;
  
  slice(start?: number, end?: number): Blob {
    const actualStart = start || 0;
    const actualEnd = end || this._data.length;
    const sliced = this._data.slice(actualStart, actualEnd);
    
    return {
      size: sliced.length,
      type: this.type,
      slice: (s?: number, e?: number) => this.slice(s, e),
      stream: () => new ReadableStream(),
      text: () => Promise.resolve(new TextDecoder().decode(sliced)),
      arrayBuffer: () => Promise.resolve(sliced.buffer)
    } as Blob;
  }
  
  stream(): ReadableStream {
    return new ReadableStream();
  }
  
  text(): Promise<string> {
    return Promise.resolve(new TextDecoder().decode(this._data));
  }
  
  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(this._data.buffer);
  }
}

// Mock Blob constructor
export class MockBlob implements Blob {
  size: number;
  type: string;
  
  constructor(data: any[], options: { type?: string } = {}) {
    this.type = options.type || '';
    this.size = data.reduce((total, chunk) => {
      if (typeof chunk === 'string') {
        return total + chunk.length;
      } else if (chunk instanceof Uint8Array) {
        return total + chunk.length;
      }
      return total;
    }, 0);
  }
  
  slice(start?: number, end?: number): Blob {
    return new MockBlob(['sliced data'], { type: this.type });
  }
  
  stream(): ReadableStream {
    return new ReadableStream();
  }
  
  text(): Promise<string> {
    return Promise.resolve('mock blob text');
  }
  
  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(this.size));
  }
}

// Mock JSZip
export const mockJSZip = {
  file: jest.fn(),
  generateAsync: jest.fn().mockResolvedValue(new MockBlob(['zip data']))
};

// Test utilities
export const createMockVideoFile = (sizeInMB: number = 1, name: string = 'test.mp4'): MockFile => {
  const data = new Uint8Array(sizeInMB * 1024 * 1024);
  data.fill(65); // Fill with 'A' character
  return new MockFile(data, name, { type: 'video/mp4' });
};

export const createMockSubtitleData = (): Uint8Array => {
  const srtContent = `1
00:00:01,000 --> 00:00:05,000
Hello, world!

2
00:00:06,000 --> 00:00:10,000
This is a test subtitle.
`;
  return new TextEncoder().encode(srtContent);
};

export const createMockFFmpegLogs = (): string => {
  return `
Duration: 00:02:30.45, start: 0.000000, bitrate: 1500 kb/s
Stream #0:0: Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], 1400 kb/s, 25 fps, 25 tbr, 25k tbn, 50 tbc (default)
Stream #0:1(eng): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)
Stream #0:2(eng): Subtitle: subrip (default)
Stream #0:3(spa): Subtitle: subrip (forced)
  `;
};

export const waitFor = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const mockProgressCallback = jest.fn();
export const mockErrorCallback = jest.fn();