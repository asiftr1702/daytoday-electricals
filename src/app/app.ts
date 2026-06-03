import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { SheetsService } from './services/sheets.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HttpClientModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  providers: [SheetsService]
})
export class App implements OnInit {
  protected readonly title = signal('daytoday-electricals');
  protected sheetData = signal<any[]>([]);
  protected isLoading = signal(true);
  protected error = signal<string | null>(null);

  constructor(private sheetsService: SheetsService) {}

  ngOnInit() {
    this.loadSheetData();
  }

  loadSheetData() {
    this.isLoading.set(true);
    this.error.set(null);

    this.sheetsService.getSheetData().subscribe({
      next: (data) => {
        this.sheetData.set(data);
        this.isLoading.set(false);
        console.log('Sheet data loaded:', data);
      },
      error: (err) => {
        this.error.set('Failed to load sheet data: ' + err.message);
        this.isLoading.set(false);
        console.error('Error loading sheet:', err);
      }
    });
  }
}
