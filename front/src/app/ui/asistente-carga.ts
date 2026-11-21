// Asistente de carga por pasos: Escrituras → Predial → Alineamiento → Uso de suelo → Enviar.
//
// Cada paso pide un solo tipo de documento, así quien sube no tiene que adivinar qué falta y
// el back recibe el tipo declarado de cada archivo. Se puede avanzar sin un documento (el
// análisis lo marcará como faltante), saltar a cualquier paso desde su tarjeta y quitar archivos.
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DOC, TIPOS_DOCUMENTO, TipoDocumento } from '../core/modelos';
import { tamano } from './ui';

const ACEPTA = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const N = TIPOS_DOCUMENTO.length;

@Component({
  selector: 'app-asistente-carga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './asistente-carga.html',
  styleUrl: './asistente-carga.css',
})
export class AsistenteCarga {
  readonly etiquetaEnvio = input('Enviar documentos');
  readonly iconoEnvio = input('send');
  readonly ocupado = input(false);
  readonly enviar = output<Partial<Record<TipoDocumento, File[]>>>();

  protected readonly tipos = TIPOS_DOCUMENTO;
  protected readonly DOC = DOC;
  protected readonly N = N;
  protected readonly acepta = ACEPTA;
  protected readonly tamano = tamano;

  protected readonly paso = signal(0);
  protected readonly docs = signal<Record<TipoDocumento, File[]>>(this.vacio());
  protected readonly omitidos = signal<Set<TipoDocumento>>(new Set());
  protected readonly arrastrando = signal(false);
  protected readonly rechazados = signal<string[]>([]);

  protected readonly cargados = computed(() => TIPOS_DOCUMENTO.filter((t) => this.docs()[t].length).length);
  protected readonly faltan = computed(() => TIPOS_DOCUMENTO.filter((t) => !this.docs()[t].length));
  protected readonly tipoActual = computed(() => TIPOS_DOCUMENTO[this.paso()]);

  private vacio(): Record<TipoDocumento, File[]> {
    return Object.fromEntries(TIPOS_DOCUMENTO.map((t) => [t, []])) as unknown as Record<TipoDocumento, File[]>;
  }

  reiniciar(): void {
    this.paso.set(0);
    this.docs.set(this.vacio());
    this.omitidos.set(new Set());
    this.rechazados.set([]);
  }

  protected ir(i: number): void {
    this.paso.set(Math.max(0, Math.min(i, N)));
    this.rechazados.set([]);
  }

  protected estadoTarjeta(i: number): 'hecho' | 'omitido' | 'pendiente' {
    const t = TIPOS_DOCUMENTO[i];
    if (this.docs()[t].length) return 'hecho';
    return this.omitidos().has(t) ? 'omitido' : 'pendiente';
  }

  protected agregar(lista: FileList | null): void {
    if (!lista?.length) return;
    const tipo = this.tipoActual();
    const actuales = this.docs()[tipo];
    const nuevos: File[] = [];
    const rechazados: string[] = [];
    for (const f of Array.from(lista)) {
      const valido = /\.(pdf|jpe?g|png)$/i.test(f.name);
      if (!valido) rechazados.push(f.name);
      else if (!actuales.some((a) => a.name === f.name && a.size === f.size)) nuevos.push(f);
    }
    this.rechazados.set(rechazados);
    if (nuevos.length) {
      this.docs.update((d) => ({ ...d, [tipo]: [...d[tipo], ...nuevos] }));
      this.omitidos.update((s) => { const n = new Set(s); n.delete(tipo); return n; });
    }
  }

  protected alElegir(ev: Event): void {
    const entrada = ev.target as HTMLInputElement;
    this.agregar(entrada.files);
    entrada.value = '';
  }

  protected alSoltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(false);
    this.agregar(ev.dataTransfer?.files ?? null);
  }

  protected alArrastrar(ev: DragEvent, dentro: boolean): void {
    ev.preventDefault();
    this.arrastrando.set(dentro);
  }

  protected quitar(i: number): void {
    const tipo = this.tipoActual();
    this.docs.update((d) => ({ ...d, [tipo]: d[tipo].filter((_, j) => j !== i) }));
  }

  protected continuar(sinArchivo: boolean): void {
    if (sinArchivo) this.omitidos.update((s) => new Set(s).add(this.tipoActual()));
    this.ir(this.paso() + 1);
  }

  protected nombres(t: TipoDocumento): string {
    return this.docs()[t].map((f) => f.name).join(', ');
  }

  protected confirmar(): void {
    const salida: Partial<Record<TipoDocumento, File[]>> = {};
    for (const t of TIPOS_DOCUMENTO) if (this.docs()[t].length) salida[t] = [...this.docs()[t]];
    this.enviar.emit(salida);
  }
}
