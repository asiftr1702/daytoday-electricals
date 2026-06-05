import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Product } from '../models/product.model';

/**
 * ProductAdminService
 * 
 * Handles submission of new/edited products to Google Sheets via Google Apps Script.
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Go to https://script.google.com
 * 2. Create a new script and paste the code from google-apps-script.txt
 * 3. Deploy as web app (Deploy → New deployment → Web app)
 * 4. Set "Execute as" to your account
 * 5. Set "Who has access" to "Anyone"
 * 6. Copy the deployment URL and replace GOOGLE_APPS_SCRIPT_URL below
 * 7. Share your Google Sheet with the service account email (check script editor logs for it)
 */

@Injectable({
  providedIn: 'root',
})
export class ProductAdminService {
  private readonly http = inject(HttpClient);

  // ⚠️ REPLACE THIS with your Google Apps Script deployment URL
  private readonly GOOGLE_APPS_SCRIPT_URL =
    'https://script.googleapis.com/macros/d/AKfycbyF7teRRe-KhE-IaBsRtcMEsN3Lza0IttlfY5Lljc8JKdd9ioL0SB1SXSNtXP9MLQ2J3g/usercallable';

  /**
   * Submit a new product to Google Sheets
   * @param product - Product data to add
   * @param sheetName - Name of the sheet (e.g., 'Fans', 'Lights')
   */
  submitProduct(product: Product, sheetName: string): Observable<any> {
    const payload = {
      action: 'addProduct',
      sheetName,
      product: this.formatProductForSheet(product),
    };

    // Use FormData to bypass CORS preflight
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));

    return this.http.post(this.GOOGLE_APPS_SCRIPT_URL, formData);
  }

  /**
   * Update an existing product in Google Sheets
   * @param product - Product data with updated values
   * @param sheetName - Name of the sheet
   * @param rowNumber - Row number in the sheet to update
   */
  updateProduct(product: Product, sheetName: string, rowNumber: number): Observable<any> {
    const payload = {
      action: 'updateProduct',
      sheetName,
      rowNumber,
      product: this.formatProductForSheet(product),
    };

    return this.http.post(this.GOOGLE_APPS_SCRIPT_URL, payload);
  }

  /**
   * Format product object for Google Sheets
   * Ensures data is in the correct order and format
   */
  private formatProductForSheet(product: Product): any[] {
    return [
      product.sku || '',
      product.name,
      product.description,
      product.subcategory || '',
      product.price || 0,
      product.unit,
      product.available ? 'TRUE' : 'FALSE',
      product.brand || '',
      product.costPrice || 0,
      product.discountedPrice || 0,
      product.stockQty || 0,
      product.purchaseDate || '',
      product.location || '',
      product.remarks || '',
    ];
  }
}
