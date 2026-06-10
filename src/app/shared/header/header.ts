import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { BillService } from '../../core/services/bill.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent {
  readonly menuOpen = signal(false);
  readonly billService = inject(BillService);
  readonly adminAuth = inject(AdminAuthService);
  private readonly router = inject(Router);

  toggleMenu(): void {
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  logout(): void {
    this.adminAuth.logout();
    this.closeMenu();
    this.router.navigate(['/login']);
  }
}
