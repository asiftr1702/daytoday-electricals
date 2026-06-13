import { Injectable, inject, signal, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);

  private readonly SESSION_KEY = 'daytoday_auth';
  private readonly ACTIVITY_KEY = 'daytoday_auth_activity';
  /** Auto-logout after this much idle time. */
  private readonly INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

  private readonly activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  private readonly onActivity = () => this.registerActivity();
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isAdmin = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    // sessionStorage survives a page refresh but is cleared when the tab is
    // closed, so a refresh keeps the user logged in while a closed tab does not.
    const authed = sessionStorage.getItem(this.SESSION_KEY) === '1';
    if (authed && !this.isSessionExpired()) {
      this.isAdmin.set(true);
      this.startSession();
    } else {
      this.clearSession();
    }
  }

  /** True when the time since the last recorded activity exceeds the limit. */
  private isSessionExpired(): boolean {
    const last = Number(sessionStorage.getItem(this.ACTIVITY_KEY));
    if (!last) return true;
    return Date.now() - last > this.INACTIVITY_LIMIT_MS;
  }

  /** Records latest activity and restarts the inactivity countdown. */
  private registerActivity(): void {
    if (!this.isAdmin()) return;
    sessionStorage.setItem(this.ACTIVITY_KEY, String(Date.now()));
    this.resetInactivityTimer();
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.zone.runOutsideAngular(() => {
      this.inactivityTimer = setTimeout(() => {
        this.zone.run(() => this.logout());
      }, this.INACTIVITY_LIMIT_MS);
    });
  }

  /** Begins tracking activity and starts the inactivity timer. */
  private startSession(): void {
    sessionStorage.setItem(this.ACTIVITY_KEY, String(Date.now()));
    this.activityEvents.forEach(evt =>
      window.addEventListener(evt, this.onActivity, { passive: true })
    );
    this.resetInactivityTimer();
  }

  /** Removes stored session data, listeners and the inactivity timer. */
  private clearSession(): void {
    sessionStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem(this.ACTIVITY_KEY);
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    this.activityEvents.forEach(evt =>
      window.removeEventListener(evt, this.onActivity)
    );
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
        this.startSession();
      }
      return matched;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.isAdmin.set(false);
    if (isPlatformBrowser(this.platformId)) {
      this.clearSession();
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
