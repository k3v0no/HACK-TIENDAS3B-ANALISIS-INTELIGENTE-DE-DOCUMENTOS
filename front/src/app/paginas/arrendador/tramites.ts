// Seguimiento del arrendador. Nunca muestra hallazgos internos ni el dictamen (sección 10 del
// plan): solo qué documentos ya cargó, en qué va cada uno, lo que Tiendas 3B le pide y cómo
// completar o sustituir un documento. Es el único perfil que sube documentos.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { DOC, Expediente, TIPOS_DOCUMENTO, Tarea, TipoDocumento } from '../../core/modelos';
import { Encabezado, Glifo, fecha, tamano } from '../../ui/ui';

type EstadoDoc = 'falta' | 'recibido' | 'analisis' | 'procesado' | 'incidencia' | 'vencido';
const ESTADO_DOC: Record<EstadoDoc, { texto: string; clase: string; icono: string }> = {
  falta: { texto: 'Falta', clase: 'neutra', icono: 'remove' },
  recibido: { texto: 'Recibido', clase: 'neutra', icono: 'inventory' },
  analisis: { texto: 'En análisis', clase: 'pendiente', icono: 'progress_activity' },
  procesado: { texto: 'Procesado', clase: 'cumple', icono: 'check' },
  incidencia: { texto: 'Con incidencia', clase: 'revisar', icono: 'error' },
  vencido: { texto: 'Vencido', clase: 'revisar', icono: 'schedule' },
};

interface FilaDoc { tipo: TipoDocumento; estado: EstadoDoc; archivos: string; version: number; nota: string }
interface Tramite { exp: Expediente; titulo: string; filas: FilaDoc[]; solicitudes: Tarea[]; etapa: number; cargados: number }

const ETAPAS = [
  { nombre: 'Documentos enviados', icono: 'send' },
  { nombre: 'Revisión de Tiendas 3B', icono: 'manage_search' },
  { nombre: 'Respuesta', icono: 'mark_email_read' },
];

@Component({
  selector: 'app-tramites',
  imports: [Encabezado, Glifo, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tramites.html',
  styleUrl: './tramites.css',
})
export class Tramites {
  private readonly cuentas = inject(CuentasService);
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly etapas = ETAPAS;
  protected readonly ESTADO_DOC = ESTADO_DOC;
  protected readonly DOC = DOC;
  protected readonly fecha = fecha;
  protected readonly tamano = tamano;
  protected readonly tipos = ExpedientesService.tipos;

  /** Documento que se está completando o sustituyendo: «expediente|tipo». */
  protected readonly subiendo = signal<string | null>(null);
  protected readonly archivos = signal<File[]>([]);
  protected readonly ocupado = signal(false);
  protected readonly aviso = signal('');
  protected readonly error = signal('');

  protected readonly tramites = computed<Tramite[]>(() => {
    const usuario = this.cuentas.cuenta()?.usuario;
    const tareas = this.flujo.tareas();
    return this.expedientes.lista().filter((e) => e.cuenta === usuario).map((e) => this.armar(e, tareas));
  });

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.sincronizarEnProceso();
    const reloj = setInterval(() => {
      if (this.expedientes.lista().some(ExpedientesService.enProceso)) this.expedientes.sincronizarEnProceso();
    }, 4000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  private armar(e: Expediente, tareas: Tarea[]): Tramite {
    const d = e.dictamen;
    const enProceso = ExpedientesService.enProceso(e);
    const filas: FilaDoc[] = TIPOS_DOCUMENTO.map((tipo) => {
      const vig = e.archivos.filter((a) => a.tipo === tipo && a.vigente);
      if (!vig.length) return { tipo, estado: 'falta', archivos: 'No enviado', version: 0, nota: DOC[tipo].que };
      const version = vig[0].version;
      const archivos = vig.map((a) => a.nombre).join(', ');
      const ultima = e.corridas.at(-1);
      const analizado = !!d && !!ultima?.dictamen && ultima.archivos.some((a) => a.tipo === tipo && a.version === version);
      if (enProceso) return { tipo, estado: 'analisis', archivos, version, nota: 'Lo estamos leyendo.' };
      if (!analizado || !d) return { tipo, estado: 'recibido', archivos, version, nota: 'Lo recibimos; falta revisarlo.' };
      const doc = d.documentos.find((x) => x.tipo === tipo);
      const regla = { 'Alineamiento y Número Oficial': 'A2', 'Uso de Suelo': 'U3', Predial: 'P2' }[tipo as string];
      if (regla && d.validaciones.some((v) => v.reglaId === regla && v.resultado === 'no_cumple')) {
        return { tipo, estado: 'vencido', archivos, version, nota: 'El documento ya no está vigente: envía uno actualizado.' };
      }
      if (doc && !doc.legible) return { tipo, estado: 'incidencia', archivos, version, nota: 'No se pudo leer bien: envía una copia más legible.' };
      if (d.validaciones.some((v) => v.id === `tipo-${doc?.id}`)) {
        return { tipo, estado: 'incidencia', archivos, version, nota: 'Parece otro tipo de documento: revisa que sea el correcto.' };
      }
      return { tipo, estado: 'procesado', archivos, version, nota: 'Revisado.' };
    });
    const solicitudes = tareas.filter((t) => t.exp === e.id && t.estado === 'solicitado');
    const pendientesDoc = filas.some((f) => f.estado !== 'procesado');
    return {
      exp: e, titulo: ExpedientesService.titulo(e), filas, solicitudes,
      etapa: d && !enProceso && !pendientesDoc && !solicitudes.length ? 2 : 1,
      cargados: filas.filter((f) => f.estado !== 'falta').length,
    };
  }

  protected abrirCarga(exp: string, tipo: TipoDocumento): void {
    this.subiendo.set(`${exp}|${tipo}`);
    this.archivos.set([]);
    this.error.set('');
    this.aviso.set('');
  }

  protected elegir(ev: Event): void {
    const entrada = ev.target as HTMLInputElement;
    const validos = Array.from(entrada.files ?? []).filter((f) => /\.(pdf|jpe?g|png)$/i.test(f.name));
    this.archivos.set(validos);
    if (validos.length < (entrada.files?.length ?? 0)) this.error.set('Solo se aceptan PDF, JPG o PNG.');
  }

  protected async enviar(exp: string, tipo: TipoDocumento): Promise<void> {
    if (!this.archivos().length) { this.error.set('Elige al menos un archivo.'); return; }
    this.ocupado.set(true);
    this.error.set('');
    try {
      const reemplaza = this.expedientes.obtener(exp)?.archivos.some((a) => a.tipo === tipo);
      await this.expedientes.agregarDocumentos(exp, { [tipo]: this.archivos() });
      let analizado = false;
      if (await this.expedientes.revisarConexion(true)) {
        await this.expedientes.iniciarAnalisis(exp, reemplaza ? `Nueva versión de ${tipo.toLowerCase()}` : `Se agregó ${tipo.toLowerCase()}`)
          .then(() => { analizado = true; }).catch(() => undefined);
      }
      this.subiendo.set(null);
      this.aviso.set(`Recibimos ${tipo.toLowerCase()}.` + (analizado ? ' Ya lo estamos revisando.' : ' Tiendas 3B lo revisará.'));
    } catch (e) {
      this.error.set(`No se pudo enviar: ${(e as Error).message}.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}
