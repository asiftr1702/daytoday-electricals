import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SheetsService } from './sheets.service';
import { ShopProfile } from '../models/shop.model';

@Injectable({
  providedIn: 'root'
})
export class ShopService {
  constructor(private sheetsService: SheetsService) {}

  getShopProfile(): Observable<ShopProfile> {
    return this.sheetsService.getShopProfile().pipe(
      map(data => {
        // Get first row of shop profile data
        return data.length > 0 ? data[0] : {};
      })
    ) as Observable<ShopProfile>;
  }
}
