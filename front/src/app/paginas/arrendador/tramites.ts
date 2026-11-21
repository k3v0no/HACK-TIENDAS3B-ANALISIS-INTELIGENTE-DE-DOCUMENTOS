// Seguimiento del arrendador. Nunca muestra hallazgos internos ni el dictamen (sección 10 del
// plan): solo qué documentos ya cargó, en qué paso va el trámite y lo que puede resolver.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { DOC, Expediente, TIPOS_DOCUMENTO, TipoDocumento } from '../../core/modelos';
import { Encabezado, FilaDocumento, Glifo, ListaDocs, fecha } from '../../ui/ui';

interface Tramite {
  exp: Expediente;
  titulo: string;
  filas: FilaDocumento[];
  pendientes: string[];
  etapa: number; // 0 enviados, 1 en revisión, 2 respuesta
  cargados: number;
}

const ETAPAS = [
  { nombre: 'Documentos enviados', icono: 'send' },
  { nombre: 'Revisión de Tiendas 3B', icono: 'manage_search' },
  { nombre: 'Respuesta', icono: 'mark_email_read' },
];

@Component({
  selector: 'app-tramites',
  imports: [Encabezado, Glifo, ListaDocs, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="folder_shared" titulo="Mis trámites"
      descripcion="Qué documentos ya cargaste, en qué va la revisión y qué falta." />

    @for (t of tramites(); track t.exp.id) {
      <article class="tarjeta tramite">
        <div class="fila entre cabeza">
          <div>
            <h2>{{ t.titulo }}</h2>
            <p class="suave pequeno">Enviado el {{ fecha(t.exp.fecha, false) }}. Folio {{ t.exp.id }}.</p>
          </div>
          <div class="conteo"><app-glifo [tipos]="tipos(t.exp)" /><span class="suave pequeno">{{ t.cargados }} de 4 documentos cargados</span></div>
        </div>

        <ol class="etapas" aria-label="Avance del trámite">
          @for (e of etapas; track e.nombre; let i = $index) {
            <li [class.hecho]="i < t.etapa" [class.actual]="i === t.etapa" [attr.aria-current]="i === t.etapa ? 'step' : null">
              <span class="riel"></span>
              <span class="nombre"><span class="punto"><span class="ms" aria-hidden="true">{{ i < t.etapa ? 'check' : e.icono }}</span></span>{{ e.nombre }}</span>
            </li>
          }
        </ol>

        @if (t.pendientes.length) {
          <div class="aviso alerta"><span class="ms" aria-hidden="true">assignment_late</span>
            <div><b>Para continuar necesitamos:</b><ul>@for (p of t.pendientes; track p) { <li>{{ p }}</li> }</ul></div></div>
        } @else if (t.etapa === 2) {
          <div class="aviso exito"><span class="ms" aria-hidden="true">check_circle</span>Tus documentos están completos. Tiendas 3B te contactará con la respuesta.</div>
        } @else {
          <div class="aviso info"><span class="ms" aria-hidden="true">manage_search</span>Recibimos tus documentos y los estamos revisando.</div>
        }
        <app-lista-docs [filas]="t.filas" />
      </article>
    } @empty {
      <section class="tarjeta vacio">
        <span class="icono-caja"><span class="ms" aria-hidden="true">folder_open</span></span>
        <div>
          <h2>Todavía no has enviado documentos</h2>
          <p class="suave">Cuando lo hagas, aquí verás qué documentos ya cargaste y en qué paso va tu trámite.</p>
          <a class="btn primario" routerLink="/arrendador/enviar"><span class="ms" aria-hidden="true">upload_file</span>Enviar documentos</a>
        </div>
      </section>
    }
  `,
  styles: `
    .tramite { padding: 1.4rem; }
    .cabeza { align-items: flex-start; }
    h2 { font-size: 1.2rem; overflow-wrap: anywhere; }
    .conteo { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
    .etapas { list-style: none; padding: 0; margin: 1.2rem 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }
    .etapas li { display: flex; flex-direction: column; gap: .45rem; font-size: .88rem; color: var(--texto-suave); }
    .riel { height: .3rem; border-radius: 99px; background: var(--borde); }
    .nombre { display: flex; align-items: center; gap: .4rem; font-weight: 600; }
    .punto { width: 1.7rem; height: 1.7rem; border-radius: 50%; display: grid; place-items: center; flex: none;
      border: 1.5px solid var(--borde); background: var(--superficie); font-size: 1rem; }
    .hecho, .actual { color: var(--texto); }
    .hecho .riel, .hecho .punto { background: var(--verde); border-color: var(--verde); }
    .actual .riel { background: var(--rojo-accion); }
    .actual .punto { border-color: var(--rojo-accion); color: var(--rojo-accion); }
    .aviso { margin-bottom: .6rem; }
    .vacio { display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; }
    .vacio p { margin: .25rem 0 1rem; }
    @media (max-width: 560px) { .etapas { grid-template-columns: 1fr; } }
  `,
})
export class Tramites {
  private readonly cuentas = inject(CuentasService);
  private readonly expedientes = inject(ExpedientesService);
  protected readonly etapas = ETAPAS;
  protected readonly fecha = fecha;
  protected readonly tipos = ExpedientesService.tipos;

  protected readonly tramites = computed<Tramite[]>(() => {
    const usuario = this.cuentas.cuenta()?.usuario;
    return this.expedientes.lista().filter((e) => e.cuenta === usuario).map((e) => this.armar(e));
  });

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.sincronizarEnProceso();
    const reloj = setInterval(() => {
      if (this.expedientes.lista().some(ExpedientesService.enProceso)) this.expedientes.sincronizarEnProceso();
    }, 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  private armar(e: Expediente): Tramite {
    const porTipo = new Map<TipoDocumento, string[]>();
    for (const a of e.archivos) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a.nombre]);
    const vencidos = new Set<string>();
    if (e.dictamen) {
      const tipoDe = new Map(e.dictamen.documentos.map((d) => [d.id, d.tipo]));
      for (const v of e.dictamen.validaciones) {
        if (v.resultado === 'no_cumple' && /vigen/i.test(v.nombre) && v.documento) vencidos.add(tipoDe.get(v.documento) ?? '');
      }
    }
    const filas: FilaDocumento[] = [];
    const pendientes: string[] = [];
    for (const tipo of TIPOS_DOCUMENTO) {
      const nombres = porTipo.get(tipo);
      if (!nombres) {
        filas.push({ tipo, detalle: 'No enviado', estado: 'no' });
        pendientes.push(`Enviar ${tipo.toLowerCase()}: ${DOC[tipo].que.toLowerCase()}.`);
      } else if (vencidos.has(tipo)) {
        filas.push({ tipo, detalle: nombres.join(', '), estado: 'vencido' });
        pendientes.push(`Renovar ${tipo.toLowerCase()}: el documento que enviaste ya venció.`);
      } else {
        filas.push({ tipo, detalle: nombres.join(', '), estado: 'si' });
      }
    }
    return {
      exp: e, titulo: ExpedientesService.titulo(e), filas, pendientes,
      etapa: e.dictamen && !pendientes.length ? 2 : 1, cargados: porTipo.size,
    };
  }
}
