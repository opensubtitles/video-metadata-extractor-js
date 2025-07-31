/**
 * FFmpeg WASM Cache Utility
 * Caches FFmpeg core files in IndexedDB to avoid re-downloading on page reload
 */

interface CachedFile {
  url: string;
  data: ArrayBuffer;
  timestamp: number;
  version: string;
}

const CACHE_DB_NAME = 'ffmpeg-wasm-cache';
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'files';
const CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days
const FFMPEG_VERSION = '0.12.6'; // FFmpeg version for cache invalidation

class FFmpegCache {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    console.log(`[FFmpeg Cache] Initializing cache database: ${CACHE_DB_NAME} v${CACHE_DB_VERSION}`);
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
      
      request.onerror = () => {
        console.error(`[FFmpeg Cache] Failed to open database:`, request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log(`[FFmpeg Cache] Database opened successfully`);
        console.log(`[FFmpeg Cache] Object stores: ${Array.from(this.db.objectStoreNames).join(', ')}`);
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        console.log(`[FFmpeg Cache] Database upgrade needed`);
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
          console.log(`[FFmpeg Cache] Creating object store: ${CACHE_STORE_NAME}`);
          const store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log(`[FFmpeg Cache] Object store created with timestamp index`);
        } else {
          console.log(`[FFmpeg Cache] Object store ${CACHE_STORE_NAME} already exists`);
        }
      };
    });
  }

  async get(url: string): Promise<ArrayBuffer | null> {
    if (!this.db) await this.init();
    
    console.log(`[FFmpeg Cache] Looking for cached file: ${url}`);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.get(url);
      
      request.onerror = () => {
        console.error(`[FFmpeg Cache] Error getting ${url}:`, request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        const result = request.result as CachedFile | undefined;
        
        console.log(`[FFmpeg Cache] Get request completed for ${url}`);
        console.log(`[FFmpeg Cache] Result found: ${!!result}`);
        
        if (!result) {
          console.log(`[FFmpeg Cache] Cache miss for ${url} - not found in database`);
          
          // Debug: List all cached URLs to see what's in the database
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            const allFiles = getAllRequest.result as CachedFile[];
            console.log(`[FFmpeg Cache] DEBUG: All cached URLs in database:`);
            allFiles.forEach((file, i) => {
              console.log(`  ${i + 1}. "${file.url}" (${Math.round(file.data.byteLength / 1024 / 1024)}MB, ${file.version})`);
            });
            console.log(`[FFmpeg Cache] Looking for: "${url}"`);
            console.log(`[FFmpeg Cache] Exact matches: ${allFiles.filter(f => f.url === url).length}`);
          };
          
          resolve(null);
          return;
        }
        
        // Check if cache is expired or version changed
        const now = Date.now();
        const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        const age = now - result.timestamp;
        
        console.log(`[FFmpeg Cache] Found cached file for ${url}:`);
        console.log(`  - Size: ${Math.round(result.data.byteLength / 1024 / 1024)}MB`);
        console.log(`  - Age: ${Math.round(age / 1000 / 60)} minutes`);
        console.log(`  - Version: ${result.version} (current: ${FFMPEG_VERSION})`);
        console.log(`  - Expired: ${age > expiryTime ? 'YES' : 'NO'}`);
        
        if (
          now - result.timestamp > expiryTime ||
          result.version !== FFMPEG_VERSION
        ) {
          // Cache expired or version changed, remove it
          console.log(`[FFmpeg Cache] Cache expired or version mismatch, removing...`);
          this.remove(url);
          resolve(null);
          return;
        }
        
        console.log(`[FFmpeg Cache] Cache hit for ${url} - returning ${Math.round(result.data.byteLength / 1024 / 1024)}MB`);
        resolve(result.data);
      };
    });
  }

  async set(url: string, data: ArrayBuffer): Promise<void> {
    if (!this.db) {
      console.log(`[FFmpeg Cache] Database not initialized, initializing for set operation`);
      await this.init();
    }
    
    console.log(`[FFmpeg Cache] Attempting to cache ${url}`);
    console.log(`[FFmpeg Cache] Data size: ${Math.round(data.byteLength / 1024 / 1024)}MB`);
    console.log(`[FFmpeg Cache] Version: ${FFMPEG_VERSION}`);
    console.log(`[FFmpeg Cache] Timestamp: ${new Date().toISOString()}`);
    
    const cachedFile: CachedFile = {
      url,
      data,
      timestamp: Date.now(),
      version: FFMPEG_VERSION
    };
    
    return new Promise((resolve, reject) => {
      console.log(`[FFmpeg Cache] Creating transaction for ${CACHE_STORE_NAME}`);
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      
      transaction.onerror = () => {
        console.error(`[FFmpeg Cache] Transaction error for ${url}:`, transaction.error);
        reject(transaction.error);
      };
      
      transaction.oncomplete = () => {
        console.log(`[FFmpeg Cache] Transaction completed successfully for ${url}`);
      };
      
      const store = transaction.objectStore(CACHE_STORE_NAME);
      console.log(`[FFmpeg Cache] Putting data into store for ${url}`);
      const request = store.put(cachedFile);
      
      request.onerror = () => {
        console.error(`[FFmpeg Cache] Put request error for ${url}:`, request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        console.log(`[FFmpeg Cache] ✅ Successfully cached ${url} (${Math.round(data.byteLength / 1024 / 1024)}MB)`);
        console.log(`[FFmpeg Cache] Cache key: ${url}`);
        resolve();
      };
    });
  }

  async remove(url: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.delete(url);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`[FFmpeg Cache] Removed ${url} from cache`);
        resolve();
      };
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[FFmpeg Cache] Cache cleared');
        resolve();
      };
    });
  }

  async getCacheSize(): Promise<number> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const files = request.result as CachedFile[];
        const totalSize = files.reduce((sum, file) => sum + file.data.byteLength, 0);
        resolve(totalSize);
      };
    });
  }
}

// Create a cached version of toBlobURL
export async function cachedToBlobURL(url: string, mimeType: string): Promise<string> {
  console.log(`[FFmpeg Cache] ===== CACHED TO BLOB URL START =====`);
  console.log(`[FFmpeg Cache] URL: ${url}`);
  console.log(`[FFmpeg Cache] MIME type: ${mimeType}`);
  console.log(`[FFmpeg Cache] Call stack:`, new Error().stack?.split('\n').slice(1, 4).join('\n'));
  
  const cache = new FFmpegCache();
  
  try {
    // Try to get from cache first
    console.log(`[FFmpeg Cache] Checking cache for ${url}...`);
    const cachedData = await cache.get(url);
    
    if (cachedData) {
      console.log(`[FFmpeg Cache] ✅ CACHE HIT! Using cached file for ${url}`);
      console.log(`[FFmpeg Cache] Cached data size: ${Math.round(cachedData.byteLength / 1024 / 1024)}MB`);
      const blob = new Blob([cachedData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      console.log(`[FFmpeg Cache] Created blob URL from cache: ${blobUrl.substring(0, 50)}...`);
      console.log(`[FFmpeg Cache] ===== CACHED TO BLOB URL END (FROM CACHE) =====`);
      return blobUrl;
    }
    
    // Not in cache, fetch it
    console.log(`[FFmpeg Cache] ❌ Cache miss for ${url} - fetching from network`);
    console.log(`[FFmpeg Cache] Fetching: ${url}`);
    
    const fetchStart = performance.now();
    const response = await fetch(url);
    const fetchEnd = performance.now();
    
    console.log(`[FFmpeg Cache] Fetch completed in ${Math.round(fetchEnd - fetchStart)}ms`);
    console.log(`[FFmpeg Cache] Response status: ${response.status} ${response.statusText}`);
    console.log(`[FFmpeg Cache] Response size: ${response.headers.get('content-length') || 'unknown'} bytes`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`[FFmpeg Cache] Downloaded ${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB for ${url}`);
    
    // Cache it for next time
    console.log(`[FFmpeg Cache] Caching ${url} for future use...`);
    await cache.set(url, arrayBuffer);
    console.log(`[FFmpeg Cache] Successfully cached ${url}`);
    
    // Return blob URL
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    console.log(`[FFmpeg Cache] Created blob URL: ${blobUrl.substring(0, 50)}...`);
    console.log(`[FFmpeg Cache] ===== CACHED TO BLOB URL END =====`);
    return blobUrl;
    
  } catch (error) {
    console.error(`[FFmpeg Cache] Error with cached fetch for ${url}:`, error);
    
    // Fallback to regular fetch if cache fails
    console.log(`[FFmpeg Cache] Falling back to direct fetch for ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: mimeType });
    return URL.createObjectURL(blob);
  }
}

// Utility function to get cache info
export async function getCacheInfo(): Promise<{
  size: number;
  sizeFormatted: string;
  files: number;
}> {
  const cache = new FFmpegCache();
  
  try {
    await cache.init();
    const size = await cache.getCacheSize();
    const sizeFormatted = size > 0 ? `${Math.round(size / 1024 / 1024)}MB` : '0MB';
    
    return {
      size,
      sizeFormatted,
      files: size > 0 ? 2 : 0 // Assume 2 files if there's any data
    };
  } catch (error) {
    console.error('[FFmpeg Cache] Error getting cache info:', error);
    return { size: 0, sizeFormatted: '0MB', files: 0 };
  }
}

// Utility function to clear cache
export async function clearFFmpegCache(): Promise<void> {
  const cache = new FFmpegCache();
  await cache.clear();
}

export default FFmpegCache;