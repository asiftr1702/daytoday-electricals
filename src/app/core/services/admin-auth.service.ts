import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly SESSION_KEY = 'daytoday_auth';

  readonly isAdmin = signal(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      if (sessionStorage.getItem(this.SESSION_KEY) === '1') {
        this.isAdmin.set(true);
      }
    }
  }

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
      if (matched) {
        this.isAdmin.set(true);
        sessionStorage.setItem(this.SESSION_KEY, '1');
      }
      return matched;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.isAdmin.set(false);
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.removeItem(this.SESSION_KEY);
    }
  }

  /**
   * Verifies the current password and, if correct, replaces the stored hash
   * with a hash of the new password. Returns true on success.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;

    try {
      const currentHash = await this.hashPassword(currentPassword);
      const configRef = doc(this.firestore, 'config', 'admin');
      const configDoc = await getDoc(configRef);

      if (!configDoc.exists()) return false;

      const storedHash = configDoc.data()?.['passwordHash'];
      if (typeof storedHash !== 'string' || currentHash !== storedHash) return false;

      const newHash = await this.hashPassword(newPassword);
      await setDoc(configRef, { passwordHash: newHash });
      return true;
    } catch {
      return false;
    }
  }
}
