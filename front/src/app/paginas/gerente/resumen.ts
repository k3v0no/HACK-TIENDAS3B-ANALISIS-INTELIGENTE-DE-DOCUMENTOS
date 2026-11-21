// Resumen ejecutivo para el gerente o comité: lectura breve y confiable, con acceso a la
// evidencia cuando la decisión depende de una discrepancia concreta.
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { estadoValidacion, queImpideAvanzar, siguienteAccion } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { DecisionNegocio, Evidencia, USO_PREVISTO } from '../../core/modelos';
import { causaDe } from '../../core/reglas-catalogo';
import { CabeceraExpediente, RevisarDocumentos, CajonEvidencia } from '../../ui/expediente-ui';
import { fecha, pct } from '../../ui/ui';

const DECISION = { avanza: 'Avanza', espera: 'En espera', descartado: 'Descartado' } as const;

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

@Component({
  selector: 'app-resumen',
  imports: [RouterLink, CabeceraExpediente, RevisarDocumentos, CajonEvidencia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resumen.html',
  styleUrl: './resumen.css',
})
export class Resumen {
  readonly id = input.required<string>();
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly DECISION = DECISION;
  protected readonly uso = USO_PREVISTO;
  protected readonly fecha = fecha;
  protected readonly pct = pct;
  protected readonly causaDe = causaDe;

  protected readonly exp = computed(() => this.expedientes.lista().find((e) => e.id === this.id()));
  protected readonly d = computed(() => this.exp()?.dictamen);
  protected readonly val = computed(() => (this.exp() ? estadoValidacion(this.exp()!, this.flujo.validaciones()) : null));
  protected readonly validaciones = computed(() => this.flujo.validaciones().filter((v) => v.exp === this.id()));
  protected readonly decisiones = computed(() => this.flujo.decisiones().filter((x) => x.exp === this.id()).reverse());
  protected readonly bloqueo = computed(() => (this.exp() ? queImpideAvanzar(this.exp()!) : null));
  protected readonly determinantes = computed(() => (this.d()?.hallazgos ?? []).filter((h) => h.severidad === 'alta').concat(
    (this.d()?.hallazgos ?? []).filter((h) => h.severidad !== 'alta')).slice(0, 4));
  protected readonly pasos = computed(() => this.flujo.abiertas(this.id()));
  protected readonly siguiente = computed(() => this.exp()
    ? siguienteAccion(this.exp()!, this.flujo.tareas(), this.flujo.validaciones(), this.flujo.decisionDe(this.id())) : null);
  protected readonly corrida = computed(() => this.exp()?.corridas.filter((c) => c.dictamen).at(-1)?.n ?? 0);

  protected readonly citas = signal<Evidencia[]>([]);
  protected readonly valor = signal<DecisionNegocio['valor'] | ''>('');
  protected readonly motivo = signal('');
  protected readonly error = signal('');
  protected readonly aviso = signal('');

  constructor() {
    this.expedientes.refrescar();
  }

  protected validacionDe(hid: string) {
    return this.validaciones().find((v) => v.hallazgo === hid);
  }

  protected registrar(): void {
    if (!this.valor() || !this.motivo().trim()) { this.error.set('Elige la decisión y escribe el motivo.'); return; }
    this.flujo.decidir({ exp: this.id(), valor: this.valor() as DecisionNegocio['valor'], motivo: this.motivo().trim(),
      recomendacion: this.d()?.recomendacion ?? null, corrida: this.corrida(), validacionJuridica: this.val()?.texto ?? '' });
    this.error.set('');
    this.aviso.set(`Decisión registrada: ${DECISION[this.valor() as DecisionNegocio['valor']]}.`);
    this.valor.set('');
    this.motivo.set('');
  }

  /** Ficha ejecutiva local: refleja el estado del expediente en este momento. Uso interno. */
  protected exportar(): void {
    const e = this.exp()!, d = this.d();
    const ahora = new Date();
    const dec = this.decisiones()[0];
    const refs = (d?.hallazgos ?? []).flatMap((h) => h.evidencia.map((ev) => {
      const doc = d!.documentos.find((x) => x.id === ev.documento);
      return `<li>${esc(h.titulo)}: ${esc(doc?.tipo ?? '')} (${esc(doc?.archivo ?? '')}), página ${ev.pagina}, línea ${esc(ev.linea)}</li>`;
    }));
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ficha ejecutiva ${esc(e.id)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;color:#04211F;line-height:1.5}h1{margin:0}
.meta{color:#5C6B6A}.caja{border:1px solid #E4E7E7;border-radius:10px;padding:1rem;margin:1rem 0}.aviso{font-size:.85rem;color:#8A5300}</style></head><body>
<p class="aviso">Uso interno de Tiendas 3B. No compartir fuera de la empresa.</p>
<h1>${esc(ExpedientesService.titulo(e))}</h1>
<p class="meta">Folio ${esc(e.id)}. Uso previsto: ${esc(USO_PREVISTO)}. Generada el ${esc(fecha(ahora.toISOString()))} con la versión de análisis ${this.corrida()}.</p>
<div class="caja"><b>Recomendación automática:</b> ${esc(d?.recomendacion ?? 'Sin dictamen')}${d ? ` (confianza ${esc(d.nivelConfianza)}, ${pct(d.confianza)})` : ''}<br>
<b>Validación jurídica:</b> ${esc(this.val()?.texto ?? '')}<br>
<b>Decisión de expansión:</b> ${dec ? `${esc(DECISION[dec.valor])}, por ${esc(dec.autor)} el ${esc(fecha(dec.fecha))}. Motivo: ${esc(dec.motivo)}` : 'Sin decisión'}</div>
<h2>Qué impide avanzar</h2><p>${esc(this.bloqueo()?.frase ?? '')} ${esc(this.bloqueo()?.detalle ?? '')}</p>
<h2>Hallazgos determinantes</h2><ul>${this.determinantes().map((h) => `<li><b>${esc(h.titulo)}</b> (${esc(h.reglaId)}): ${esc(h.explicacion)}</li>`).join('') || '<li>Sin hallazgos</li>'}</ul>
<h2>Próximos pasos</h2><ul>${this.pasos().map((t) => `<li>${esc(t.area)}: ${esc(t.titulo)} (${esc(t.estado)})</li>`).join('') || '<li>Sin tareas abiertas</li>'}</ul>
<h2>Referencias</h2><ul>${refs.join('') || '<li>Sin citas</li>'}</ul></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ficha-ejecutiva-${e.id}-v${this.corrida()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    this.flujo.registrar(e.id, 'exportacion', `Exportó la ficha ejecutiva (versión de análisis ${this.corrida()})`);
  }
}
