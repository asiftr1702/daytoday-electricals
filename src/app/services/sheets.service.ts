import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SheetsService {
  private sheetId = '1z9oKo6jwRLLsbM5IEoNolvo-MO--VUf9uvytNmOFCek';

  constructor(private http: HttpClient) {}

  /**
   * Fetch data from public Google Sheet
   * Returns data as array of objects
   */
  getSheetData(): Observable<any[]> {
    const url = `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv`;
    
    return this.http.get(url, { responseType: 'text' }).pipe(
      map(data => this.parseCSV(data))
    );
  }

  /**
   * Parse CSV data into array of objects
   */
  private parseCSV(csvData: string): any[] {
    const lines = csvData.trim().split('\n');
    if (lines.length === 0) return [];

    // Get headers from first line
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse data rows
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const obj: any = {};
      
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });

      return obj;
    });

    return data;
  }
}
