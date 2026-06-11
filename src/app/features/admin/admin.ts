import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css'],
})
export class AdminComponent implements OnInit {
  readonly catalogueConfig = inject(CatalogueConfigService);

  ngOnInit(): void {
    this.catalogueConfig.loadConfig();
  }
}
