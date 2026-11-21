// Dictamen completo: hallazgos, datos extraídos y validaciones con su evidencia. Es la consulta
// compartida a la que llegan las vistas de cada rol. Lo que se muestra depende de los permisos del
// área: un dato sin permiso aparece oculto (también en sus fragmentos citados) y el visor de
// documentos solo está disponible con «documentos.ver».
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Location, NgTemplateOutlet } from '@angular/common';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { DOC, Evidencia, Resultado, TIPOS_DOCUMENTO, TipoDocumento } from '../../core/modelos';
import { contarHallazgos } from '../../core/permisos-vista';
import { Visibilidad } from '../../core/visibilidad';
import { Estado, FilaDocumento, Fragmento, Glifo, ListaDocs, fecha, pct } from '../../ui/ui';
import { RevisarDocumentos } from '../../ui/expediente-ui';
import { Visor } from '../../ui/visor';

const ORDEN_RESULTADO: Record<Resultado, number> = { no_cumple: 0, revisar: 1, cumple: 2 };
const SEVERIDAD = {
  alta: { texto: 'Severidad alta', clase: 'no_cumple', icono: 'priority_high' },
  media: { texto: 'Severidad media', clase: 'revisar', icono: 'error' },
  baja: { texto: 'Severidad baja', clase: 'neutra', icono: 'info' },
};
type Pestana = 'hallazgos' | 'datos' | 'validaciones';

@Component({
  selector: 'app-dictamen',
  imports: [NgTemplateOutlet, Estado, Glifo, ListaDocs, Fragmento, Visor, RevisarDocumentos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dictamen.html',
  styleUrl: './dictamen.css',
})
export class DictamenCompleto {
  readonly id = input.required<string>();

  private readonly cuentas = inject(CuentasService);
  private readonly visible = inject(Visibilidad);
  private readonly location = inject(Location);
  protected readonly expedientes = inject(ExpedientesService);
  protected readonly DOC = DOC;
  protected readonly SEVERIDAD = SEVERIDAD;
  protected readonly fecha = fecha;
  protected readonly pct = pct;
  protected readonly OCULTO = 'Oculto por permisos';

  protected readonly puedeDocs = this.cuentas.puede('documentos.ver');
  protected readonly puedeAnalizar = this.cuentas.puede('expedientes.analizar');

  protected readonly pestana = signal<Pestana>('hallazgos');
  protected readonly evidencia = signal<Evidencia | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly conectado = this.expedientes.conectado;

  protected readonly exp = computed(() => this.expedientes.lista().find((e) => e.id === this.id()));
  protected readonly d = computed(() => this.exp()?.dictamen);
  protected readonly enProceso = computed(() => !!this.exp() && ExpedientesService.enProceso(this.exp()!));
  protected readonly titulo = computed(() => (this.exp() ? ExpedientesService.titulo(this.exp()!) : 'Expediente'));
  protected readonly tiposRecibidos = computed(() => new Set(
    (this.d()?.documentos ?? []).map((x) => x.tipo).filter((t): t is TipoDocumento => t !== 'Desconocido')));
  protected readonly nHallazgos = computed(() => (this.d() ? contarHallazgos(this.d()!) : 0));
  protected readonly faltanTexto = computed(() => {
    const rec = this.tiposRecibidos();
    const faltan = TIPOS_DOCUMENTO.filter((t) => !rec.has(t)).map((t) => DOC[t].corto.toLowerCase());
    return faltan.length ? `Falta ${faltan.join(', ')}` : 'Expediente completo';
  });
  protected readonly filasRecibidas = computed<FilaDocumento[]>(() => {
    const e = this.exp();
    if (!e) return [];
    return TIPOS_DOCUMENTO.map((tipo) => {
      const n = e.archivos.filter((a) => a.tipo === tipo && a.vigente).map((a) => a.nombre);
      return { tipo, detalle: n.length ? n.join(', ') : 'No se envió', estado: n.length ? 'si' : 'no' } as FilaDocumento;
    });
  });
  protected readonly problemas = computed(() => (this.d()?.hallazgos.length ? [] :
    (this.d()?.validaciones ?? []).filter((v) => v.resultado !== 'cumple').sort((a, b) => ORDEN_RESULTADO[a.resultado] - ORDEN_RESULTADO[b.resultado])));
  protected readonly validaciones = computed(() =>
    [...(this.d()?.validaciones ?? [])].sort((a, b) => ORDEN_RESULTADO[a.resultado] - ORDEN_RESULTADO[b.resultado]));
  protected readonly conteo = computed(() => {
    const c = { cumple: 0, revisar: 0, no_cumple: 0 };
    for (const v of this.d()?.validaciones ?? []) c[v.resultado]++;
    return c;
  });
  protected readonly documentoActivo = computed(() => this.d()?.documentos.find((x) => x.id === this.evidencia()?.documento));
  protected readonly urlPagina = (b: string, doc: string, p: number) => this.expedientes.imagenPagina(b, doc, p);

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.revisarConexion();
    queueMicrotask(() => this.expedientes.sincronizar(this.id()));
    const reloj = setInterval(() => { if (this.enProceso()) this.expedientes.sincronizar(this.id()); }, 3000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected nombreDoc(id: string): string {
    return this.d()?.documentos.find((x) => x.id === id)?.tipo ?? id;
  }

  protected ve(campo: string): boolean {
    return this.visible.campo(campo);
  }

  protected veEvidencia(ev: Evidencia): boolean {
    return this.visible.evidencia(this.d(), ev);
  }

  protected volver(): void {
    this.location.back();
  }

  protected verEnDocumento(ev: Evidencia): void {
    this.evidencia.set(ev);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setTimeout(() => document.getElementById('visor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  protected iconoDoc(tipo: string): string {
    return (DOC as Record<string, { icono: string }>)[tipo]?.icono ?? 'description';
  }

  protected async analizar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.expedientes.iniciarAnalisis(this.id(), 'Reintento del análisis');
    } catch (e) {
      this.error.set(`No se pudo enviar a análisis: ${(e as Error).message}. Revisa que el servicio de análisis esté encendido e inténtalo de nuevo.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}
