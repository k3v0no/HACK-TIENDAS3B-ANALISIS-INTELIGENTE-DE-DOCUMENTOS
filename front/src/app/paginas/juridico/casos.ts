// Bandeja de Jurídico: casos que necesitan criterio, priorizados y filtrables por causa.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { causas, estadoValidacion } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { CAUSAS, Causa } from '../../core/reglas-catalogo';
import { Encabezado, Estado, fecha } from '../../ui/ui';

const PRIORIDAD: Record<string, number> = { 'No cumple': 0, 'Requiere revisión': 1, Cumple: 2, Analizando: 3, 'Sin analizar': 4 };

@Component({
  selector: 'app-casos',
  imports: [Encabezado, Estado, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="gavel" titulo="Casos jurídicos"
      descripcion="Primero lo turnado a Jurídico; después lo que no cumple o requiere revisión. Filtra por la causa del problema." />

    <div class="barra">
      <div class="filtros" role="group" aria-label="Filtrar por causa">
        <button type="button" class="filtro" [class.activo]="!causa()" [attr.aria-pressed]="!causa()" (click)="causa.set(null)">Todas las causas</button>
        @for (c of causas; track c) {
          <button type="button" class="filtro" [class.activo]="causa() === c" [attr.aria-pressed]="causa() === c" (click)="causa.set(c)">
            {{ c }} <span class="n">{{ conteo()[c] }}</span></button>
        }
      </div>
      <label class="interruptor"><input type="checkbox" [checked]="incluirCumple()" (change)="incluirCumple.set($any($event.target).checked)">
        Incluir los que cumplen, para verificarlos</label>
    </div>

    @for (grupo of grupos(); track grupo.titulo) {
      @if (grupo.casos.length) {
        <h2 class="grupo"><span class="ms" aria-hidden="true">{{ grupo.icono }}</span>{{ grupo.titulo }} <span class="n">{{ grupo.casos.length }}</span></h2>
        <div class="casos">
          @for (c of grupo.casos; track c.e.id) {
            <a class="tarjeta caso" [routerLink]="['/juridico/expediente', c.e.id]">
              <span class="arriba"><app-estado [valor]="c.estado" /><span class="suave pequeno">Folio {{ c.e.id }}</span></span>
              <b class="titulo">{{ c.titulo }}</b>
              <span class="causas">@for (x of c.causas; track x) { <span class="badge neutra">{{ x }}</span> }</span>
              <span class="pie">
                <span class="progreso" [attr.aria-label]="c.val.texto"><i [style.width.%]="c.val.total ? c.val.hechos / c.val.total * 100 : 100"></i></span>
                <span class="suave pequeno">{{ c.val.texto }}</span>
              </span>
              @if (c.turnado; as t) { <span class="turnado"><span class="ms" aria-hidden="true">assignment_ind</span>Turnado por {{ t.creadoPor }} el {{ fecha(t.fecha, false) }}: {{ t.titulo }}</span> }
            </a>
          }
        </div>
      }
    }
    @if (!total()) {
      <section class="tarjeta vacio"><span class="icono-caja"><span class="ms" aria-hidden="true">task_alt</span></span>
        <div><h2>No hay casos con esa causa</h2><p class="suave">Cambia el filtro o incluye los que cumplen.</p></div></section>
    }
  `,
  styles: `
    .barra { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: center; margin-bottom: 1.2rem; }
    .filtros { display: flex; gap: .4rem; flex-wrap: wrap; }
    .filtro { border: 1px solid var(--borde); background: var(--superficie); border-radius: 8px; padding: .35rem .7rem; font-weight: 600;
      font-size: .86rem; cursor: pointer; color: var(--texto); display: inline-flex; gap: .35rem; align-items: center; }
    .filtro.activo { background: var(--texto); border-color: var(--texto); color: #fff; }
    .n { font-size: .75rem; padding: 0 .45rem; border-radius: 99px; background: var(--gris); color: var(--texto); font-family: var(--cuerpo); }
    .filtro.activo .n { background: rgba(255,255,255,.2); color: #fff; }
    .interruptor { display: inline-flex; gap: .45rem; align-items: center; font-size: .9rem; cursor: pointer; }
    .interruptor input { width: 1.1rem; height: 1.1rem; accent-color: var(--rojo-accion); }
    .grupo { font-size: 1.05rem; display: flex; align-items: center; gap: .45rem; margin: 1.4rem 0 .7rem; }
    .casos { display: grid; grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); gap: .8rem; }
    .caso { display: grid; gap: .55rem; text-decoration: none; color: inherit; margin: 0 !important; border-top: 4px solid var(--borde-fuerte); transition: box-shadow .15s; }
    .caso:hover { box-shadow: var(--sombra-alta); }
    .arriba { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .titulo { font-size: 1rem; overflow-wrap: anywhere; }
    .causas { display: flex; flex-wrap: wrap; gap: .3rem; }
    .pie { display: grid; gap: .25rem; }
    .progreso { height: .35rem; border-radius: 99px; background: var(--gris); overflow: hidden; }
    .progreso i { display: block; height: 100%; background: var(--verde-texto); }
    .turnado { display: flex; gap: .35rem; align-items: flex-start; font-size: .84rem; color: var(--rojo-texto); font-weight: 600; }
    .vacio { display: flex; gap: 1rem; padding: 1.5rem; }
    .vacio h2 { font-size: 1.1rem; }
  `,
})
export class Casos {
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly causas = CAUSAS;
  protected readonly fecha = fecha;
  protected readonly causa = signal<Causa | null>(null);
  protected readonly incluirCumple = signal(false);

  private readonly casos = computed(() => {
    const vals = this.flujo.validaciones();
    const tareas = this.flujo.abiertas();
    return this.expedientes.lista().filter((e) => e.dictamen).map((e) => ({
      e, estado: ExpedientesService.estado(e), titulo: ExpedientesService.titulo(e), causas: [...causas(e.dictamen)],
      val: estadoValidacion(e, vals), turnado: tareas.find((t) => t.exp === e.id && t.area === 'Jurídico'),
    })).sort((a, b) => Number(!a.turnado) - Number(!b.turnado) || PRIORIDAD[a.estado] - PRIORIDAD[b.estado]);
  });

  protected readonly conteo = computed(() => {
    const c = Object.fromEntries(CAUSAS.map((x) => [x, 0])) as Record<Causa, number>;
    for (const x of this.visibles()) for (const k of x.causas) c[k as Causa]++;
    return c;
  });

  private readonly visibles = computed(() => this.casos().filter((c) => this.incluirCumple() || c.estado !== 'Cumple' || c.turnado));

  protected readonly grupos = computed(() => {
    const filtrados = this.visibles().filter((c) => !this.causa() || c.causas.includes(this.causa()!));
    return [
      { titulo: 'Turnados a Jurídico', icono: 'assignment_ind', casos: filtrados.filter((c) => c.turnado) },
      { titulo: 'Por revisar', icono: 'pending_actions', casos: filtrados.filter((c) => !c.turnado && c.val.estado !== 'validado' && c.estado !== 'Cumple') },
      { titulo: 'Validados', icono: 'verified', casos: filtrados.filter((c) => !c.turnado && c.val.estado === 'validado' && c.estado !== 'Cumple') },
      { titulo: 'Cumplen (verificación)', icono: 'check_circle', casos: filtrados.filter((c) => !c.turnado && c.estado === 'Cumple') },
    ];
  });
  protected readonly total = computed(() => this.grupos().reduce((n, g) => n + g.casos.length, 0));

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.sincronizarEnProceso();
    const reloj = setInterval(() => this.expedientes.sincronizarEnProceso(), 6000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }
}
