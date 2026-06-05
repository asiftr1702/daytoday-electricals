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
   * Fetch data from a specific sheet tab
   * @param sheetName - Name of the sheet tab (e.g., 'Products', 'Categories', 'ShopProfile')
   */
  getSheetData(sheetName: string = ''): Observable<any[]> {
    const sheetParam = sheetName ? `&sheet=${sheetName}` : '';
    const url = `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv${sheetParam}`;
    
    return this.http.get(url, { responseType: 'text' }).pipe(
      map(data => this.parseCSV(data))
    );
  }

  /**
   * Fetch products from 'Products' sheet
   */
  getProducts(): Observable<any[]> {
    return this.getSheetData('Products');
  }

  /**
   * Fetch categories from 'Categories' sheet
   */
  getCategories(): Observable<any[]> {
    return this.getSheetData('Categories');
  }

  /**
   * Fetch shop profile from 'ShopProfile' sheet
   */
  getShopProfile(): Observable<any[]> {
    return this.getSheetData('ShopProfile');
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
