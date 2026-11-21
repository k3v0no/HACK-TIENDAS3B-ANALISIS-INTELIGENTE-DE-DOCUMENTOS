// Vista del auditor: línea de tiempo, corridas, comparación entre análisis, cadena de evidencia e
// intervenciones. Prueba de aceptación: tras sustituir una constancia, debe poder explicar por qué
// el sistema había indicado «Requiere revisión» con la versión anterior.
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { Corrida, Dato, Evento, Evidencia, Hallazgo } from '../../core/modelos';
import { regla } from '../../core/reglas-catalogo';
import { CabeceraExpediente, RevisarDocumentos, CajonEvidencia } from '../../ui/expediente-ui';
import { fecha } from '../../ui/ui';

const ICONO_EVENTO: Record<Evento['tipo'], string> = {
  carga: 'upload_file', version: 'difference', analisis: 'play_circle', resultado: 'smart_toy', turnado: 'assignment_ind',
  solicitud: 'outgoing_mail', tarea: 'assignment', correccion: 'edit_note', validacion: 'gavel', decision: 'how_to_vote',
  reglas: 'tune', exportacion: 'download', validez: 'fact_check',
};

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

@Component({
  selector: 'app-expediente-auditor',
  imports: [RouterLink, CabeceraExpediente, RevisarDocumentos, CajonEvidencia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expediente.html',
  styleUrl: './expediente.css',
})
export class ExpedienteAuditor {
  readonly id = input.required<string>();
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly ICONO = ICONO_EVENTO;
  protected readonly fecha = fecha;
  protected readonly regla = regla;

  protected readonly exp = computed(() => this.expedientes.lista().find((e) => e.id === this.id()));
  protected readonly terminadas = computed(() => (this.exp()?.corridas ?? []).filter((c) => c.dictamen));

  // ---------------------------------------------------------------- línea de tiempo y periodo
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly soloPersonas = signal(false);
  protected readonly eventos = computed(() => {
    const todos = this.flujo.eventos().filter((x) => x.exp === this.id() || x.exp === null).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return todos.filter((x) => (!this.desde() || x.fecha.slice(0, 10) >= this.desde()) && (!this.hasta() || x.fecha.slice(0, 10) <= this.hasta())
      && (!this.soloPersonas() || x.actor !== 'Sistema'));
  });

  // ---------------------------------------------------------------- reconstruir una corrida
  protected readonly nCorrida = signal<number | null>(null);
  protected readonly corrida = computed<Corrida | undefined>(() => {
    const ts = this.terminadas();
    return ts.find((c) => c.n === this.nCorrida()) ?? ts.at(-1);
  });

  // ---------------------------------------------------------------- comparar dos análisis
  protected readonly nA = signal<number | null>(null);
  protected readonly nB = signal<number | null>(null);
  protected readonly comparacion = computed(() => {
    const ts = this.terminadas();
    if (ts.length < 2) return null;
    const a = ts.find((c) => c.n === this.nA()) ?? ts.at(-2)!;
    const b = ts.find((c) => c.n === this.nB()) ?? ts.at(-1)!;
    const ha = a.dictamen!.hallazgos, hb = b.dictamen!.hallazgos;
    const idsA = new Set(ha.map((h) => h.id)), idsB = new Set(hb.map((h) => h.id));
    const docsCambiados = b.archivos.filter((x) => !a.archivos.some((y) => y.tipo === x.tipo && y.version === x.version))
      .map((x) => `${x.tipo} (versión ${x.version})`);
    const correccionesEntre = this.flujo.correcciones().filter((c) => c.exp === this.id() && c.fecha > a.fecha && c.fecha <= b.fecha);
    const causas: string[] = [];
    if (docsCambiados.length) causas.push(`documento nuevo: ${docsCambiados.join(', ')}`);
    if (correccionesEntre.length) causas.push(`${correccionesEntre.length} corrección(es) humana(s) registrada(s) entre ambos análisis`);
    if (a.reglasVersion !== b.reglasVersion) causas.push(`reglas distintas: versión ${a.reglasVersion} contra ${b.reglasVersion}`);
    return {
      a, b,
      aparecieron: hb.filter((h) => !idsA.has(h.id)),
      persistieron: hb.filter((h) => idsA.has(h.id)),
      resueltos: ha.filter((h) => !idsB.has(h.id)),
      causas: causas.length ? causas : ['mismos documentos y reglas: la diferencia viene del propio análisis'],
    };
  });

  // ---------------------------------------------------------------- cadena de evidencia
  protected readonly hallazgoCadena = signal<string | null>(null);
  protected readonly cadena = computed(() => {
    const c = this.corrida();
    const d = c?.dictamen;
    if (!d) return null;
    const h = d.hallazgos.find((x) => x.id === this.hallazgoCadena()) ?? d.hallazgos[0];
    if (!h) return null;
    const lineas = new Set(h.evidencia.map((e) => `${e.documento}#${e.linea}`));
    const campos: { doc: string; dato: Dato }[] = [];
    for (const doc of d.documentos) for (const x of d.datos[doc.id] ?? []) {
      if (x.evidencia.some((e) => lineas.has(`${doc.id}#${e.linea}`))) campos.push({ doc: doc.tipo, dato: x });
    }
    return { d, h, campos, nombreDoc: (id: string) => d.documentos.find((x) => x.id === id)?.tipo ?? id };
  });

  // ---------------------------------------------------------------- intervenciones
  protected readonly intervenciones = computed(() => this.flujo.eventos()
    .filter((x) => x.exp === this.id()).sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((x) => ({ ...x, humana: x.actor !== 'Sistema' })));

  protected readonly citas = signal<Evidencia[]>([]);
  protected readonly dictamenCitas = computed(() => this.corrida()?.dictamen);

  constructor() {
    this.expedientes.refrescar();
  }

  protected numero(v: string): number | null {
    return v ? +v : null;
  }

  protected tituloHallazgo(h: Hallazgo): string {
    return `${h.reglaId}: ${h.titulo}`;
  }

  /** Reporte local del historial del caso, limitado al expediente y al periodo elegido. */
  protected exportar(): void {
    const e = this.exp()!;
    const filas = this.eventos().map((x) => `<tr><td>${esc(fecha(x.fecha))}</td><td>${esc(x.actor)}${x.actor === 'Sistema' ? '' : ` (${esc(x.perfil)})`}</td><td>${esc(x.tipo)}</td><td>${esc(x.detalle)}</td></tr>`).join('');
    const corridas = this.terminadas().map((c) => `<li>Análisis ${c.n} (${esc(fecha(c.fecha))}, reglas v${c.reglasVersion}): ${esc(c.dictamen!.recomendacion)}. ` +
      `Archivos: ${esc(c.archivos.map((a) => `${a.tipo} v${a.version}`).join(', '))}. Hallazgos: ${esc(c.dictamen!.hallazgos.map((h) => h.reglaId).join(', ') || 'ninguno')}.</li>`).join('');
    const periodo = this.desde() || this.hasta() ? `del ${this.desde() || 'inicio'} al ${this.hasta() || 'hoy'}` : 'completo';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Historial ${esc(e.id)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;color:#04211F}table{border-collapse:collapse;width:100%;font-size:.9rem}
td,th{border:1px solid #E4E7E7;padding:.4rem .6rem;text-align:left;vertical-align:top}.aviso{font-size:.85rem;color:#8A5300}</style></head><body>
<p class="aviso">Uso interno de Tiendas 3B. Reporte generado el ${esc(fecha(new Date().toISOString()))}.</p>
<h1>Historial del expediente ${esc(e.id)}</h1><p>${esc(ExpedientesService.titulo(e))}. Periodo: ${esc(periodo)}.</p>
<h2>Análisis</h2><ul>${corridas || '<li>Sin análisis</li>'}</ul>
<h2>Eventos</h2><table><thead><tr><th>Fecha</th><th>Quién</th><th>Tipo</th><th>Detalle</th></tr></thead><tbody>${filas}</tbody></table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-${e.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    this.flujo.registrar(e.id, 'exportacion', `Exportó el historial del caso (periodo ${periodo})`);
  }
}
