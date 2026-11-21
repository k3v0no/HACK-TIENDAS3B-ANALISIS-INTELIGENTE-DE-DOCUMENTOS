// Vista de Jurídico: el comparador con evidencia. Matriz campos × documentos, evidencia lado a
// lado, regla aplicada, corrección de lecturas y validación de hallazgos. Una corrección humana
// nunca se presenta como lectura del sistema: se conservan ambas y se marca quién la hizo.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Celda, FilaMatriz, dato, docDeTipo, estadoValidacion, matriz } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { Area, DOC, Evidencia, Hallazgo } from '../../core/modelos';
import { causaDe, regla } from '../../core/reglas-catalogo';
import { Visibilidad } from '../../core/visibilidad';
import { CabeceraExpediente, RevisarDocumentos, Citas } from '../../ui/expediente-ui';
import { fecha, pct } from '../../ui/ui';
import { Visor } from '../../ui/visor';

const ESTADO_FILA = {
  coincide: { texto: 'Coincide', clase: 'cumple', icono: 'check' },
  difiere: { texto: 'Difiere', clase: 'no_cumple', icono: 'close' },
  uno: { texto: 'Un solo documento', clase: 'neutra', icono: 'looks_one' },
  ausente: { texto: 'Ausente', clase: 'revisar', icono: 'remove' },
} as const;

@Component({
  selector: 'app-expediente-juridico',
  imports: [RouterLink, CabeceraExpediente, RevisarDocumentos, Citas, Visor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expediente.html',
  styleUrl: './expediente.css',
})
export class ExpedienteJuridico {
  readonly id = input.required<string>();
  private readonly expedientes = inject(ExpedientesService);
  protected readonly flujo = inject(FlujoService);
  protected readonly visible = inject(Visibilidad);
  protected readonly ESTADO_FILA = ESTADO_FILA;
  protected readonly regla = regla;
  protected readonly causaDe = causaDe;
  protected readonly fecha = fecha;
  protected readonly pct = pct;
  protected readonly DOC = DOC;

  protected readonly exp = computed(() => this.expedientes.lista().find((e) => e.id === this.id()));
  protected readonly d = computed(() => this.exp()?.dictamen);
  protected readonly correcciones = computed(() => this.flujo.correcciones().filter((c) => c.exp === this.id()));
  protected readonly validaciones = computed(() => this.flujo.validaciones().filter((v) => v.exp === this.id()));
  protected readonly tolerancia = computed(() => this.flujo.reglasVigentes().parametros.toleranciaSuperficiePct);
  protected readonly filas = computed<FilaMatriz[]>(() => (this.d() ? matriz(this.d()!, this.correcciones(), this.tolerancia()) : []));
  protected readonly estadoVal = computed(() => (this.exp() ? estadoValidacion(this.exp()!, this.flujo.validaciones()) : null));
  protected readonly urlPagina = (b: string, doc: string, p: number) => this.expedientes.imagenPagina(b, doc, p);

  /** Detalle de la regla de uso de suelo: actividad, giro, compatibilidad, condicionantes. */
  protected readonly usoSuelo = computed(() => {
    const d = this.d();
    const doc = d ? docDeTipo(d, 'Uso de Suelo') : undefined;
    if (!d || !doc) return [];
    return ['uso_autorizado', 'giro_autorizado', 'compatibilidad_comercial', 'razon_compatibilidad', 'condicionantes',
      'superficie_aplicable_m2', 'zona'].map((n) => dato(d, doc.id, n)).filter((x) => x);
  });

  // ---------------------------------------------------------------- evidencia lado a lado
  protected readonly filaActiva = signal<FilaMatriz | null>(null);
  protected readonly ladoALado = computed<{ celda: Celda; ev: Evidencia }[]>(() => {
    const f = this.filaActiva();
    if (!f) return [];
    return f.celdas.filter((c) => c.evidencia.length).slice(0, 2).map((c) => ({ celda: c, ev: c.evidencia[0] }));
  });

  // ---------------------------------------------------------------- corrección
  protected readonly corrigiendo = signal<{ fila: FilaMatriz; celda: Celda } | null>(null);
  protected valorCorregido = '';
  protected motivo = '';
  protected readonly errorCorreccion = signal('');

  // ---------------------------------------------------------------- validación
  protected readonly validando = signal<{ h: Hallazgo; estado: 'confirmado' | 'descartado' } | null>(null);
  protected observacion = '';
  protected derivar: Area | '' = '';
  protected readonly citas = signal<Evidencia[]>([]);
  protected readonly aviso = signal('');

  constructor() {
    this.expedientes.refrescar();
    queueMicrotask(() => this.expedientes.sincronizar(this.id()));
    const reloj = setInterval(() => { if (this.exp() && ExpedientesService.enProceso(this.exp()!)) this.expedientes.sincronizar(this.id()); }, 3000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected iconoDoc(tipo: string): string {
    return (DOC as Record<string, { icono: string }>)[tipo]?.icono ?? 'description';
  }

  protected nombreDoc(id: string): string {
    return this.d()?.documentos.find((x) => x.id === id)?.tipo ?? id;
  }

  protected doc(id: string) {
    return this.d()?.documentos.find((x) => x.id === id);
  }

  protected seleccionar(f: FilaMatriz): void {
    this.filaActiva.set(this.filaActiva()?.clave === f.clave ? null : f);
    if (this.filaActiva()) setTimeout(() => document.getElementById('lado-a-lado')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  protected abrirCorreccion(fila: FilaMatriz, celda: Celda, ev: Event): void {
    ev.stopPropagation();
    this.corrigiendo.set({ fila, celda });
    this.valorCorregido = celda.valor ?? '';
    this.motivo = '';
    this.errorCorreccion.set('');
  }

  protected guardarCorreccion(): void {
    const c = this.corrigiendo();
    if (!c) return;
    if (!this.valorCorregido.trim() || !this.motivo.trim()) { this.errorCorreccion.set('Escribe el valor correcto y el motivo.'); return; }
    const d = this.d()!;
    const nombre = c.fila.nombres.find((n) => dato(d, c.celda.documento, n)) ?? c.fila.nombres[0];
    this.flujo.corregir({
      exp: this.id(), documento: c.celda.documento, nombre, campo: `${c.fila.etiqueta} (${this.nombreDoc(c.celda.documento)})`,
      valorAuto: c.celda.auto, valorCorregido: this.valorCorregido.trim(), motivo: this.motivo.trim(),
      corrida: this.exp()!.corridas.length,
    });
    this.corrigiendo.set(null);
    this.aviso.set('Corrección registrada. La comparación de esta vista ya la usa; la lectura automática se conserva.');
  }

  protected quitarCorreccion(celda: Celda, ev: Event): void {
    ev.stopPropagation();
    if (celda.correccion) this.flujo.quitarCorreccion(this.id(), celda.documento, celda.correccion.nombre);
  }

  protected validacionDe(h: Hallazgo) {
    return this.validaciones().find((v) => v.hallazgo === h.id);
  }

  protected abrirValidacion(h: Hallazgo, estado: 'confirmado' | 'descartado'): void {
    this.validando.set({ h, estado });
    this.observacion = '';
    this.derivar = '';
  }

  protected guardarValidacion(): void {
    const v = this.validando();
    if (!v) return;
    this.flujo.validar({ exp: this.id(), hallazgo: v.h.id, titulo: v.h.titulo, estado: v.estado, observacion: this.observacion.trim(),
      derivadoA: this.derivar || undefined, corrida: this.exp()!.corridas.length });
    if (this.derivar) {
      this.flujo.crearTarea({ exp: this.id(), tipo: 'derivacion', area: this.derivar, titulo: v.h.titulo, causa: causaDe(v.h.reglaId),
        hallazgo: { id: v.h.id, titulo: v.h.titulo, reglaId: v.h.reglaId }, nota: this.observacion.trim() || undefined });
    }
    // Lo turnado a Jurídico sobre este hallazgo queda resuelto con la validación.
    for (const t of this.flujo.abiertas(this.id()).filter((t) => t.area === 'Jurídico' && (!t.hallazgo || t.hallazgo.id === v.h.id))) {
      this.flujo.actualizarTarea(t.id, { estado: 'resuelto' }, `Resuelto con la validación jurídica (${v.estado}).`);
    }
    this.validando.set(null);
    this.aviso.set(`Hallazgo ${v.estado}.` + (this.derivar ? ` Se derivó a ${this.derivar}.` : ''));
  }

  protected abrirAclaracion(h: Hallazgo): void {
    this.flujo.crearTarea({ exp: this.id(), tipo: 'aclaracion', area: 'Trámites', titulo: `Aclaración documental: ${h.titulo}`,
      causa: 'Documento de otra unidad o inconsistencia del expediente', hallazgo: { id: h.id, titulo: h.titulo, reglaId: h.reglaId },
      nota: 'El documento sí dice lo que el sistema leyó: es una inconsistencia del expediente, no un error de lectura.' });
    this.aviso.set('Aclaración documental abierta para Trámites.');
  }

  protected documentosUsados(h: Hallazgo): string {
    const ids = [...new Set(h.evidencia.map((e) => e.documento))];
    return ids.length ? ids.map((i) => this.nombreDoc(i)).join(', ') : 'Sin cita directa';
  }

  protected incertidumbre(h: Hallazgo): string {
    const d = this.d()!;
    const docs = [...new Set(h.evidencia.map((e) => e.documento))].map((i) => this.doc(i)).filter((x) => x);
    const partes: string[] = [];
    if (docs.some((x) => x && !x.legible)) partes.push('hay un documento con lectura insuficiente');
    const dudosas = h.evidencia.filter((e) => e.confianza < 0.7).length;
    if (dudosas) partes.push(`${dudosas} cita(s) con lectura dudosa`);
    const sinSustento = docs.flatMap((x) => d.datos[x!.id] ?? []).filter((x) => !x.sustentado).length;
    if (sinSustento) partes.push(`${sinSustento} dato(s) que el verificador no encontró en el texto`);
    if (h.reglaId === 'X') partes.push('la comparación no se pudo hacer por falta de datos');
    return partes.length ? partes.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.' : `Confianza general ${d.nivelConfianza}; sin señales de lectura dudosa en las citas.`;
  }
}
