import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressImageFile } from '../utils/image.js';

describe('compressImageFile Client-Side Compression Utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to raw dataUrl in JSDOM / test environment without error', async () => {
    const file = new File(['fake-image-bytes'], 'proof.jpg', { type: 'image/jpeg' });
    let result = '';

    await new Promise<void>((resolve) => {
      compressImageFile(file, (res) => {
        result = res;
        resolve();
      });
    });

    expect(result).toContain('data:image/jpeg;base64,');
  });

  it('falls back to raw dataUrl for non-image files', async () => {
    const file = new File(['text-content'], 'notes.txt', { type: 'text/plain' });
    let result = '';

    await new Promise<void>((resolve) => {
      compressImageFile(file, (res) => {
        result = res;
        resolve();
      });
    });

    expect(result).toContain('data:text/plain;base64,');
  });

  it('resizes landscape image to max 1280x720 and encodes as 0.75 JPEG in browser environment', async () => {
    // Temporarily simulate non-jsdom browser environment
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });

    const mockDrawImage = vi.fn();
    const mockToDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,compressed-jpeg-mock-data');

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: (type: string) => {
            if (type === '2d') {
              return { drawImage: mockDrawImage } as unknown as CanvasRenderingContext2D;
            }
            return null;
          },
          toDataURL: mockToDataURL,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    // Mock Image constructor
    const originalImage = globalThis.Image;
    class MockImage {
      width = 2560;
      height = 1440;
      naturalWidth = 2560;
      naturalHeight = 1440;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
      get src() {
        return this._src;
      }
    }
    // @ts-expect-error Mocking Image
    globalThis.Image = MockImage;

    const file = new File(['raw-camera-bytes'], 'camera-photo.jpg', { type: 'image/jpeg' });
    let result = '';

    await new Promise<void>((resolve) => {
      compressImageFile(file, (res) => {
        result = res;
        resolve();
      });
    });

    expect(result).toBe('data:image/jpeg;base64,compressed-jpeg-mock-data');
    expect(mockDrawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 1280, 720);
    expect(mockToDataURL).toHaveBeenCalledWith('image/jpeg', 0.75);

    // Restore environment
    globalThis.Image = originalImage;
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
  });

  it('resizes portrait image preserving aspect ratio to max 720 height', async () => {
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });

    const mockDrawImage = vi.fn();
    const mockToDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,compressed-portrait');

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: (type: string) => {
            if (type === '2d') {
              return { drawImage: mockDrawImage } as unknown as CanvasRenderingContext2D;
            }
            return null;
          },
          toDataURL: mockToDataURL,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const originalImage = globalThis.Image;
    class MockPortraitImage {
      width = 1000;
      height = 2000;
      naturalWidth = 1000;
      naturalHeight = 2000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
      get src() {
        return this._src;
      }
    }
    // @ts-expect-error Mocking Image
    globalThis.Image = MockPortraitImage;

    const file = new File(['portrait-bytes'], 'portrait.jpg', { type: 'image/jpeg' });
    let result = '';

    await new Promise<void>((resolve) => {
      compressImageFile(file, (res) => {
        result = res;
        resolve();
      });
    });

    expect(result).toBe('data:image/jpeg;base64,compressed-portrait');
    // Height scaled to 720, width = round(1000 * 720 / 2000) = 360
    expect(mockDrawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 360, 720);

    globalThis.Image = originalImage;
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
  });
});
