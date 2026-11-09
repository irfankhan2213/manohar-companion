/**
 * Client-side image compression utility.
 * Resizes images to max 1280x720 while preserving aspect ratio,
 * and encodes to JPEG at 0.75 quality via an off-screen HTML canvas.
 */

export function compressImageFile(
  file: File,
  callback: (result: string) => void
): void {
  const reader = new FileReader();
  reader.onloadend = () => {
    if (typeof reader.result !== 'string') return;
    const dataUrl = reader.result;

    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      callback(dataUrl);
      return;
    }

    // In headless test environments (e.g. jsdom in Vitest), HTMLImageElement does not load data URLs.
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      callback(dataUrl);
      return;
    }

    if (!file.type.startsWith('image/')) {
      callback(dataUrl);
      return;
    }

    const img = new Image();
    let handled = false;
    const finish = (res: string) => {
      if (!handled) {
        handled = true;
        callback(res);
      }
    };

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width || 1280;
        let height = img.naturalHeight || img.height || 720;
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 720;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width / height > MAX_WIDTH / MAX_HEIGHT) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          } else {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.75);
          finish(compressed && compressed !== 'data:,' ? compressed : dataUrl);
        } else {
          finish(dataUrl);
        }
      } catch {
        finish(dataUrl);
      }
    };

    img.onerror = () => finish(dataUrl);
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}
