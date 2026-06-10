import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
})
export class ChangePasswordComponent {
  private readonly auth = inject(AdminAuthService);

  readonly current = signal('');
  readonly newPw = signal('');
  readonly confirm = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal(false);

  readonly showCurrent = signal(false);
  readonly showNew = signal(false);
  readonly showConfirm = signal(false);

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
