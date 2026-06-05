import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { SheetsService } from './services/sheets.service';
import { ShopHeaderComponent } from './components/shop-header/shop-header.component';
import { ProductListComponent } from './components/product-list/product-list.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HttpClientModule, ShopHeaderComponent, ProductListComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  providers: [SheetsService]
})
export class App implements OnInit {
  protected readonly title = signal('daytoday-electricals');

  constructor() {}

  ngOnInit() {
    // App initialization
    console.log('App loaded successfully');
  }
}
