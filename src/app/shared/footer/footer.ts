import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class FooterComponent {
  private readonly catalogueConfig = inject(CatalogueConfigService);

  constructor() {
    this.catalogueConfig.loadConfig();
  }

  /** First few categories from the live config so ids match the products page. */
  readonly categories = computed(() => this.catalogueConfig.categories().slice(0, 5));
  readonly currentYear = new Date().getFullYear();
}
