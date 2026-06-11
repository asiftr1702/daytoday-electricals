import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { compressImage } from '../utils/image.util';

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
    return compressImage(file, { maxDimension: this.MAX_DIMENSION, quality: this.JPEG_QUALITY, mimeType: 'image/png' });
  }
}
