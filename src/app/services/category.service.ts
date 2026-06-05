import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SheetsService } from './sheets.service';
import { Category } from '../models/category.model';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  constructor(private sheetsService: SheetsService) {}

  getCategories(): Observable<Category[]> {
    return this.sheetsService.getCategories() as Observable<Category[]>;
  }
}
