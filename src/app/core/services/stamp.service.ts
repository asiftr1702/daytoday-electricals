import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class StampService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);

  readonly stampUrl = signal<string | null>(null);
  readonly loading = signal(false);

  private readonly MAX_DIMENSION = 600;
  private readonly JPEG_QUALITY = 0.85;

  async loadStamp(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const snap = await getDoc(doc(this.firestore, 'config', 'stamp'));
      if (snap.exists()) {
        this.stampUrl.set(snap.data()?.['imageUrl'] ?? null);
      }
    } catch {
      // silent — no stamp set yet
    }
  }

  async uploadStamp(file: File): Promise<void> {
    const base64 = await this.compressImage(file);
    await setDoc(doc(this.firestore, 'config', 'stamp'), { imageUrl: base64 });
    this.stampUrl.set(base64);
  }

  private compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to decode image.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
            if (width >= height) {
              height = Math.round((height * this.MAX_DIMENSION) / width);
              width = this.MAX_DIMENSION;
            } else {
              width = Math.round((width * this.MAX_DIMENSION) / height);
              height = this.MAX_DIMENSION;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not available.')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png', this.JPEG_QUALITY));
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    });
  }
}
