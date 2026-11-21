// Lista del auditor: cada expediente con sus corridas, eventos e intervenciones humanas.
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { Encabezado, Estado, fecha } from '../../ui/ui';

@Component({
  selector: 'app-casos-auditor',
  imports: [Encabezado, Estado, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="policy" titulo="Auditoría"
      descripcion="Reconstruye qué pasó en cada expediente: quién cargó qué, qué produjo cada análisis y qué declaró cada persona. Solo lectura." />

    <div class="tabla-envoltura">
      <table class="tabla">
        <caption class="sr-only">Expedientes auditables</caption>
        <thead><tr><th scope="col">Expediente</th><th scope="col">Resultado actual</th><th scope="col">Análisis</th>
          <th scope="col">Eventos</th><th scope="col">Intervenciones humanas</th><th scope="col">Último movimiento</th></tr></thead>
        <tbody>
          @for (x of filas(); track x.e.id) {
            <tr>
              <td data-titulo="Expediente"><a class="enlace" [routerLink]="['/auditor/expediente', x.e.id]">{{ x.titulo }}</a><small class="suave">Folio {{ x.e.id }}</small></td>
              <td data-titulo="Resultado"><app-estado [valor]="x.estado" /></td>
              <td data-titulo="Análisis" class="num">{{ x.corridas }}</td>
              <td data-titulo="Eventos" class="num">{{ x.eventos }}</td>
              <td data-titulo="Intervenciones" class="num">{{ x.humanas }}</td>
              <td data-titulo="Último movimiento"><span class="pequeno">{{ x.ultimo }}</span></td>
            </tr>
          } @empty { <tr><td colspan="6" class="vacia">Aún no hay expedientes.</td></tr> }
        </tbody>
      </table>
    </div>

    @if (globales().length) {
      <section class="tarjeta globales" aria-labelledby="glob-t">
        <h2 id="glob-t"><span class="ms" aria-hidden="true">tune</span>Cambios de reglas</h2>
        @for (g of globales(); track g.id) {
          <p class="pequeno"><b>{{ fecha(g.fecha) }}</b>, {{ g.actor }}: {{ g.detalle }}</p>
        }
      </section>
    }
  `,
  styles: `
    .tabla-envoltura { background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); overflow-x: auto; box-shadow: var(--sombra); }
    .tabla { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th { text-align: left; font-size: .8rem; font-weight: 600; color: var(--texto-suave); padding: .7rem 1rem; border-bottom: 1px solid var(--borde); background: #FAFBFB; }
    td { padding: .8rem 1rem; border-bottom: 1px solid var(--borde); vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    .num { font-family: var(--titulos); font-weight: 700; font-size: 1.1rem; }
    .enlace { font-weight: 700; color: var(--texto); text-decoration: none; display: block; }
    .enlace:hover { color: var(--rojo-texto); text-decoration: underline; }
    td small { display: block; font-size: .82rem; }
    .vacia { text-align: center; color: var(--texto-suave); padding: 1.5rem; }
    .globales { margin-top: 1.2rem; }
    .globales h2 { font-size: 1.05rem; display: flex; gap: .4rem; align-items: center; margin-bottom: .5rem; }
    @media (max-width: 900px) {
      thead { display: none; }
      tr { display: grid; gap: .5rem; padding: .9rem 1rem; border-bottom: 1px solid var(--borde); }
      td { padding: 0; border: 0; }
      td::before { content: attr(data-titulo); display: block; font-size: .75rem; color: var(--texto-suave); font-weight: 600; }
    }
  `,
})
export class CasosAuditor {
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly fecha = fecha;

  protected readonly filas = computed(() => {
    const eventos = this.flujo.eventos();
    return this.expedientes.lista().map((e) => {
      const propios = eventos.filter((x) => x.exp === e.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      return {
        e, titulo: ExpedientesService.titulo(e), estado: ExpedientesService.estado(e), corridas: e.corridas.length,
        eventos: propios.length, humanas: propios.filter((x) => x.actor !== 'Sistema' && ['correccion', 'validacion', 'decision', 'turnado', 'solicitud', 'tarea'].includes(x.tipo)).length,
        ultimo: propios[0] ? `${fecha(propios[0].fecha)}: ${propios[0].detalle}` : 'Sin movimientos',
      };
    });
  });
  protected readonly globales = computed(() => this.flujo.eventos().filter((x) => x.exp === null).reverse());

  constructor() {
    this.expedientes.refrescar();
  }
}
