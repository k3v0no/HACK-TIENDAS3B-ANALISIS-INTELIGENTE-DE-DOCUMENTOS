// Lista de trabajadores: el superusuario ve sus áreas y activa o desactiva su acceso.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cuenta, CuentasService, PERFIL_INFO } from '../../core/cuentas.service';
import { Encabezado } from '../../ui/ui';

@Component({
  selector: 'app-trabajadores',
  imports: [Encabezado, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="badge" titulo="Trabajadores" [descripcion]="lista().length + ' cuentas del equipo de 3B. Desactiva una cuenta para quitarle el acceso sin borrarla.'">
      <a class="btn primario" routerLink="/admin/usuarios"><span class="ms" aria-hidden="true">person_add</span>Agregar trabajador</a>
    </app-encabezado>

    @for (t of lista(); track t.usuario) {
      <article class="tarjeta persona" [class.inactiva]="!t.activo">
        <span class="icono-caja"><span class="ms" aria-hidden="true">{{ PERFIL_INFO[t.perfil]?.icono ?? 'person' }}</span></span>
        <div class="datos">
          <b>{{ t.nombre }}</b>
          <span class="suave pequeno">{{ t.perfil }}, usuario {{ t.usuario }}</span>
          @if (!t.activo) { <span class="badge neutra"><span class="ms" aria-hidden="true">block</span>Desactivado</span> }
        </div>
        @if (t.usuario === yo()) {
          <span class="badge neutra"><span class="ms" aria-hidden="true">person</span>Tu cuenta</span>
        } @else if (t.activo) {
          <button type="button" class="btn chico" (click)="alternar(t, false)" [attr.aria-label]="'Desactivar a ' + t.nombre">
            <span class="ms" aria-hidden="true">block</span>Desactivar</button>
        } @else {
          <button type="button" class="btn chico" (click)="alternar(t, true)" [attr.aria-label]="'Activar a ' + t.nombre">
            <span class="ms" aria-hidden="true">check</span>Activar</button>
        }
      </article>
    }
  `,
  styles: `
    .persona { display: flex; gap: .9rem; align-items: center; padding: .9rem 1rem; max-width: 52rem; }
    .persona + .persona { margin-top: .55rem; }
    .persona .icono-caja { width: 2.6rem; height: 2.6rem; font-size: 1.25rem; }
    .persona.inactiva { background: #FAFBFB; border-style: dashed; box-shadow: none; }
    .persona.inactiva .icono-caja { background: var(--gris); color: var(--texto-suave); }
    .datos { flex: 1; min-width: 0; display: grid; gap: .1rem; justify-items: start; }
  `,
})
export class Trabajadores {
  private readonly cuentas = inject(CuentasService);
  protected readonly PERFIL_INFO = PERFIL_INFO;
  protected readonly yo = () => this.cuentas.cuenta()?.usuario;
  protected readonly lista = signal<Cuenta[]>([]);

  constructor() {
    this.recargar();
  }

  private async recargar(): Promise<void> {
    this.lista.set(await this.cuentas.trabajadores());
  }

  protected alternar(t: Cuenta, activo: boolean): void {
    this.cuentas.cambiarEstado(t.usuario, activo);
    this.recargar();
  }
}
