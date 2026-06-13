import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const platformId = inject(PLATFORM_ID);
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  // On the server (SSR/prerender) the session isn't available; defer the check
  // to the client so a page refresh doesn't get redirected to login.
  if (!isPlatformBrowser(platformId)) return true;

  if (auth.isAdmin()) return true;

  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};
