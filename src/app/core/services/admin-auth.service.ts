import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { from, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);

  /** In-memory only — never persisted to localStorage or cookies */
  readonly isAdmin = signal(false);

  /** Hash the input with SHA-256 using the browser's native Web Crypto API */
  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verifies the given password against the hash stored in Firestore.
   * Returns true if correct, false otherwise.
   */
  async login(password: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;

    try {
      const inputHash = await this.hashPassword(password);
      const configDoc = await getDoc(doc(this.firestore, 'config', 'admin'));

      if (!configDoc.exists()) return false;

      const storedHash = configDoc.data()?.['passwordHash'];
      if (typeof storedHash !== 'string') return false;

      const matched = inputHash === storedHash;
      if (matched) this.isAdmin.set(true);
      return matched;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.isAdmin.set(false);
  }
}
