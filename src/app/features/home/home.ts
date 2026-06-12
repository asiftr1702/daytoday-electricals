import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  private readonly catalogueConfig = inject(CatalogueConfigService);

  constructor() {
    this.catalogueConfig.loadConfig();
  }

  /** Categories sourced from the live catalogue config so ids/names match the
   *  products page and Firestore collections (the hardcoded CATEGORIES ids can
   *  drift from the admin-customised config, e.g. `wires` vs `wires-cables`). */
  readonly categories = this.catalogueConfig.categories;
}
