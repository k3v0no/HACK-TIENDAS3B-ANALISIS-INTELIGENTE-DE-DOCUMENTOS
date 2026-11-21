// Expedientes: registro local, archivos en IndexedDB y conexión con el back.
//
// Flujo:
//   1. `recibir` guarda los archivos en IndexedDB (solo en este navegador) y registra quién y
//      cuándo los subió, con el tipo declarado de cada uno.
//   2. `iniciarAnalisis` los manda a POST /api/expedientes (las fotos se convierten a PDF,
//      porque el back solo acepta PDF). El proxy de desarrollo agrega la clave del back.
//   3. `sincronizar` consulta GET /api/expedientes/{id}; cuando el back termina, traduce su
//      dictamen a la forma del front y lo guarda.
//
// Límite del prototipo: el back no tiene una ruta para listar expedientes, así que la lista
// vive en este navegador. Para la demo, arrendador y trabajadores usan el mismo navegador.
import { Injectable, signal } from '@angular/core';
import { ExpedienteBack } from './back';
import { ArchivoRecibido, EstadoBandeja, Expediente, TIPOS_DOCUMENTO, TipoDocumento } from './modelos';
import { traducir } from './traduccion';

const LLAVE = 'tiendas3b.expedientes.v1';
const API = '/api';

// ---------------------------------------------------------------- IndexedDB mínimo

interface ArchivoGuardado { tipo: TipoDocumento; nombre: string; blob: Blob }

function abrirBd(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const req = indexedDB.open('tiendas3b', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('archivos');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

async function bd<T>(modo: IDBTransactionMode, accion: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const base = await abrirBd();
  return new Promise((ok, mal) => {
    const req = accion(base.transaction('archivos', modo).objectStore('archivos'));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => mal(req.error);
  });
}

// ---------------------------------------------------------------- conversión a PDF

async function comoPdf(a: ArchivoGuardado): Promise<File> {
  const bytes = new Uint8Array(await a.blob.arrayBuffer());
  const esPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (esPdf) return new File([bytes], a.nombre, { type: 'application/pdf' });
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const esPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const img = esPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  pdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const salida = await pdf.save();
  const nombre = a.nombre.replace(/\.[^.]+$/, '') + '.pdf';
  return new File([salida as BlobPart], nombre, { type: 'application/pdf' });
}

async function mensajeDeError(r: Response): Promise<string> {
  try {
    const cuerpo = await r.json();
    if (typeof cuerpo?.detail === 'string') return cuerpo.detail;
  } catch { /* sin cuerpo JSON */ }
  return r.status === 401 ? 'el back rechazó la clave de acceso (revisa BACK_API_KEY)'
    : `el back respondió con error ${r.status}`;
}

@Injectable({ providedIn: 'root' })
export class ExpedientesService {
  private readonly _lista = signal<Expediente[]>(this.leer());
  readonly lista = this._lista.asReadonly();
  readonly conectado = signal<boolean | null>(null);
  private ultimaRevision = 0;

  // ---------------------------------------------------------------- registro local

  private leer(): Expediente[] {
    try {
      return JSON.parse(localStorage.getItem(LLAVE) ?? '[]');
    } catch {
      return [];
    }
  }

  private guardar(lista: Expediente[]): void {
    lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
    this._lista.set([...lista]);
    try {
      localStorage.setItem(LLAVE, JSON.stringify(lista));
    } catch { /* sin almacenamiento: queda en memoria */ }
  }

  private actualizar(id: string, cambio: (e: Expediente) => void): Expediente | undefined {
    const lista = this.leer();
    const exp = lista.find((e) => e.id === id);
    if (!exp) return undefined;
    cambio(exp);
    this.guardar(lista);
    return exp;
  }

  /** Vuelve a leer la lista (otra pestaña pudo cambiarla). */
  refrescar(): void {
    this._lista.set(this.leer());
  }

  obtener(id: string): Expediente | undefined {
    return this._lista().find((e) => e.id === id);
  }

  deCuenta(usuario: string): Expediente[] {
    return this._lista().filter((e) => e.cuenta === usuario);
  }

  // ---------------------------------------------------------------- estado

  static enProceso(e: Expediente): boolean {
    return !!e.back && (e.back.estado === 'en_cola' || e.back.estado === 'procesando') && !e.dictamen;
  }

  static estado(e: Expediente): EstadoBandeja {
    if (e.dictamen) return e.dictamen.recomendacion;
    return ExpedientesService.enProceso(e) ? 'Analizando' : 'Sin analizar';
  }

  static titulo(e: Expediente): string {
    return e.dictamen?.inmueble || `Expediente ${e.id}`;
  }

  static tipos(e: Expediente): Set<TipoDocumento> {
    return new Set(e.archivos.map((a) => a.tipo));
  }

  imagenPagina(backId: string, docId: string, pagina: number): string {
    return `${API}/expedientes/${backId}/documentos/${docId}/paginas/${pagina}`;
  }

  /** True si el back responde. Se recuerda 10 segundos. */
  async revisarConexion(forzar = false): Promise<boolean> {
    if (!forzar && this.conectado() !== null && Date.now() - this.ultimaRevision < 10_000) return this.conectado()!;
    let ok = false;
    try {
      const r = await fetch(`${API}/salud`, { signal: AbortSignal.timeout(2000) });
      ok = r.ok;
    } catch { ok = false; }
    this.ultimaRevision = Date.now();
    this.conectado.set(ok);
    return ok;
  }

  // ---------------------------------------------------------------- acciones

  async recibir(docs: Partial<Record<TipoDocumento, File[]>>, origen: Expediente['origen'], cuenta: string): Promise<Expediente> {
    const ahora = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    let id = `EXP-${String(ahora.getFullYear()).slice(2)}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}-` +
      `${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`;
    const lista = this.leer();
    for (let n = 2; lista.some((e) => e.id === id); n++) id = id.replace(/(-\d+)?$/, '') + `-${n}`;

    const guardados: ArchivoGuardado[] = [];
    const archivos: ArchivoRecibido[] = [];
    for (const tipo of TIPOS_DOCUMENTO) {
      for (const f of docs[tipo] ?? []) {
        guardados.push({ tipo, nombre: f.name, blob: f });
        archivos.push({ tipo, nombre: f.name, tamano: f.size });
      }
    }
    await bd('readwrite', (s) => s.put(guardados, id));
    const exp: Expediente = { id, origen, cuenta, fecha: ahora.toISOString(), archivos };
    this.guardar([exp, ...lista]);
    return exp;
  }

  /** Manda el expediente al back y lo deja «en cola». Lanza Error con un motivo legible. */
  async iniciarAnalisis(id: string): Promise<void> {
    const guardados = await bd<ArchivoGuardado[] | undefined>('readonly', (s) => s.get(id));
    if (!guardados?.length) throw new Error('los archivos de este expediente ya no están en este navegador');
    const form = new FormData();
    for (const a of guardados) form.append('archivos', await comoPdf(a));
    let r: Response;
    try {
      r = await fetch(`${API}/expedientes`, { method: 'POST', body: form });
    } catch {
      throw new Error('no hay conexión con el back');
    }
    if (!r.ok) throw new Error(await mensajeDeError(r));
    const exp = (await r.json()) as ExpedienteBack;
    // El back guarda los documentos en el orden en que se enviaron: así se recupera el tipo declarado.
    const declarados: Record<string, TipoDocumento> = {};
    exp.documentos.forEach((d, i) => { if (guardados[i]) declarados[d.id] = guardados[i].tipo; });
    this.actualizar(id, (e) => {
      e.back = { id: exp.id, estado: exp.estado, etapa: exp.etapa, error: exp.error, declarados };
      delete e.dictamen;
      delete e.decision;
    });
  }

  /** Pregunta al back cómo va el expediente. Si no responde, lo deja como estaba. */
  async sincronizar(id: string): Promise<Expediente | undefined> {
    const actual = this.leer().find((e) => e.id === id);
    if (!actual?.back || actual.dictamen) return actual;
    try {
      const r = await fetch(`${API}/expedientes/${actual.back.id}`, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return actual;
      const exp = (await r.json()) as ExpedienteBack;
      return this.actualizar(id, (e) => {
        e.back = { ...e.back!, estado: exp.estado, etapa: exp.etapa, error: exp.error };
        if (exp.estado === 'listo' && exp.dictamen) e.dictamen = traducir(exp, e.back.declarados);
      });
    } catch {
      return actual;
    }
  }

  async sincronizarEnProceso(): Promise<void> {
    await Promise.all(this._lista().filter(ExpedientesService.enProceso).map((e) => this.sincronizar(e.id)));
  }

  decidir(id: string, valor: 'aprobado' | 'rechazado', por: string): void {
    this.actualizar(id, (e) => { e.decision = { valor, por, fecha: new Date().toISOString() }; });
  }
}
