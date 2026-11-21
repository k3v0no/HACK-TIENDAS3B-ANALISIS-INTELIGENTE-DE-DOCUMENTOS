// Bandeja del analista de expansión: una tabla de inmuebles con lo que impide avanzar y quién
// tiene la siguiente acción. Los filtros siguen las etapas de su trabajo.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { queImpideAvanzar, siguienteAccion } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { Expediente } from '../../core/modelos';
import { Encabezado, Estado, Glifo, fecha } from '../../ui/ui';

type Filtro = 'todos' | 'recien' | 'documentos' | 'juridico' | 'decision' | 'decididos';
const FILTROS: { id: Filtro; texto: string; icono: string }[] = [
  { id: 'todos', texto: 'Todos', icono: 'list' },
  { id: 'recien', texto: 'Recién cargados', icono: 'fiber_new' },
  { id: 'documentos', texto: 'Pendientes documentales', icono: 'description' },
  { id: 'juridico', texto: 'En Jurídico', icono: 'gavel' },
  { id: 'decision', texto: 'Listos para decisión', icono: 'flag' },
  { id: 'decididos', texto: 'Decididos', icono: 'task_alt' },
];

@Component({
  selector: 'app-inmuebles',
  imports: [Encabezado, Estado, Glifo, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="travel_explore" titulo="Mis inmuebles"
      descripcion="Qué impide avanzar en cada inmueble y quién tiene la siguiente acción." />

    <div class="filtros" role="group" aria-label="Filtrar por etapa">
      @for (f of filtros; track f.id) {
        <button type="button" class="filtro" [class.activo]="filtro() === f.id" [attr.aria-pressed]="filtro() === f.id" (click)="filtro.set(f.id)">
          <span class="ms" aria-hidden="true">{{ f.icono }}</span>{{ f.texto }}<span class="n">{{ conteo()[f.id] }}</span>
        </button>
      }
    </div>
    <div class="envoltura-icono buscar">
      <span class="ms" aria-hidden="true">search</span>
      <label class="sr-only" for="buscar">Buscar por dirección o folio</label>
      <input id="buscar" class="entrada con-icono" placeholder="Buscar por dirección o folio" [ngModel]="q()" (ngModelChange)="q.set($event)">
    </div>

    @if (filas().length) {
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th scope="col">Inmueble</th><th scope="col">Documentos</th><th scope="col">Recomendación</th>
            <th scope="col">Qué impide avanzar</th><th scope="col">Siguiente acción</th></tr></thead>
          <tbody>
            @for (f of filas(); track f.e.id) {
              <tr>
                <td data-titulo="Inmueble"><a class="enlace" [routerLink]="['/analista/expediente', f.e.id]">{{ f.titulo }}</a>
                  <span class="suave pequeno">Folio {{ f.e.id }}, {{ fecha(f.e.fecha, false) }}</span></td>
                <td data-titulo="Documentos"><app-glifo [tipos]="tipos(f.e)" /></td>
                <td data-titulo="Recomendación"><app-estado [valor]="estado(f.e)" /></td>
                <td data-titulo="Qué impide avanzar" class="impide">{{ f.bloqueo }}</td>
                <td data-titulo="Siguiente acción"><span class="resp"><span class="ms" aria-hidden="true">{{ f.sig.icono }}</span>
                  <span><b>{{ f.sig.area }}</b><small>{{ f.sig.accion }}</small></span></span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <section class="tarjeta vacio">
        <span class="icono-caja"><span class="ms" aria-hidden="true">inbox</span></span>
        <div><h2>{{ todos().length ? 'Ningún inmueble en esta etapa' : 'Aún no hay inmuebles' }}</h2>
          <p class="suave">{{ todos().length ? 'Cambia el filtro o la búsqueda.' : 'Aparecerán aquí cuando un arrendador envíe sus documentos.' }}</p></div>
      </section>
    }
  `,
  styles: `
    .filtros { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .8rem; }
    .filtro { border: 1px solid var(--borde); background: var(--superficie); border-radius: 999px; padding: .4rem .8rem; font-weight: 600;
      font-size: .88rem; cursor: pointer; display: inline-flex; gap: .4rem; align-items: center; color: var(--texto); }
    .filtro .ms { font-size: 1.1rem; color: var(--texto-suave); }
    .filtro.activo { background: var(--texto); border-color: var(--texto); color: #fff; }
    .filtro.activo .ms { color: #fff; }
    .n { font-size: .75rem; padding: 0 .45rem; border-radius: 99px; background: var(--gris); color: var(--texto); }
    .filtro.activo .n { background: rgba(255,255,255,.2); color: #fff; }
    .buscar { max-width: 24rem; margin-bottom: 1rem; }
    .tabla-envoltura { background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); overflow-x: auto; box-shadow: var(--sombra); }
    .tabla { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th { text-align: left; font-size: .8rem; font-weight: 600; color: var(--texto-suave); padding: .7rem 1rem; border-bottom: 1px solid var(--borde); background: #FAFBFB; }
    td { padding: .85rem 1rem; border-bottom: 1px solid var(--borde); vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    tbody tr:hover { background: #FCFCFC; }
    .enlace { font-weight: 700; color: var(--texto); text-decoration: none; display: block; }
    .enlace:hover { color: var(--rojo-texto); text-decoration: underline; }
    .impide { max-width: 22rem; font-weight: 500; }
    .resp { display: flex; gap: .5rem; align-items: flex-start; }
    .resp .ms { color: var(--rojo-accion); margin-top: .1rem; }
    .resp b { display: block; } .resp small { color: var(--texto-suave); }
    .vacio { display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; }
    .vacio h2 { font-size: 1.15rem; }
    @media (max-width: 900px) {
      thead { display: none; }
      tr { display: grid; gap: .5rem; padding: .9rem 1rem; border-bottom: 1px solid var(--borde); }
      td { padding: 0; border: 0; }
      td::before { content: attr(data-titulo); display: block; font-size: .75rem; color: var(--texto-suave); font-weight: 600; }
    }
  `,
})
export class Inmuebles {
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly filtros = FILTROS;
  protected readonly fecha = fecha;
  protected readonly tipos = ExpedientesService.tipos;
  protected readonly estado = ExpedientesService.estado;
  protected readonly filtro = signal<Filtro>('todos');
  protected readonly q = signal('');
  protected readonly todos = this.expedientes.lista;

  private readonly enriquecidos = computed(() => {
    const tareas = this.flujo.tareas(), vals = this.flujo.validaciones();
    return this.todos().map((e) => {
      const decision = this.flujo.decisionDe(e.id);
      const abiertas = tareas.filter((t) => t.exp === e.id && t.estado !== 'resuelto');
      const sig = siguienteAccion(e, tareas, vals, decision);
      const etapas = new Set<Filtro>(['todos']);
      if (decision) etapas.add('decididos');
      if (!decision && !tareas.some((t) => t.exp === e.id) && !vals.some((v) => v.exp === e.id)) etapas.add('recien');
      if (abiertas.some((t) => t.tipo === 'solicitud_documento' || t.documento) || (e.dictamen?.faltantes.length ?? 0) > 0) etapas.add('documentos');
      if (abiertas.some((t) => t.area === 'Jurídico')) etapas.add('juridico');
      if (sig.area === 'Gerencia') etapas.add('decision');
      return { e, sig, etapas, titulo: ExpedientesService.titulo(e), bloqueo: queImpideAvanzar(e).frase };
    });
  });

  protected readonly conteo = computed(() => {
    const c = Object.fromEntries(FILTROS.map((f) => [f.id, 0])) as Record<Filtro, number>;
    for (const x of this.enriquecidos()) for (const f of x.etapas) c[f]++;
    return c;
  });

  protected readonly filas = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.enriquecidos().filter((x) => x.etapas.has(this.filtro()) &&
      (!q || x.titulo.toLowerCase().includes(q) || x.e.id.toLowerCase().includes(q)));
  });

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.sincronizarEnProceso();
    const reloj = setInterval(() => {
      if (this.todos().some((e: Expediente) => ExpedientesService.enProceso(e))) this.expedientes.sincronizarEnProceso();
    }, 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }
}
