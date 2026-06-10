import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly password = signal('');
  readonly error = signal('');
  readonly loading = signal(false);
  readonly showPassword = signal(false);

  async submit(): Promise<void> {
    const pw = this.password().trim();
    if (!pw) {
      this.error.set('Please enter the password.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const ok = await this.auth.login(pw);
    this.loading.set(false);

    if (ok) {
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
      this.router.navigateByUrl(returnUrl);
    } else {
      this.error.set('Incorrect password. Please try again.');
      this.password.set('');
    }
  }
}
