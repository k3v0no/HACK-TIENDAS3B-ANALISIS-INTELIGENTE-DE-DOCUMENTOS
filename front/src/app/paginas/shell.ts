// Marco de la aplicación con sesión: barra lateral con navegación según permisos.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CuentasService, PERFIL_INFO, TIPO_ARRENDADOR } from '../core/cuentas.service';
import { ExpedientesService } from '../core/expedientes.service';
import { Glifo } from '../ui/ui';

interface Enlace { ruta: string; texto: string; icono: string }

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Glifo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <div class="marco" [class.menu-abierto]="menuAbierto()">
      <header class="barra-movil">
        <div class="marca3b"><span class="logo" aria-hidden="true">3B</span><span>Tiendas 3B</span></div>
        <button type="button" class="btn chico" (click)="menuAbierto.set(!menuAbierto())" [attr.aria-expanded]="menuAbierto()"
                aria-controls="lateral"><span class="ms" aria-hidden="true">{{ menuAbierto() ? 'close' : 'menu' }}</span>Menú</button>
      </header>

      <aside id="lateral" class="lateral">
        <div class="marca3b"><span class="logo" aria-hidden="true">3B</span><span>Tiendas 3B<small>Revisión de expedientes</small></span></div>

        <nav aria-label="Principal">
          @for (e of enlaces(); track e.ruta) {
            <a [routerLink]="e.ruta" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: false }" ariaCurrentWhenActive="page">
              <span class="ms" aria-hidden="true">{{ e.icono }}</span>{{ e.texto }}</a>
          }
        </nav>

        <div class="pie">
          @if (cuenta(); as c) {
            <div class="usuario">
              <span class="avatar" aria-hidden="true">{{ iniciales() }}</span>
              <span><b>{{ c.nombre }}</b><small>{{ c.perfil }}</small></span>
            </div>
            @if (esArrendador()) {
              @if (ultimo(); as u) {
                <div class="ultimo"><p>Tu último envío</p><app-glifo [tipos]="u" /><span class="suave pequeno">{{ u.size }} de 4 cargados</span></div>
              } @else {
                <p class="suave pequeno">Aún no has enviado documentos.</p>
              }
            } @else {
              <p class="suave pequeno">{{ descripcion() }}</p>
            }
          }
          <button type="button" class="btn ancho" (click)="salir()"><span class="ms" aria-hidden="true">logout</span>Cerrar sesión</button>
        </div>
      </aside>

      <main id="contenido" class="contenido" tabindex="-1"><router-outlet /></main>
    </div>
  `,
  styles: `
    .saltar { position: absolute; left: -999px; top: .5rem; z-index: 10; background: var(--texto); color: #fff; padding: .5rem 1rem; border-radius: 8px; }
    .saltar:focus { left: .5rem; }
    .marco { display: grid; grid-template-columns: 17rem 1fr; min-height: 100vh;
      background: linear-gradient(to right, var(--superficie) 17rem, var(--borde) 17rem, var(--borde) calc(17rem + 1px), var(--fondo) calc(17rem + 1px)); }
    .lateral { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 1.4rem; padding: 1.25rem;
      background: var(--superficie); border-right: 1px solid var(--borde); overflow-y: auto; }
    .marca3b { display: inline-flex; align-items: center; gap: .6rem; font-weight: 700; }
    .marca3b .logo { width: 2.4rem; height: 2.4rem; border-radius: 10px; background: var(--rojo); color: #fff; display: grid;
      place-items: center; font-family: var(--titulos); font-weight: 800; font-size: 1.2rem; letter-spacing: -0.04em; flex: none; }
    .marca3b small { display: block; font-weight: 500; color: var(--texto-suave); font-size: .78rem; }
    nav { display: grid; gap: .25rem; }
    nav a { display: flex; align-items: center; gap: .7rem; padding: .6rem .75rem; border-radius: 10px; color: var(--texto);
      text-decoration: none; font-weight: 600; font-size: .95rem; }
    nav a:hover { background: var(--gris); }
    nav a.activo { background: var(--rojo-suave); color: var(--rojo-texto); }
    nav a .ms { font-size: 1.3rem; }
    .pie { margin-top: auto; display: grid; gap: .8rem; padding-top: 1rem; border-top: 1px solid var(--borde); }
    .usuario { display: flex; gap: .7rem; align-items: center; }
    .avatar { width: 2.5rem; height: 2.5rem; border-radius: 50%; background: var(--rojo-suave); color: var(--rojo-texto);
      display: grid; place-items: center; font-weight: 700; flex: none; }
    .usuario b { display: block; line-height: 1.3; } .usuario small { color: var(--texto-suave); }
    .ultimo p { font-weight: 600; font-size: .88rem; margin-bottom: .35rem; }
    .ultimo .pequeno { display: block; margin-top: .3rem; }
    .contenido { padding: 2rem clamp(1rem, 3vw, 2.5rem) 4rem; max-width: 1240px; width: 100%; min-width: 0; }
    .contenido:focus { outline: none; }
    .barra-movil { display: none; }
    @media (max-width: 900px) {
      .marco { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; background: var(--fondo); }
      .barra-movil { display: flex; justify-content: space-between; align-items: center; padding: .75rem 1rem;
        background: var(--superficie); border-bottom: 1px solid var(--borde); position: sticky; top: 0; z-index: 5; }
      .lateral { display: none; position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--borde); }
      .lateral > .marca3b { display: none; }
      .menu-abierto .lateral { display: flex; }
      .contenido { padding-top: 1.4rem; }
    }
  `,
})
export class Shell {
  private readonly cuentas = inject(CuentasService);
  private readonly expedientes = inject(ExpedientesService);
  private readonly router = inject(Router);

  protected readonly cuenta = this.cuentas.cuenta;
  protected readonly menuAbierto = signal(false);
  protected readonly esArrendador = computed(() => this.cuenta()?.tipo === TIPO_ARRENDADOR);
  protected readonly iniciales = computed(() =>
    (this.cuenta()?.nombre ?? '').split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase());
  protected readonly descripcion = computed(() => PERFIL_INFO[this.cuenta()?.perfil ?? '']?.descripcion ?? '');
  protected readonly ultimo = computed(() => {
    const c = this.cuenta();
    const propios = c ? this.expedientes.lista().filter((e) => e.cuenta === c.usuario) : [];
    return propios.length ? ExpedientesService.tipos(propios[0]) : null;
  });

  protected readonly enlaces = computed<Enlace[]>(() => {
    if (!this.cuenta()) return [];
    if (this.esArrendador()) {
      return [
        { ruta: '/arrendador/enviar', texto: 'Enviar documentos', icono: 'upload_file' },
        { ruta: '/arrendador/tramites', texto: 'Mis trámites', icono: 'folder_shared' },
      ];
    }
    const enlaces: Enlace[] = [];
    if (this.cuentas.puede('expedientes.ver')) enlaces.push({ ruta: '/trabajador/bandeja', texto: 'Bandeja', icono: 'inbox' });
    if (this.cuentas.puede('expedientes.cargar')) enlaces.push({ ruta: '/trabajador/cargar', texto: 'Cargar expediente', icono: 'upload_file' });
    if (this.cuentas.puede('usuarios.admin')) {
      enlaces.push({ ruta: '/admin/usuarios', texto: 'Usuarios', icono: 'person_add' });
      enlaces.push({ ruta: '/admin/trabajadores', texto: 'Trabajadores', icono: 'badge' });
    }
    return enlaces;
  });

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menuAbierto.set(false));
  }

  protected salir(): void {
    this.cuentas.cerrarSesion();
    this.router.navigateByUrl('/');
  }
}
