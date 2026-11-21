// Revisión de un documento: todas sus páginas con las anomalías marcadas encima y, al lado, la
// explicación de cada una. Quien revisa decide si el documento es válido, deja la razón, puede
// corregir una lectura (si su perfil lo permite) o pasar el caso a otra área. El arrendador
// recibe un aviso con el resultado, sin detalles internos.
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { Area, Dato, Evidencia, Hallazgo, TIPOS_DOCUMENTO, TipoDocumento } from '../../core/modelos';
import { RUTA_EXPEDIENTE } from '../../core/navegacion';
import { causaDe, regla } from '../../core/reglas-catalogo';
import { Visibilidad } from '../../core/visibilidad';
import { fecha, pct } from '../../ui/ui';

interface Marca { n: number; caja: [number, number, number, number]; texto: string; visible: boolean }
interface Anomalia {
  n: number;
  h: Hallazgo;
  marcas: Map<number, Marca[]>; // página -> marcas
  paginas: number[];
  otrosDocumentos: string[]; // tipos de otros documentos que también cita
}

const SEVERIDAD = {
  alta: { texto: 'Alta', clase: 'no_cumple' },
  media: { texto: 'Media', clase: 'revisar' },
  baja: { texto: 'Baja', clase: 'neutra' },
} as const;
const AREA_DE_PERFIL: Record<string, Area> = {
  'Analista de expansión': 'Expansión', Jurídico: 'Jurídico', 'Gestor de trámites': 'Trámites', Gerente: 'Gerencia',
};

@Component({
  selector: 'app-revision-documento',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (exp(); as e) {
      @if (doc(); as d) {
        <a class="volver" [routerLink]="[volver(), e.id]"><span class="ms" aria-hidden="true">arrow_back</span>Volver al expediente</a>
        <header class="cabeza">
          <div>
            <p class="vista"><span class="ms" aria-hidden="true">fact_check</span>Revisión de documento</p>
            <h1>{{ d.tipo }}</h1>
            <p class="suave">{{ d.archivo }} · {{ d.paginas }} página{{ d.paginas === 1 ? '' : 's' }} · lectura {{ pct(d.confianzaOcr) }}
              @if (!d.legible) { · <b class="rojo">lectura insuficiente</b> }</p>
          </div>
          <div class="lado">
            @if (validez(); as v) {
              <span class="badge" [class]="'badge ' + (v.estado === 'valido' ? 'cumple' : 'no_cumple')">
                <span class="ms" aria-hidden="true">{{ v.estado === 'valido' ? 'verified' : 'block' }}</span>{{ v.estado === 'valido' ? 'Válido' : 'No válido' }}</span>
              <span class="suave pequeno">{{ v.autor }}, {{ fecha(v.fecha) }}</span>
            } @else {
              <span class="badge neutra"><span class="ms" aria-hidden="true">pending</span>Sin decisión</span>
            }
          </div>
        </header>

        @if (otros().length) {
          <nav class="otros" aria-label="Otros documentos del expediente">
            @for (o of otros(); track o.id) {
              <a class="btn chico" [routerLink]="['/revision', e.id, o.id]"><span class="ms" aria-hidden="true">description</span>{{ o.tipo }}</a>
            }
          </nav>
        }
        @if (aviso()) { <div class="aviso exito" role="status"><span class="ms" aria-hidden="true">check_circle</span>{{ aviso() }}</div> }

        <div class="dos-columnas">
          <!-- Documento con las anomalías marcadas -->
          <section class="paginas" aria-label="Páginas del documento">
            @for (p of paginas(); track p) {
              <figure class="pagina" [id]="'pag-' + p">
                <figcaption>Página {{ p }} de {{ d.paginas }}</figcaption>
                <div class="lienzo">
                  <img [src]="url(e, d.id, p)" [alt]="'Página ' + p + ' de ' + d.archivo" loading="lazy" (error)="sinImagen.set(true)">
                  @for (a of anomalias(); track a.n) {
                    @for (m of a.marcas.get(p) ?? []; track $index) {
                      @if (m.visible) {
                        <button type="button" class="marca" [class]="'marca ' + a.h.severidad" [class.activa]="activa() === a.n"
                                [style.left.%]="m.caja[0] * 100" [style.top.%]="m.caja[1] * 100"
                                [style.width.%]="(m.caja[2] - m.caja[0]) * 100" [style.height.%]="(m.caja[3] - m.caja[1]) * 100"
                                [attr.aria-label]="'Anomalía ' + a.n + ': ' + a.h.titulo" (click)="elegir(a.n, false)">
                          <span class="numero">{{ a.n }}</span>
                        </button>
                      }
                    }
                  }
                </div>
              </figure>
            }
            @if (sinImagen()) {
              <div class="aviso info"><span class="ms" aria-hidden="true">image_not_supported</span>
                No se pudo obtener alguna página del servicio de análisis. Las explicaciones de la derecha siguen disponibles.</div>
            }
          </section>

          <!-- Explicaciones y decisiones -->
          <aside class="panel">
            <section class="tarjeta" aria-labelledby="ano-t">
              <h2 id="ano-t"><span class="ms" aria-hidden="true">report</span>Anomalías en este documento ({{ anomalias().length }})</h2>
              @for (a of anomalias(); track a.n) {
                <article class="anomalia" [id]="'ano-' + a.n" [class]="'anomalia ' + a.h.severidad" [class.activa]="activa() === a.n">
                  <button type="button" class="titulo" (click)="elegir(a.n, true)">
                    <span class="numero">{{ a.n }}</span>
                    <span><b>{{ a.h.titulo }}</b>
                      <small>Regla {{ a.h.reglaId || 's/n' }} · {{ causaDe(a.h.reglaId) }} · severidad {{ SEVERIDAD[a.h.severidad].texto.toLowerCase() }}</small></span>
                  </button>
                  <p>{{ a.h.explicacion }}</p>
                  @if (a.h.accionSugerida) { <p class="accion"><span class="ms" aria-hidden="true">lightbulb</span>{{ a.h.accionSugerida }}</p> }
                  <p class="suave pequeno">
                    @if (a.paginas.length) { Marcada en la página {{ a.paginas.join(', ') }}. }
                    @else { Sin ubicación exacta en este documento: el dato falta o no se pudo leer. }
                    @if (a.otrosDocumentos.length) { También cita: {{ a.otrosDocumentos.join(', ') }}. }
                    Consecuencia: {{ regla(a.h.reglaId)?.efecto ?? 'Requiere revisión' }}.
                  </p>
                </article>
              } @empty {
                <p class="suave">El sistema no encontró anomalías en este documento.</p>
              }
            </section>

            @if (puedeValidar) {
              <section class="tarjeta" aria-labelledby="val-t">
                <h2 id="val-t"><span class="ms" aria-hidden="true">gavel</span>Tu decisión sobre el documento</h2>
                <div class="opciones" role="radiogroup" aria-label="Validez del documento">
                  <label [class.elegida]="estado() === 'valido'"><input type="radio" name="validez" [checked]="estado() === 'valido'" (change)="estado.set('valido')">
                    <span class="ms" aria-hidden="true">verified</span>Válido</label>
                  <label [class.elegida]="estado() === 'no_valido'"><input type="radio" name="validez" [checked]="estado() === 'no_valido'" (change)="estado.set('no_valido')">
                    <span class="ms" aria-hidden="true">block</span>No válido</label>
                </div>
                <div class="campo"><label for="val-nota">Por qué lo decides así</label>
                  <textarea id="val-nota" class="entrada" rows="3" [value]="nota" (input)="nota = $any($event.target).value"
                            placeholder="p. ej. la licencia venció y no ampara el giro comercial"></textarea>
                  <small>Nota interna. Queda en el historial con tu nombre.</small></div>
                <div class="campo"><label for="val-msg">Mensaje para el arrendador (opcional)</label>
                  <textarea id="val-msg" class="entrada" rows="2" [value]="mensaje" (input)="mensaje = $any($event.target).value"
                            placeholder="Lo que debe saber o hacer. No incluyas detalles internos."></textarea></div>
                @if (estado() === 'no_valido' && tipoDoc()) {
                  <label class="casilla"><input type="checkbox" [checked]="pedirNuevo()" (change)="pedirNuevo.set($any($event.target).checked)">
                    Pedirle al arrendador que envíe otro documento de {{ d.tipo.toLowerCase() }}</label>
                }
                @if (errorValidez()) { <div class="aviso error" role="alert"><span class="ms" aria-hidden="true">error</span>{{ errorValidez() }}</div> }
                <button type="button" class="btn primario" (click)="guardarValidez()"><span class="ms" aria-hidden="true">save</span>Registrar decisión</button>
              </section>

              <section class="tarjeta" aria-labelledby="tur-t">
                <h2 id="tur-t"><span class="ms" aria-hidden="true">forward</span>Pasarlo a otra área</h2>
                <p class="suave pequeno">Si el problema no le toca a tu área, envíalo a quien corresponda con una nota.</p>
                <div class="campo"><label for="tur-area">Área</label>
                  <select id="tur-area" class="entrada" [value]="area" (change)="area = $any($event.target).value">
                    <option value="">Elige un área</option>
                    @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
                  </select></div>
                <div class="campo"><label for="tur-nota">Qué debe revisar</label>
                  <textarea id="tur-nota" class="entrada" rows="2" [value]="notaTurno" (input)="notaTurno = $any($event.target).value"></textarea></div>
                @if (errorTurno()) { <div class="aviso error" role="alert"><span class="ms" aria-hidden="true">error</span>{{ errorTurno() }}</div> }
                <button type="button" class="btn" (click)="turnar()"><span class="ms" aria-hidden="true">send</span>Pasar al área</button>
              </section>
            } @else {
              <p class="suave pequeno nota-rol"><span class="ms" aria-hidden="true">visibility</span>Tu perfil consulta el documento en solo lectura.</p>
            }

            @if (puedeCorregir && datos().length) {
              <section class="tarjeta" aria-labelledby="cor-t">
                <h2 id="cor-t"><span class="ms" aria-hidden="true">edit_note</span>Corregir una lectura</h2>
                <p class="suave pequeno">Solo si el sistema leyó mal. Se conservan la lectura automática y tu corrección.</p>
                <div class="campo"><label for="cor-campo">Dato</label>
                  <select id="cor-campo" class="entrada" [value]="campo()" (change)="elegirCampo($any($event.target).value)">
                    <option value="">Elige un dato</option>
                    @for (x of datos(); track x.nombre) { <option [value]="x.nombre">{{ x.campo }}: {{ valorActual(x) ?? 'sin lectura' }}</option> }
                  </select></div>
                @if (campo()) {
                  <div class="campo"><label for="cor-valor">Valor correcto</label>
                    <input id="cor-valor" class="entrada" [value]="valor" (input)="valor = $any($event.target).value"></div>
                  <div class="campo"><label for="cor-motivo">Motivo</label>
                    <input id="cor-motivo" class="entrada" [value]="motivo" (input)="motivo = $any($event.target).value"
                           placeholder="p. ej. el escaneo dice 18-B, no 18-8"></div>
                  @if (errorCorreccion()) { <div class="aviso error" role="alert"><span class="ms" aria-hidden="true">error</span>{{ errorCorreccion() }}</div> }
                  <button type="button" class="btn" (click)="corregir()"><span class="ms" aria-hidden="true">save</span>Registrar corrección</button>
                }
              </section>
            }

            @if (historial().length) {
              <section class="tarjeta" aria-labelledby="his-t">
                <h2 id="his-t"><span class="ms" aria-hidden="true">history</span>Decisiones anteriores</h2>
                <ul class="historial">
                  @for (v of historial(); track v.id) {
                    <li><b>{{ v.estado === 'valido' ? 'Válido' : 'No válido' }}</b> · {{ v.autor }} ({{ v.perfil }}), {{ fecha(v.fecha) }}<br>
                      <span class="suave">{{ v.nota }}</span></li>
                  }
                </ul>
              </section>
            }
          </aside>
        </div>
      } @else {
        <section class="tarjeta"><h1>No encontramos ese documento</h1>
          <p class="suave">Puede que el expediente se haya vuelto a analizar. <a [routerLink]="[volver(), e.id]">Volver al expediente</a>.</p></section>
      }
    } @else {
      <section class="tarjeta"><h1>No encontramos ese expediente</h1></section>
    }
  `,
  styles: `
    :host { display: block; }
    .volver { display: inline-flex; align-items: center; gap: .4rem; color: var(--texto); text-decoration: none; font-weight: 600;
      font-size: .92rem; padding: .35rem .6rem .35rem .2rem; border-radius: 8px; margin-bottom: .8rem; }
    .volver:hover { background: var(--gris); }
    .cabeza { display: flex; gap: 1rem; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; margin-bottom: 1rem; }
    .vista { display: inline-flex; align-items: center; gap: .35rem; font-size: .85rem; font-weight: 600; color: var(--rojo-texto); margin-bottom: .3rem; }
    h1 { font-size: clamp(1.4rem, 3vw, 2rem); }
    h2 { font-size: 1.05rem; display: flex; align-items: center; gap: .4rem; margin-bottom: .7rem; }
    .lado { display: grid; justify-items: end; gap: .3rem; }
    .rojo { color: var(--rojo-texto); }
    .otros { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1rem; }
    .dos-columnas { display: grid; grid-template-columns: minmax(0, 3fr) minmax(19rem, 2fr); gap: 1.2rem; align-items: start; }
    @media (max-width: 980px) { .dos-columnas { grid-template-columns: 1fr; } }
    .paginas { display: grid; gap: 1.2rem; }
    .pagina { margin: 0; }
    figcaption { font-size: .82rem; color: var(--texto-suave); margin-bottom: .3rem; }
    .lienzo { position: relative; border: 1px solid var(--borde); border-radius: var(--radio-s); overflow: hidden; background: #fff; }
    .lienzo img { display: block; width: 100%; height: auto; min-height: 6rem; }
    .marca { position: absolute; padding: 0; border: 2px solid #B26A00; background: rgba(255, 196, 0, .25); border-radius: 3px;
      cursor: pointer; min-width: 10px; min-height: 10px; }
    .marca.alta { border-color: #C62838; background: rgba(226, 35, 54, .2); }
    .marca.baja { border-color: #5B6B6A; background: rgba(120, 140, 138, .2); }
    .marca.activa { outline: 3px solid #1F4E8C; outline-offset: 2px; z-index: 2; }
    .marca .numero { position: absolute; left: -2px; top: -1.35rem; }
    .numero { display: inline-grid; place-items: center; min-width: 1.35rem; height: 1.35rem; padding: 0 .3rem; border-radius: 999px;
      background: #B26A00; color: #fff; font-size: .75rem; font-weight: 700; line-height: 1; }
    .alta .numero { background: #C62838; }
    .baja .numero { background: #5B6B6A; }
    .panel { display: grid; gap: .9rem; position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; padding-right: .2rem; }
    @media (max-width: 980px) { .panel { position: static; max-height: none; } }
    .panel .tarjeta + .tarjeta { margin-top: 0; }
    .anomalia { border-left: 4px solid #B26A00; padding: .5rem 0 .6rem .7rem; margin-bottom: .7rem; border-radius: 2px; }
    .anomalia.alta { border-left-color: #C62838; }
    .anomalia.baja { border-left-color: #5B6B6A; }
    .anomalia.activa { background: #F3F7FC; }
    .anomalia p { margin-top: .35rem; font-size: .92rem; overflow-wrap: anywhere; }
    .anomalia .titulo { display: flex; gap: .5rem; align-items: flex-start; text-align: left; background: none; border: 0; padding: 0;
      font: inherit; color: inherit; cursor: pointer; width: 100%; }
    .anomalia .titulo small { display: block; color: var(--texto-suave); font-size: .8rem; font-weight: 400; }
    .accion { display: flex; gap: .35rem; align-items: flex-start; }
    .accion .ms { font-size: 1.1rem; color: var(--ambar-texto); }
    .opciones { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: .9rem; }
    .opciones label { display: flex; align-items: center; gap: .4rem; border: 1px solid var(--borde); border-radius: var(--radio-s);
      padding: .55rem .7rem; cursor: pointer; font-weight: 600; }
    .opciones label.elegida { border-color: var(--texto); background: var(--gris); }
    .opciones input { accent-color: var(--rojo-accion); }
    .casilla { display: flex; gap: .5rem; align-items: flex-start; margin-bottom: .9rem; font-size: .92rem; }
    .historial { margin: 0; padding-left: 1.1rem; display: grid; gap: .5rem; font-size: .9rem; }
    .nota-rol { display: flex; gap: .35rem; align-items: center; }
  `,
})
export class RevisionDocumento {
  readonly id = input.required<string>();
  readonly docId = input.required<string>({ alias: 'doc' });
  private readonly expedientes = inject(ExpedientesService);
  private readonly cuentas = inject(CuentasService);
  private readonly flujo = inject(FlujoService);
  private readonly visible = inject(Visibilidad);
  protected readonly SEVERIDAD = SEVERIDAD;
  protected readonly causaDe = causaDe;
  protected readonly regla = regla;
  protected readonly fecha = fecha;
  protected readonly pct = pct;

  protected readonly puedeValidar = this.cuentas.puede('documentos.validar');
  protected readonly puedeCorregir = this.cuentas.puede('extraccion.corregir');
  private readonly miArea = AREA_DE_PERFIL[this.cuentas.cuenta()?.perfil ?? ''];
  protected readonly areas: Area[] = (['Expansión', 'Jurídico', 'Trámites'] as Area[]).filter((a) => a !== this.miArea);

  protected readonly exp = computed(() => this.expedientes.lista().find((e) => e.id === this.id()));
  protected readonly dic = computed(() => this.exp()?.dictamen);
  protected readonly doc = computed(() => this.dic()?.documentos.find((d) => d.id === this.docId()));
  protected readonly otros = computed(() => (this.dic()?.documentos ?? []).filter((d) => d.id !== this.docId()));
  protected readonly paginas = computed(() => Array.from({ length: this.doc()?.paginas ?? 0 }, (_, i) => i + 1));
  protected readonly tipoDoc = computed<TipoDocumento | undefined>(() =>
    TIPOS_DOCUMENTO.find((t) => t === this.doc()?.tipo));
  protected readonly volver = computed(() => RUTA_EXPEDIENTE[this.cuentas.cuenta()?.perfil ?? ''] ?? '/expediente');
  protected readonly validez = computed(() => this.flujo.validez().filter((v) => v.exp === this.id() && v.documento === this.docId()).at(-1));
  protected readonly historial = computed(() => this.flujo.validez().filter((v) => v.exp === this.id() && v.documento === this.docId()).reverse());
  private readonly correcciones = computed(() => this.flujo.correcciones().filter((c) => c.exp === this.id() && c.documento === this.docId()));
  protected readonly datos = computed<Dato[]>(() => (this.dic()?.datos[this.docId()] ?? []).filter((x) => this.visible.campo(x.campo)));

  /** Hallazgos que tocan este documento: los que lo citan y los que nacen de una regla suya. */
  protected readonly anomalias = computed<Anomalia[]>(() => {
    const d = this.dic(), doc = this.doc();
    if (!d || !doc) return [];
    const reglasDelDoc = new Set(d.validaciones.filter((v) => v.documento === doc.id && v.resultado !== 'cumple').map((v) => v.reglaId));
    const nombre = (id: string) => d.documentos.find((x) => x.id === id)?.tipo ?? 'otro documento';
    const salida: Anomalia[] = [];
    for (const h of d.hallazgos) {
      const propias = h.evidencia.filter((e) => e.documento === doc.id);
      if (!propias.length && !(h.reglaId && reglasDelDoc.has(h.reglaId) && !h.evidencia.length)) continue;
      const n = salida.length + 1;
      const marcas = new Map<number, Marca[]>();
      for (const e of propias) {
        if (!e.caja) continue;
        const lista = marcas.get(e.pagina) ?? [];
        lista.push({ n, caja: e.caja, texto: e.texto, visible: this.visible.evidencia(d, e as Evidencia) });
        marcas.set(e.pagina, lista);
      }
      salida.push({
        n, h, marcas, paginas: [...marcas.keys()].sort((a, b) => a - b),
        otrosDocumentos: [...new Set(h.evidencia.filter((e) => e.documento !== doc.id).map((e) => nombre(e.documento)))],
      });
    }
    return salida;
  });

  protected readonly activa = signal<number | null>(null);
  protected readonly sinImagen = signal(false);
  protected readonly aviso = signal('');

  // decisión de validez
  protected readonly estado = signal<'valido' | 'no_valido' | null>(null);
  protected readonly pedirNuevo = signal(true);
  protected nota = '';
  protected mensaje = '';
  protected readonly errorValidez = signal('');

  // pasar a otra área
  protected area: Area | '' = '';
  protected notaTurno = '';
  protected readonly errorTurno = signal('');

  // corrección
  protected readonly campo = signal('');
  protected valor = '';
  protected motivo = '';
  protected readonly errorCorreccion = signal('');

  constructor() {
    this.expedientes.refrescar();
  }

  protected url(e: { back?: { id: string } }, docId: string, pagina: number): string {
    return this.expedientes.imagenPagina(this.doc()?.backId ?? e.back?.id ?? '', docId, pagina);
  }

  /** Resalta una anomalía. Desde la lista lleva a su marca; desde la marca, a su explicación. */
  protected elegir(n: number, irAlDocumento: boolean): void {
    this.activa.set(n);
    const a = this.anomalias().find((x) => x.n === n);
    const destino = irAlDocumento ? (a?.paginas.length ? `pag-${a.paginas[0]}` : null) : `ano-${n}`;
    if (destino) setTimeout(() => document.getElementById(destino)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  protected guardarValidez(): void {
    const e = this.exp(), d = this.doc(), estado = this.estado();
    if (!e || !d) return;
    if (!estado) { this.errorValidez.set('Elige si el documento es válido o no.'); return; }
    if (!this.nota.trim()) { this.errorValidez.set('Escribe por qué lo decides así.'); return; }
    this.flujo.marcarValidez({
      exp: e.id, documento: d.id, tipo: d.tipo, archivo: d.archivo, estado, nota: this.nota.trim(),
      mensajeArrendador: this.mensaje.trim(), corrida: e.corridas.length,
    });
    const tipo = this.tipoDoc();
    let extra = '';
    if (estado === 'no_valido' && this.pedirNuevo() && tipo) {
      this.flujo.crearTarea({
        exp: e.id, tipo: 'solicitud_documento', area: 'Arrendador', estado: 'solicitado', documento: tipo,
        titulo: `Enviar un nuevo documento de ${tipo.toLowerCase()}`, causa: 'Documento no válido',
        solicitud: this.mensaje.trim() || `El documento de ${tipo.toLowerCase()} que enviaste no se pudo aceptar. Por favor envía uno nuevo.`,
        nota: this.nota.trim(),
      });
      extra = ' Se le pidió al arrendador un documento nuevo.';
    }
    this.aviso.set(`Documento marcado como ${estado === 'valido' ? 'válido' : 'no válido'}. El arrendador recibió un aviso.${extra}`);
    this.estado.set(null);
    this.nota = '';
    this.mensaje = '';
    this.errorValidez.set('');
  }

  protected turnar(): void {
    const e = this.exp(), d = this.doc();
    if (!e || !d) return;
    if (!this.area) { this.errorTurno.set('Elige a qué área lo pasas.'); return; }
    if (!this.notaTurno.trim()) { this.errorTurno.set('Escribe qué debe revisar esa área.'); return; }
    const activa = this.anomalias().find((a) => a.n === this.activa());
    this.flujo.crearTarea({
      exp: e.id, tipo: 'derivacion', area: this.area, titulo: `Revisar ${d.tipo.toLowerCase()}` + (activa ? `: ${activa.h.titulo}` : ''),
      causa: activa ? causaDe(activa.h.reglaId) : 'Documentación', documento: this.tipoDoc(),
      hallazgo: activa ? { id: activa.h.id, titulo: activa.h.titulo, reglaId: activa.h.reglaId } : undefined,
      nota: this.notaTurno.trim(),
    });
    this.aviso.set(`Se pasó a ${this.area}. Lo verá en sus pendientes.`);
    this.area = '';
    this.notaTurno = '';
    this.errorTurno.set('');
  }

  protected valorActual(x: Dato): string | null {
    return this.correcciones().find((c) => c.nombre === x.nombre)?.valorCorregido ?? x.valor;
  }

  protected elegirCampo(nombre: string): void {
    this.campo.set(nombre);
    const x = this.datos().find((y) => y.nombre === nombre);
    this.valor = x ? this.valorActual(x) ?? '' : '';
    this.motivo = '';
    this.errorCorreccion.set('');
  }

  protected corregir(): void {
    const e = this.exp(), d = this.doc();
    const x = this.datos().find((y) => y.nombre === this.campo());
    if (!e || !d || !x) return;
    if (!this.valor.trim() || !this.motivo.trim()) { this.errorCorreccion.set('Escribe el valor correcto y el motivo.'); return; }
    this.flujo.corregir({
      exp: e.id, documento: d.id, nombre: x.nombre, campo: `${x.campo} (${d.tipo})`, valorAuto: x.valor,
      valorCorregido: this.valor.trim(), motivo: this.motivo.trim(), corrida: e.corridas.length,
    });
    this.aviso.set(`Corrección de «${x.campo}» registrada. La lectura automática se conserva.`);
    this.campo.set('');
  }
}
