import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BillService } from '../../core/services/bill.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent {
  readonly menuOpen = signal(false);
  readonly billService = inject(BillService);
  readonly adminAuth = inject(AdminAuthService);

  readonly loginOpen = signal(false);
  readonly loginPassword = signal('');
  readonly loginError = signal('');
  readonly loginLoading = signal(false);

  toggleMenu(): void {
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  openLogin(): void {
    this.loginPassword.set('');
    this.loginError.set('');
    this.loginOpen.set(true);
  }

  closeLogin(): void {
    this.loginOpen.set(false);
    this.loginPassword.set('');
    this.loginError.set('');
  }

  async submitLogin(): Promise<void> {
    const pw = this.loginPassword().trim();
    if (!pw) { this.loginError.set('Please enter the password.'); return; }
    this.loginLoading.set(true);
    this.loginError.set('');
    const ok = await this.adminAuth.login(pw);
    this.loginLoading.set(false);
    if (ok) {
      this.closeLogin();
    } else {
      this.loginError.set('Incorrect password. Please try again.');
      this.loginPassword.set('');
    }
  }

  logout(): void {
    this.adminAuth.logout();
    this.closeMenu();
  }
}
