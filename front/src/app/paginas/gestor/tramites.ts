// Tablero del gestor de trámites: tareas por estado operativo. Cada tarea viene de un hallazgo,
// un permiso o un requisito del expediente, y termina al incorporar y verificar la evidencia.
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpedientesService } from '../../core/expedientes.service';
import { ETIQUETA_ESTADO, FlujoService } from '../../core/flujo.service';
import { DOC, EstadoTarea, Tarea, TipoDocumento } from '../../core/modelos';
import { Encabezado, fecha } from '../../ui/ui';

const COLUMNAS: { estado: EstadoTarea; icono: string; ayuda: string }[] = [
  { estado: 'pendiente', icono: 'inbox', ayuda: 'Por atender' },
  { estado: 'solicitado', icono: 'outgoing_mail', ayuda: 'Esperando al arrendador o a la autoridad' },
  { estado: 'recibido', icono: 'move_to_inbox', ayuda: 'Llegó un archivo; falta analizarlo' },
  { estado: 'en_verificacion', icono: 'fact_check', ayuda: 'Analizado: confirma si resuelve el requisito' },
  { estado: 'resuelto', icono: 'task_alt', ayuda: 'Cerrado' },
];

@Component({
  selector: 'app-tramites-gestor',
  imports: [Encabezado, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tramites.html',
  styleUrl: './tramites.css',
})
export class TramitesGestor {
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly columnas = COLUMNAS;
  protected readonly ETIQUETA_ESTADO = ETIQUETA_ESTADO;
  protected readonly DOC = DOC;
  protected readonly fecha = fecha;
  protected readonly tiposDoc = Object.keys(DOC) as TipoDocumento[];

  /** Las tareas del gestor: lo turnado a Trámites y las solicitudes de documentos al arrendador. */
  protected readonly tareas = computed(() => this.flujo.tareas().filter((t) => t.area === 'Trámites' || t.tipo === 'solicitud_documento'));
  protected readonly porEstado = computed(() => {
    const m = Object.fromEntries(COLUMNAS.map((c) => [c.estado, [] as Tarea[]])) as Record<EstadoTarea, Tarea[]>;
    for (const t of this.tareas()) m[t.estado].push(t);
    for (const k of Object.keys(m) as EstadoTarea[]) m[k].sort((a, b) => (a.seguimiento ?? a.fecha).localeCompare(b.seguimiento ?? b.fecha));
    return m;
  });

  // ---------------------------------------------------------------- detalle de la tarea
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly activaId = signal<string | null>(null);
  protected readonly activa = computed(() => this.tareas().find((t) => t.id === this.activaId()));
  protected readonly texto = signal('');
  protected readonly nota = signal('');
  protected readonly seguimiento = signal('');
  protected readonly documento = signal<TipoDocumento | ''>('');
  protected readonly copiado = signal(false);

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.sincronizarEnProceso();
    const reloj = setInterval(() => this.expedientes.sincronizarEnProceso(), 6000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected titulo(exp: string): string {
    const e = this.expedientes.obtener(exp);
    return e ? ExpedientesService.titulo(e) : exp;
  }

  /** Tras el análisis de lo recibido: ¿el hallazgo que originó la tarea sigue apareciendo? */
  protected resultado(t: Tarea): 'resuelto' | 'persiste' | 'sin_dato' {
    const e = this.expedientes.obtener(t.exp);
    if (!t.hallazgo || !e?.dictamen) return 'sin_dato';
    return e.dictamen.hallazgos.some((h) => h.id === t.hallazgo!.id) ? 'persiste' : 'resuelto';
  }

  protected abrir(t: Tarea): void {
    this.activaId.set(t.id);
    this.documento.set(t.documento ?? '');
    this.texto.set(t.solicitud || this.borrador(t, t.documento));
    this.nota.set('');
    this.seguimiento.set(t.seguimiento ?? '');
    this.copiado.set(false);
    this.dialogo().nativeElement.showModal();
  }

  protected borrador(t: Tarea, doc?: TipoDocumento | ''): string {
    const inmueble = this.titulo(t.exp);
    const que = doc ? DOC[doc].que.toLowerCase() : 'el documento que corresponda';
    return `Solicitar ${que} de ${inmueble} (folio ${t.exp}) que acredite lo siguiente: ${t.hallazgo?.titulo ?? t.titulo}. ` +
      'Debe identificar expresamente el inmueble y, en su caso, el local o unidad.';
  }

  protected cambiarDocumento(doc: TipoDocumento | ''): void {
    this.documento.set(doc);
    const t = this.activa();
    if (t && !t.solicitud) this.texto.set(this.borrador(t, doc));
  }

  protected async copiar(): Promise<void> {
    try { await navigator.clipboard.writeText(this.texto()); this.copiado.set(true); } catch { this.copiado.set(false); }
  }

  /** Registra que se hizo la gestión: el texto queda como solicitud y el arrendador la ve en «Mis trámites». */
  protected registrarGestion(): void {
    const t = this.activa();
    if (!t) return;
    // El documento requerido queda en la tarea para que, al llegar, pase sola a «recibido».
    this.flujo.actualizarTarea(t.id, { estado: 'solicitado', solicitud: this.texto(), seguimiento: this.seguimiento() || undefined,
      ...(this.documento() ? { documento: this.documento() as TipoDocumento } : {}) }, this.nota() || 'Se envió la solicitud.');
    this.cerrar();
  }

  protected guardar(estado?: EstadoTarea): void {
    const t = this.activa();
    if (!t) return;
    this.flujo.actualizarTarea(t.id, { ...(estado ? { estado } : {}), seguimiento: this.seguimiento() || undefined }, this.nota() || undefined);
    this.cerrar();
  }

  protected cerrar(): void {
    this.dialogo().nativeElement.close();
    this.activaId.set(null);
  }
}
