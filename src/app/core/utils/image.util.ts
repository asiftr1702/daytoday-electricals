/**
 * Shared image-compression helper used across the app (product images, stamp, etc.).
 * Reads a File, resizes it to fit within `maxDimension`, and returns a base64 data URL.
 */
export interface CompressImageOptions {
  /** Longest-edge limit in pixels. */
  maxDimension?: number;
  /** Output quality (0–1) for lossy formats. */
  quality?: number;
  /** Output MIME type, e.g. 'image/jpeg' or 'image/png'. */
  mimeType?: string;
}

export function compressImage(file: File, options: CompressImageOptions = {}): Promise<string> {
  const maxDimension = options.maxDimension ?? 900;
  const quality      = options.quality ?? 0.8;
  const mimeType     = options.mimeType ?? 'image/jpeg';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not available.')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(mimeType, quality));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}
