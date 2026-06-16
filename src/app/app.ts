import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './shared/header/header';
import { FooterComponent } from './shared/footer/footer';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly router = inject(Router);

  /** Pages that render standalone, without the DayToDay Electricals header/footer chrome. */
  private readonly chromelessPaths = ['/login', '/prices'];

  get isChromeless(): boolean {
    const url = this.router.url.split('?')[0].split('#')[0];
    return this.chromelessPaths.some(p => url === p || url.startsWith(p + '/'));
  }
}
