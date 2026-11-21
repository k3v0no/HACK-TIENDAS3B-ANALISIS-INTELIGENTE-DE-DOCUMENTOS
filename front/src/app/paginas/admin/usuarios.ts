// Alta de trabajadores: el superusuario crea la cuenta y elige el área. Los permisos de cada área
// están en cuentas.service.ts (PERMISOS). La lista de trabajadores está en su propia sección.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AREAS, CuentasService, PERFIL_INFO } from '../../core/cuentas.service';
import { Encabezado } from '../../ui/ui';

@Component({
  selector: 'app-usuarios',
  imports: [Encabezado, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="person_add" titulo="Usuarios"
      descripcion="Da de alta a los trabajadores de 3B y elige su área. El área define qué información del expediente pueden ver." />

    <section class="tarjeta alta" aria-labelledby="alta-t">
      <div class="cabeza">
        <span class="icono-caja"><span class="ms" aria-hidden="true">person_add</span></span>
        <div><h2 id="alta-t">Agregar trabajador</h2><p class="suave pequeno">Recibirá una contraseña temporal.</p></div>
      </div>
      <form (ngSubmit)="crear()">
        <div class="campo">
          <label for="alta-nombre">Nombre completo</label>
          <input id="alta-nombre" class="entrada" name="nombre" [(ngModel)]="nombre" autocomplete="off">
        </div>
        <div class="campo">
          <label for="alta-usuario">Usuario</label>
          <input id="alta-usuario" class="entrada" name="usuario" [(ngModel)]="usuario" placeholder="nombre.apellido" autocomplete="off">
        </div>
        <div class="campo">
          <label for="alta-area">Área</label>
          <div class="envoltura-icono selector">
            <span class="ms" aria-hidden="true">{{ PERFIL_INFO[area()].icono }}</span>
            <select id="alta-area" class="entrada con-icono" name="area" [ngModel]="area()" (ngModelChange)="area.set($event)"
                    aria-describedby="alta-area-ayuda">
              @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
            </select>
            <span class="ms flecha" aria-hidden="true">expand_more</span>
          </div>
          <small id="alta-area-ayuda">{{ descripcion() }}</small>
        </div>
        @if (error()) { <div class="aviso error" role="alert"><span class="ms" aria-hidden="true">error</span>{{ error() }}</div> }
        @if (creado(); as c) {
          <div class="aviso exito" role="status"><span class="ms" aria-hidden="true">check_circle</span>
            <span>Se agregó a {{ c.nombre }} en {{ c.area.toLowerCase() }}. Contraseña temporal: <b class="clave">{{ c.temporal }}</b>.
              Compártela por un medio seguro; no se volverá a mostrar.
              <a routerLink="/admin/trabajadores">Ver trabajadores</a></span></div>
        }
        <button class="btn primario ancho" type="submit" [disabled]="ocupado()"><span class="ms" aria-hidden="true">person_add</span>Agregar trabajador</button>
      </form>
    </section>
  `,
  styles: `
    .alta { max-width: 34rem; padding: 1.4rem; }
    .cabeza { display: flex; gap: .9rem; align-items: center; margin-bottom: 1.2rem; }
    .cabeza h2 { font-size: 1.15rem; }
    .selector select { appearance: none; padding-right: 2.4rem; cursor: pointer; }
    .selector > .ms:first-child { color: var(--rojo-accion); }
    .selector .flecha { position: absolute; left: auto; right: .7rem; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--texto-suave); }
    .aviso { margin-bottom: 1rem; }
    .clave { font-family: var(--titulos); letter-spacing: .04em; }
  `,
})
export class Usuarios {
  private readonly cuentas = inject(CuentasService);
  protected readonly areas = AREAS;
  protected readonly PERFIL_INFO = PERFIL_INFO;

  protected readonly area = signal(AREAS[0]);
  protected readonly descripcion = computed(() => PERFIL_INFO[this.area()].descripcion);
  protected readonly error = signal('');
  protected readonly ocupado = signal(false);
  protected readonly creado = signal<{ nombre: string; area: string; temporal: string } | null>(null);
  protected nombre = '';
  protected usuario = '';

  protected async crear(): Promise<void> {
    this.error.set('');
    this.creado.set(null);
    if (!this.nombre.trim() || !this.usuario.trim()) {
      this.error.set('Escribe el nombre y el usuario para agregar al trabajador.');
      return;
    }
    this.ocupado.set(true);
    try {
      const { cuenta, temporal } = await this.cuentas.crearTrabajador(this.usuario, this.nombre, this.area());
      this.creado.set({ nombre: cuenta.nombre, area: cuenta.perfil, temporal });
      this.nombre = '';
      this.usuario = '';
    } catch (e) {
      this.error.set(`No se pudo agregar: ${(e as Error).message}.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}
