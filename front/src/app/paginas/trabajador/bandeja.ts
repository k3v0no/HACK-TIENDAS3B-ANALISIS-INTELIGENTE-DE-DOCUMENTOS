import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { EstadoBandeja, Expediente } from '../../core/modelos';
import { contarHallazgos } from '../../core/permisos-vista';
import { Encabezado, Estado, Glifo, fecha, pct } from '../../ui/ui';

// Revisión por excepción: primero lo que necesita a una persona.
const ORDEN: Record<EstadoBandeja, number> = { 'Sin analizar': 0, 'Requiere revisión': 1, 'No cumple': 2, Analizando: 3, Cumple: 4 };
const FILTROS: EstadoBandeja[] = ['Sin analizar', 'Analizando', 'Requiere revisión', 'No cumple', 'Cumple'];
const CLASE: Record<EstadoBandeja, string> = {
  'Sin analizar': 'pendiente', Analizando: 'pendiente', 'Requiere revisión': 'revisar', 'No cumple': 'no_cumple', Cumple: 'cumple',
};

@Component({
  selector: 'app-bandeja',
  imports: [Encabezado, Estado, Glifo, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="inbox" titulo="Bandeja de expedientes" descripcion="Primero aparecen los que necesitan a una persona.">
      @if (puedeCargar) {
        <a class="btn primario" routerLink="/trabajador/cargar"><span class="ms" aria-hidden="true">upload_file</span>Cargar expediente</a>
      }
    </app-encabezado>

    @if (todos().length) {
      <div class="controles">
        <div class="filtros" role="group" aria-label="Filtrar por estado">
          <button type="button" class="filtro" [class.activo]="!filtro()" [attr.aria-pressed]="!filtro()" (click)="filtro.set(null)">
            Todos <span class="n">{{ todos().length }}</span></button>
          @for (f of filtrosConDatos(); track f) {
            <button type="button" class="filtro" [class.activo]="filtro() === f" [attr.aria-pressed]="filtro() === f"
                    (click)="filtro.set(filtro() === f ? null : f)">{{ f }} <span class="n">{{ conteo()[f] }}</span></button>
          }
        </div>
        <div class="envoltura-icono buscar">
          <span class="ms" aria-hidden="true">search</span>
          <label class="sr-only" for="buscar">Buscar por dirección o folio</label>
          <input id="buscar" class="entrada con-icono" placeholder="Buscar por dirección o folio" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)">
        </div>
      </div>

      @for (e of visibles(); track e.id) {
        <a class="tarjeta fila-exp" [class]="'tarjeta fila-exp ' + clase(e)" [routerLink]="['/trabajador/expediente', e.id]">
          <span class="principal">
            <b>{{ titulo(e) }}</b>
            <span class="suave pequeno">{{ e.origen === 'arrendador' ? 'Enviado por el arrendador' : 'Cargado por 3B' }}, {{ fecha(e.fecha) }}. Folio {{ e.id }}</span>
          </span>
          <app-glifo [tipos]="tipos(e)" />
          <span class="estado">
            <app-estado [valor]="estado(e)" />
            <span class="suave pequeno">
              @if (e.dictamen; as d) { {{ hallazgos(e) }} hallazgo{{ hallazgos(e) === 1 ? '' : 's' }}, confianza {{ pct(d.confianza) }} }
              @else if (estado(e) === 'Analizando') { {{ e.back?.etapa || 'En cola' }} }
              @else if (e.back?.estado === 'error') { El análisis no terminó }
              @else { Falta lanzar el análisis }
            </span>
          </span>
          <span class="abrir" aria-hidden="true"><span class="ms">chevron_right</span></span>
        </a>
      } @empty {
        <div class="aviso info"><span class="ms" aria-hidden="true">search_off</span>Ningún expediente coincide. Quita el filtro o cambia la búsqueda.</div>
      }
      <p class="suave pequeno pie">{{ visibles().length }} de {{ todos().length }} expedientes.</p>
    } @else {
      <section class="tarjeta vacio">
        <span class="icono-caja"><span class="ms" aria-hidden="true">inbox</span></span>
        <div>
          <h2>Aún no hay expedientes</h2>
          <p class="suave">Aparecerán aquí cuando un arrendador envíe sus documentos{{ puedeCargar ? ' o cuando cargues uno' : '' }}.</p>
          @if (puedeCargar) {
            <a class="btn primario" routerLink="/trabajador/cargar"><span class="ms" aria-hidden="true">upload_file</span>Cargar un expediente</a>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .controles { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
    .filtros { display: flex; gap: .4rem; flex-wrap: wrap; }
    .filtro { border: 1px solid var(--borde); background: var(--superficie); border-radius: 999px; padding: .35rem .8rem;
      font-weight: 600; font-size: .88rem; cursor: pointer; display: inline-flex; gap: .4rem; align-items: center; }
    .filtro:hover { border-color: var(--borde-fuerte); }
    .filtro.activo { background: var(--texto); border-color: var(--texto); color: #fff; }
    .filtro .n { font-size: .78rem; padding: 0 .4rem; border-radius: 99px; background: var(--gris); color: var(--texto); }
    .filtro.activo .n { background: rgba(255,255,255,.2); color: #fff; }
    .buscar { flex: 0 1 20rem; }
    .fila-exp { display: grid; grid-template-columns: minmax(0, 1fr) auto 14rem 1.5rem; gap: 1rem; align-items: center;
      text-decoration: none; color: inherit; border-left: 5px solid var(--borde-fuerte); padding: 1rem 1.1rem; margin-top: .6rem;
      transition: border-color .15s, box-shadow .15s; }
    .fila-exp:hover { box-shadow: var(--sombra-alta); }
    .fila-exp + .fila-exp { margin-top: .6rem; }
    .fila-exp.cumple { border-left-color: var(--verde); }
    .fila-exp.revisar { border-left-color: var(--ambar); }
    .fila-exp.no_cumple { border-left-color: var(--rojo); }
    .fila-exp.pendiente { border-left-style: dashed; }
    .principal { display: grid; gap: .15rem; min-width: 0; }
    .principal b { overflow-wrap: anywhere; }
    .estado { display: grid; gap: .25rem; justify-items: start; }
    .abrir { color: var(--texto-suave); }
    .pie { margin-top: 1rem; }
    .vacio { display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; }
    .vacio h2 { font-size: 1.2rem; } .vacio p { margin: .25rem 0 1rem; }
    @media (max-width: 760px) {
      .fila-exp { grid-template-columns: minmax(0, 1fr) 1.5rem; }
      .fila-exp app-glifo, .fila-exp .estado { grid-column: 1; }
      .abrir { grid-row: 1; grid-column: 2; }
      .buscar { flex-basis: 100%; }
    }
  `,
})
export class Bandeja {
  private readonly expedientes = inject(ExpedientesService);
  protected readonly puedeCargar = inject(CuentasService).puede('expedientes.cargar');
  protected readonly fecha = fecha;
  protected readonly pct = pct;
  protected readonly titulo = ExpedientesService.titulo;
  protected readonly tipos = ExpedientesService.tipos;
  protected readonly estado = ExpedientesService.estado;
  protected readonly hallazgos = (e: Expediente) => contarHallazgos(e.dictamen!);

  protected readonly filtro = signal<EstadoBandeja | null>(null);
  protected readonly busqueda = signal('');
  protected readonly todos = this.expedientes.lista;
  protected readonly conteo = computed(() => {
    const c = Object.fromEntries(FILTROS.map((f) => [f, 0])) as Record<EstadoBandeja, number>;
    for (const e of this.todos()) c[ExpedientesService.estado(e)]++;
    return c;
  });
  protected readonly filtrosConDatos = computed(() => FILTROS.filter((f) => this.conteo()[f]));
  protected readonly visibles = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const f = this.filtro();
    return this.todos()
      .filter((e) => (!f || ExpedientesService.estado(e) === f) &&
        (!q || ExpedientesService.titulo(e).toLowerCase().includes(q) || e.id.toLowerCase().includes(q)))
      .sort((a, b) => ORDEN[ExpedientesService.estado(a)] - ORDEN[ExpedientesService.estado(b)]);
  });

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.sincronizarEnProceso();
    const reloj = setInterval(() => {
      if (this.todos().some(ExpedientesService.enProceso)) this.expedientes.sincronizarEnProceso();
    }, 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected clase(e: Expediente): string {
    return CLASE[ExpedientesService.estado(e)];
  }
}
