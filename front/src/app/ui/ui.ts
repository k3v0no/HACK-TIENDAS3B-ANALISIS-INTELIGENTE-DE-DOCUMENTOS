// Componentes visuales pequeños y compartidos.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DOC, EstadoBandeja, Evidencia, Resultado, TIPOS_DOCUMENTO, TipoDocumento, UMBRAL_LECTURA } from '../core/modelos';

/** Título de página con icono y una línea que dice para qué sirve la página. */
@Component({
  selector: 'app-encabezado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="encabezado">
      <span class="icono-caja marca" aria-hidden="true"><span class="ms">{{ icono() }}</span></span>
      <div class="texto">
        <h1>{{ titulo() }}</h1>
        @if (descripcion()) { <p class="suave">{{ descripcion() }}</p> }
      </div>
      <div class="acciones"><ng-content /></div>
    </header>
  `,
  styles: `
    .encabezado { display: flex; gap: 1rem; align-items: center; margin-bottom: 1.6rem; flex-wrap: wrap; }
    .marca { background: var(--rojo); color: #fff; width: 3.2rem; height: 3.2rem; border-radius: 14px; font-size: 1.6rem; }
    .texto { flex: 1 1 18rem; min-width: 0; }
    h1 { font-size: clamp(1.5rem, 3vw, 2rem); overflow-wrap: anywhere; }
    p { margin-top: .2rem; max-width: 70ch; }
    .acciones:empty { display: none; }
  `,
})
export class Encabezado {
  readonly icono = input.required<string>();
  readonly titulo = input.required<string>();
  readonly descripcion = input('');
}

const ESTADO: Record<string, { clase: string; icono: string; texto: string }> = {
  Cumple: { clase: 'cumple', icono: 'check_circle', texto: 'Cumple' },
  'Requiere revisión': { clase: 'revisar', icono: 'error', texto: 'Requiere revisión' },
  'No cumple': { clase: 'no_cumple', icono: 'cancel', texto: 'No cumple' },
  'Sin analizar': { clase: 'pendiente', icono: 'hourglass_empty', texto: 'Sin analizar' },
  Analizando: { clase: 'pendiente', icono: 'progress_activity', texto: 'Analizando' },
  cumple: { clase: 'cumple', icono: 'check_circle', texto: 'Cumple' },
  revisar: { clase: 'revisar', icono: 'error', texto: 'Revisar' },
  no_cumple: { clase: 'no_cumple', icono: 'cancel', texto: 'No cumple' },
};

/** Insignia de estado: recomendación del dictamen, estado en la bandeja o resultado de validación. */
@Component({
  selector: 'app-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge ' + info().clase"><span class="ms lleno" aria-hidden="true">{{ info().icono }}</span>{{ info().texto }}</span>`,
})
export class Estado {
  readonly valor = input.required<EstadoBandeja | Resultado>();
  protected readonly info = computed(() => ESTADO[this.valor()] ?? ESTADO['revisar']);
}

/** Cuatro casillas con el icono de cada documento: llenas si llegó, punteadas si falta. */
@Component({
  selector: 'app-glifo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="glifo" role="img" [attr.aria-label]="etiqueta()">
      @for (c of casillas(); track c.tipo) {
        <span [class.si]="c.si" [title]="c.tipo + (c.si ? '' : ' (falta)')"><span class="ms" aria-hidden="true">{{ c.icono }}</span></span>
      }
    </span>
  `,
  styles: `
    .glifo { display: inline-flex; gap: 4px; vertical-align: middle; }
    .glifo > span { width: 1.9rem; height: 1.9rem; border-radius: 8px; display: grid; place-items: center; font-size: 1.05rem;
      border: 1.5px dashed #B8C0C0; color: #8A9696; }
    .glifo > span.si { background: var(--verde); border: 1.5px solid var(--verde); color: var(--texto); }
  `,
})
export class Glifo {
  readonly tipos = input.required<Set<TipoDocumento>>();
  protected readonly casillas = computed(() =>
    TIPOS_DOCUMENTO.map((tipo) => ({ tipo, icono: DOC[tipo].icono, si: this.tipos().has(tipo) })));
  protected readonly etiqueta = computed(() => {
    const faltan = this.casillas().filter((c) => !c.si).map((c) => DOC[c.tipo].corto.toLowerCase());
    return `${4 - faltan.length} de 4 documentos` + (faltan.length ? `. Falta: ${faltan.join(', ')}` : '');
  });
}

/** Fragmento literal citado como evidencia, con su origen. */
@Component({
  selector: 'app-fragmento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <blockquote class="fragmento" [class.dudoso]="dudoso()">
      <span class="origen">{{ origen() }}, página {{ ev().pagina }}, línea {{ ev().linea }}@if (dudoso()) {, lectura dudosa ({{ pct(ev().confianza) }})}</span>
      «{{ ev().texto }}»
    </blockquote>
  `,
  styles: `blockquote { margin: 0; }`,
})
export class Fragmento {
  readonly ev = input.required<Evidencia>();
  readonly origen = input.required<string>();
  protected readonly dudoso = computed(() => this.ev().confianza < UMBRAL_LECTURA);
  protected pct = pct;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)} %`;
}

export function fecha(iso: string, conHora = true): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    (conHora ? ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
}

export function tamano(bytes: number): string {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(Math.round(kb), 1)} KB`;
}

export interface FilaDocumento { tipo: TipoDocumento; detalle: string; estado: 'si' | 'no' | 'vencido' }

/** Lista de los cuatro documentos con su estado (cargado, falta o vencido). */
@Component({
  selector: 'app-lista-docs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="lista">
      @for (f of filas(); track f.tipo) {
        <li [class]="f.estado">
          <span class="icono"><span class="ms" aria-hidden="true">{{ DOC[f.tipo].icono }}</span></span>
          <span class="nombre"><b>{{ f.tipo }}</b><small>{{ f.detalle }}</small></span>
          @switch (f.estado) {
            @case ('si') { <span class="badge cumple"><span class="ms" aria-hidden="true">check</span>Cargado</span> }
            @case ('vencido') { <span class="badge revisar"><span class="ms" aria-hidden="true">schedule</span>Vencido</span> }
            @default { <span class="badge neutra"><span class="ms" aria-hidden="true">remove</span>Falta</span> }
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .lista { list-style: none; margin: 0; padding: 0; }
    li { display: flex; gap: .8rem; align-items: center; padding: .7rem 0; border-bottom: 1px solid var(--borde); }
    li:last-child { border-bottom: 0; }
    .icono { width: 2.4rem; height: 2.4rem; border-radius: 10px; display: grid; place-items: center; background: var(--gris);
      font-size: 1.2rem; flex: none; }
    li.si .icono { background: var(--verde); }
    li.vencido .icono { background: var(--ambar-suave); color: var(--ambar-texto); }
    .nombre { flex: 1; min-width: 0; }
    b { display: block; font-weight: 600; }
    small { color: var(--texto-suave); font-size: .84rem; overflow-wrap: anywhere; }
  `,
})
export class ListaDocs {
  readonly filas = input.required<FilaDocumento[]>();
  protected readonly DOC = DOC;
}
