import { Component, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { StampService } from '../../core/services/stamp.service';

@Component({
  selector: 'app-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
})
export class ChangePasswordComponent implements OnInit {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  readonly stampService = inject(StampService);

  readonly current = signal('');
  readonly newPw = signal('');
  readonly confirm = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal(false);

  readonly showCurrent = signal(false);
  readonly showNew = signal(false);
  readonly showConfirm = signal(false);

  // Stamp upload
  readonly stampPreview = signal<string | null>(null);
  readonly stampUploading = signal(false);
  readonly stampError = signal('');
  readonly stampSuccess = signal(false);
  private stampFile: File | null = null;

  ngOnInit(): void {
    this.stampService.loadStamp();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  onStampSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.stampError.set('');
    this.stampSuccess.set(false);
    if (!file.type.startsWith('image/')) {
      this.stampError.set('Please select a valid image file.');
      return;
    }
    this.stampFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.stampPreview.set(e.target!.result as string);
    reader.readAsDataURL(file);
  }

  async uploadStamp(): Promise<void> {
    if (!this.stampFile) { this.stampError.set('Please select an image first.'); return; }
    this.stampUploading.set(true);
    this.stampError.set('');
    try {
      await this.stampService.uploadStamp(this.stampFile);
      this.stampSuccess.set(true);
      this.stampFile = null;
      this.stampPreview.set(null);
      setTimeout(() => this.stampSuccess.set(false), 4000);
    } catch {
      this.stampError.set('Upload failed. Please try again.');
    }
    this.stampUploading.set(false);
  }

  async submit(): Promise<void> {
    this.error.set('');
    this.success.set(false);

    const c = this.current().trim();
    const n = this.newPw().trim();
    const cf = this.confirm().trim();

    if (!c || !n || !cf) { this.error.set('All fields are required.'); return; }
    if (n.length < 6) { this.error.set('New password must be at least 6 characters.'); return; }
    if (n !== cf) { this.error.set('New passwords do not match.'); return; }

    this.loading.set(true);
    const ok = await this.auth.changePassword(c, n);
    this.loading.set(false);

    if (ok) {
      this.success.set(true);
      this.current.set('');
      this.newPw.set('');
      this.confirm.set('');
    } else {
      this.error.set('Current password is incorrect. Please try again.');
    }
  }
}
