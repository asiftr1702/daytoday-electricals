import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.HomeComponent),
    title: 'DayToDay Electricals — Your Local Electrical Shop',
  },
  {
    path: 'products',
    loadComponent: () => import('./features/products/products').then(m => m.ProductsComponent),
    title: 'Products — DayToDay Electricals',
  },
  {
    path: 'contact',
    loadComponent: () => import('./features/contact/contact').then(m => m.ContactComponent),
    title: 'Contact Us — DayToDay Electricals',
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin').then(m => m.AdminComponent),
    title: 'Admin — Add Products',
  },
  {
    path: 'sales',
    loadComponent: () => import('./features/sales/sales').then(m => m.SalesComponent),
    title: 'Daily Sales — DayToDay Electricals',
  },
  {
    path: 'bill',
    loadComponent: () => import('./features/bill/bill').then(m => m.BillComponent),
    title: 'Current Bill — DayToDay Electricals',
  },
  {
    path: '**',
    redirectTo: '',
  },
];

