import { Component, inject, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';

@Component({
  selector: 'app-admin-nav',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-nav.html',
  styleUrls: ['./admin-nav.css'],
})
export class AdminNavComponent {
  protected readonly config = inject(CatalogueConfigService);
  protected readonly router = inject(Router);
  protected readonly isOpen = signal(false);

  toggle() { this.isOpen.update(v => !v); }
  close()  { this.isOpen.set(false); }

  getLinkCommands(catId: string): string[] {
    return ['/admin/category', catId];
  }

  isActive(catId: string): boolean {
    return this.router.url === '/admin/category/' + catId;
  }

  isCatalogueSettingsActive(): boolean {
    return this.router.url === '/catalogue-settings';
  }

  isLowStockActive(): boolean {
    return this.router.url === '/low-stock';
  }
}
