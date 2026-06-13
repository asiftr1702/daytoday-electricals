import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.LoginComponent),
    title: 'Login — DayToDay Electricals',
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home').then(m => m.HomeComponent),
        title: 'DayToDay Electricals — Your Local Electrical Shop',
      },
      {
        path: 'fans',
        loadComponent: () => import('./features/fans/fans').then(m => m.FansComponent),
        title: 'Fans — DayToDay Electricals',
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
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin').then(m => m.AdminComponent),
        title: 'Admin — Add Products',
      },
      {
        path: 'admin/category/:id',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/category-admin/category-admin').then(m => m.CategoryAdminComponent),
        title: 'Category Admin — DayToDay Electricals',
      },
      {
        path: 'low-stock',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/low-stock/low-stock').then(m => m.LowStockComponent),
        title: 'Low Stock — DayToDay Electricals',
      },
      {
        path: 'sales',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/sales/sales').then(m => m.SalesComponent),
        title: 'Daily Sales — DayToDay Electricals',
      },
      {
        path: 'bill',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/bill/bill').then(m => m.BillComponent),
        title: 'Current Bill — DayToDay Electricals',
      },
      {
        path: 'change-password',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/change-password/change-password').then(m => m.ChangePasswordComponent),
        title: 'Settings — DayToDay Electricals',
      },
      {
        path: 'catalogue-settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/catalogue-settings/catalogue-settings').then(m => m.CatalogueSettingsComponent),
        title: 'Catalogue Settings — DayToDay Electricals',
      },
      {
        path: '**',
        redirectTo: '',
      },
    ],
  },
];

