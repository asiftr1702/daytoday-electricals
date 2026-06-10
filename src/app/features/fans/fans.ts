import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-fans',
  standalone: true,
  template: '',
})
export class FansComponent {
  constructor() {
    inject(Router).navigate(['/products'], {
      queryParams: { category: 'fans' },
      replaceUrl: true,
    });
  }
}
