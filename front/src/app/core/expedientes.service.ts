// Expedientes: registro local, archivos en IndexedDB, versiones, corridas y conexión con el back.
//
// Flujo:
//   1. El arrendador envía documentos (`recibir`) o completa/sustituye uno (`agregarDocumentos`).
//      Los archivos se guardan en IndexedDB (solo en este navegador) con su versión.
//   2. `iniciarAnalisis` manda los archivos vigentes a POST /api/expedientes y abre una corrida.
//      El proxy de desarrollo agrega la clave del back.
//   3. `sincronizar` consulta GET /api/expedientes/{id}; cuando el back termina, traduce el
//      dictamen y lo guarda en la corrida. Las corridas anteriores se conservan para la auditoría.
//
// La lista de trabajo vive en este navegador, pero `importarDelBack` trae los expedientes que el
// back ya tiene analizados (GET /api/expedientes), así que otro navegador también los ve. Lo que
// no viaja son los archivos originales ni las tareas, notas y decisiones, que siguen siendo locales.
import { Injectable, inject, signal } from '@angular/core';
import { ExpedienteBack, ResumenBack } from './back';
import { CuentasService } from './cuentas.service';
import { FlujoService } from './flujo.service';
import { ArchivoRecibido, Corrida, DOC, EstadoBandeja, Expediente, TIPOS_DOCUMENTO, TipoDocumento } from './modelos';
import { TIPO_BACK, traducir } from './traduccion';

const LLAVE = 'tiendas3b.expedientes.v3';
const API = '/api';

// ---------------------------------------------------------------- IndexedDB mínimo

interface ArchivoGuardado { tipo: TipoDocumento; nombre: string; blob: Blob; version?: number; vigente?: boolean }

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

/** Completa datos de expedientes guardados con versiones anteriores del prototipo. */
function migrar(e: Expediente): Expediente {
  e.archivos = e.archivos.map((a) => {
    const v = a as Partial<ArchivoRecibido>;
    return { ...a, version: v.version ?? 1, vigente: v.vigente ?? true, fecha: v.fecha ?? e.fecha };
  });
  if (!e.corridas) {
    e.corridas = e.back ? [{ n: 1, fecha: e.fecha, backId: e.back.id, reglasVersion: 1, motivo: 'Primera revisión',
      archivos: e.archivos.map((a) => ({ tipo: a.tipo, nombre: a.nombre, version: a.version })), dictamen: e.dictamen }] : [];
  }
  return e;
}

@Injectable({ providedIn: 'root' })
export class ExpedientesService {
  private readonly flujo = inject(FlujoService);
  private readonly cuentas = inject(CuentasService);
  private readonly _lista = signal<Expediente[]>(this.leer());
  readonly lista = this._lista.asReadonly();
  readonly conectado = signal<boolean | null>(null);
  private ultimaRevision = 0;
  private ultimaImportacion = 0;
  private importando = false;

  // ---------------------------------------------------------------- registro local

  private leer(): Expediente[] {
    try {
      return (JSON.parse(localStorage.getItem(LLAVE) ?? '[]') as Expediente[]).map(migrar);
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

  /** Vuelve a leer la lista (otra pestaña pudo cambiarla) y trae del back lo que falte. */
  refrescar(): void {
    this._lista.set(this.leer());
    this.flujo.refrescar();
    void this.importarDelBack();
  }

  /** Cabecera con el usuario de la sesión, para que la bitácora del back sepa quién actúa. */
  private cabeceras(): Record<string, string> {
    const usuario = this.cuentas.cuenta()?.usuario;
    return usuario ? { 'X-Usuario': encodeURIComponent(usuario) } : {};
  }

  /**
   * Trae del back los expedientes ya analizados que este navegador no conoce (p. ej. cargados
   * desde otro equipo). Devuelve cuántos agregó. No se repite más de una vez cada 15 segundos.
   */
  async importarDelBack(): Promise<number> {
    if (this.importando || Date.now() - this.ultimaImportacion < 15_000) return 0;
    this.importando = true;
    this.ultimaImportacion = Date.now();
    let agregados = 0;
    try {
      const r = await fetch(`${API}/expedientes`, { headers: this.cabeceras(), signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return 0;
      const resumenes = (await r.json()) as ResumenBack[];
      const conocidos = new Set(this.leer().flatMap((e) => [e.back?.id, ...e.corridas.map((c) => c.backId)]));
      for (const fila of resumenes.filter((x) => x.estado === 'listo' && !conocidos.has(x.id)).reverse()) {
        const rd = await fetch(`${API}/expedientes/${fila.id}`, { headers: this.cabeceras(), signal: AbortSignal.timeout(15_000) });
        if (!rd.ok) continue;
        const back = (await rd.json()) as ExpedienteBack;
        if (!back.dictamen) continue;
        const lista = this.leer();
        if (lista.some((e) => e.back?.id === back.id)) continue; // otra pestaña lo importó mientras tanto
        const dictamen = traducir(back, {});
        const fecha = fila.creado || new Date().toISOString();
        const archivos: ArchivoRecibido[] = back.documentos.flatMap((d) => {
          const tipo = TIPO_BACK[d.tipo];
          return tipo ? [{ tipo, nombre: d.archivo, tamano: 0, version: 1, vigente: true, fecha }] : [];
        });
        const exp: Expediente = {
          id: `EXP-${back.id.slice(0, 8).toUpperCase()}`,
          origen: fila.origen === 'arrendador' ? 'arrendador' : '3b',
          cuenta: fila.cuenta ?? '',
          fecha, archivos,
          back: { id: back.id, estado: back.estado, etapa: back.etapa, error: back.error, declarados: {} },
          corridas: [{
            n: 1, fecha, backId: back.id, reglasVersion: this.flujo.reglasVigentes().version, motivo: 'Primera revisión',
            archivos: archivos.map((a) => ({ tipo: a.tipo, nombre: a.nombre, version: 1 })), dictamen,
          }],
          dictamen,
        };
        this.guardar([exp, ...lista]);
        this.flujo.registrar(exp.id, 'resultado', `Recuperado del servicio de análisis: ${dictamen.recomendacion} ` +
          `(confianza ${Math.round(dictamen.confianza * 100)} %, ${dictamen.hallazgos.length} hallazgos)`, true);
        agregados++;
      }
    } catch { /* sin conexión con el back: se reintenta en la siguiente visita */ } finally {
      this.importando = false;
    }
    return agregados;
  }

  obtener(id: string): Expediente | undefined {
    return this._lista().find((e) => e.id === id);
  }

  // ---------------------------------------------------------------- estado

  static enProceso(e: Expediente): boolean {
    return !!e.back && (e.back.estado === 'en_cola' || e.back.estado === 'procesando');
  }

  static estado(e: Expediente): EstadoBandeja {
    if (ExpedientesService.enProceso(e)) return 'Analizando';
    if (e.dictamen) return e.dictamen.recomendacion;
    return 'Sin analizar';
  }

  static titulo(e: Expediente): string {
    return e.dictamen?.inmueble || `Expediente ${e.id}`;
  }

  /** Tipos de documento con al menos un archivo vigente. */
  static tipos(e: Expediente): Set<TipoDocumento> {
    return new Set(e.archivos.filter((a) => a.vigente).map((a) => a.tipo));
  }

  static vigentes(e: Expediente): ArchivoRecibido[] {
    return e.archivos.filter((a) => a.vigente);
  }

  static ultimaCorrida(e: Expediente): Corrida | undefined {
    return e.corridas.at(-1);
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

  // ---------------------------------------------------------------- acciones del arrendador

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
        guardados.push({ tipo, nombre: f.name, blob: f, version: 1, vigente: true });
        archivos.push({ tipo, nombre: f.name, tamano: f.size, version: 1, vigente: true, fecha: ahora.toISOString() });
      }
    }
    await bd('readwrite', (s) => s.put(guardados, id));
    const exp: Expediente = { id, origen, cuenta, fecha: ahora.toISOString(), archivos, corridas: [] };
    this.guardar([exp, ...lista]);
    const tipos = [...new Set(archivos.map((a) => a.tipo))];
    this.flujo.registrar(id, 'carga', `Envió ${archivos.length} archivo(s): ${tipos.join(', ')}`);
    return exp;
  }

  /** Completa un faltante o sustituye un documento. La versión anterior se conserva para la auditoría. */
  async agregarDocumentos(id: string, docs: Partial<Record<TipoDocumento, File[]>>): Promise<void> {
    const guardados = (await bd<ArchivoGuardado[] | undefined>('readonly', (s) => s.get(id))) ?? [];
    const exp = this.leer().find((e) => e.id === id);
    if (!exp) throw new Error('no existe el expediente');
    const ahora = new Date().toISOString();
    const cambios: string[] = [];
    for (const tipo of TIPOS_DOCUMENTO) {
      const nuevos = docs[tipo];
      if (!nuevos?.length) continue;
      const version = Math.max(0, ...exp.archivos.filter((a) => a.tipo === tipo).map((a) => a.version)) + 1;
      for (const g of guardados) if (g.tipo === tipo) g.vigente = false;
      for (const a of exp.archivos) if (a.tipo === tipo) a.vigente = false;
      for (const f of nuevos) {
        guardados.push({ tipo, nombre: f.name, blob: f, version, vigente: true });
        exp.archivos.push({ tipo, nombre: f.name, tamano: f.size, version, vigente: true, fecha: ahora });
      }
      cambios.push(version === 1 ? `agregó ${tipo.toLowerCase()}` : `sustituyó ${tipo.toLowerCase()} (versión ${version})`);
      this.flujo.documentoRecibido(id, tipo);
    }
    await bd('readwrite', (s) => s.put(guardados, id));
    this.actualizar(id, (e) => { e.archivos = exp.archivos; });
    this.flujo.registrar(id, 'version', cambios.join('; ').replace(/^./, (c) => c.toUpperCase()));
  }

  // ---------------------------------------------------------------- análisis

  /** Manda los archivos vigentes al back y abre una corrida. Lanza Error con un motivo legible. */
  async iniciarAnalisis(id: string, motivo = 'Primera revisión'): Promise<void> {
    const todos = await bd<ArchivoGuardado[] | undefined>('readonly', (s) => s.get(id));
    const guardados = (todos ?? []).filter((a) => a.vigente !== false);
    if (!guardados.length) throw new Error('los archivos de este expediente ya no están en este navegador');
    const form = new FormData();
    for (const a of guardados) form.append('archivos', await comoPdf(a));
    const registro = this.leer().find((e) => e.id === id);
    if (registro) {
      form.append('origen', registro.origen);
      if (registro.cuenta) form.append('cuenta', registro.cuenta);
    }
    let r: Response;
    try {
      r = await fetch(`${API}/expedientes`, { method: 'POST', body: form, headers: this.cabeceras() });
    } catch {
      throw new Error('no hay conexión con el back');
    }
    if (!r.ok) throw new Error(await mensajeDeError(r));
    const back = (await r.json()) as ExpedienteBack;
    // El back guarda los documentos en el orden en que se enviaron: así se recupera el tipo declarado.
    const declarados: Record<string, TipoDocumento> = {};
    back.documentos.forEach((d, i) => { if (guardados[i]) declarados[d.id] = guardados[i].tipo; });
    const reglasVersion = this.flujo.reglasVigentes().version;
    let n = 0;
    this.actualizar(id, (e) => {
      e.back = { id: back.id, estado: back.estado, etapa: back.etapa, error: back.error, declarados };
      n = e.corridas.length + 1;
      e.corridas.push({
        n, fecha: new Date().toISOString(), backId: back.id, reglasVersion, motivo,
        archivos: guardados.map((a) => ({ tipo: a.tipo, nombre: a.nombre, version: a.version ?? 1 })),
      });
    });
    this.flujo.registrar(id, 'analisis', `Se envió a análisis (corrida ${n}, reglas v${reglasVersion}): ${motivo}`);
  }

  /** Pregunta al back cómo va el expediente. Si no responde, lo deja como estaba. */
  async sincronizar(id: string): Promise<Expediente | undefined> {
    const actual = this.leer().find((e) => e.id === id);
    if (!actual?.back || !ExpedientesService.enProceso(actual)) return actual;
    try {
      const r = await fetch(`${API}/expedientes/${actual.back.id}`, { headers: this.cabeceras(), signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return actual;
      const back = (await r.json()) as ExpedienteBack;
      let terminado: Corrida | undefined;
      const exp = this.actualizar(id, (e) => {
        e.back = { ...e.back!, estado: back.estado, etapa: back.etapa, error: back.error };
        if (back.estado === 'listo' && back.dictamen) {
          const d = traducir(back, e.back.declarados);
          e.dictamen = d;
          const corrida = e.corridas.find((c) => c.backId === back.id);
          if (corrida) { corrida.dictamen = d; terminado = corrida; }
        }
      });
      if (terminado?.dictamen) {
        this.flujo.registrar(id, 'resultado', `Corrida ${terminado.n}: ${terminado.dictamen.recomendacion} ` +
          `(confianza ${Math.round(terminado.dictamen.confianza * 100)} %, ${terminado.dictamen.hallazgos.length} hallazgos)`, true);
        this.flujo.analisisTerminado(id);
        this.flujo.notificar({ exp: id, clase: 'info', titulo: 'Terminamos de leer tus documentos',
          texto: 'Tiendas 3B ya los está revisando. Aquí verás si alguno necesita sustituirse.' });
        for (const doc of terminado.dictamen.documentos) {
          const nc = doc.noCorresponde;
          const esperado = TIPOS_DOCUMENTO.find((t) => t === nc?.declarado);
          if (!nc || !esperado) continue;
          this.flujo.notificar({
            exp: id, clase: 'alerta', documento: esperado,
            titulo: `El archivo de ${esperado.toLowerCase()} no es el que necesitamos`,
            texto: `«${doc.archivo}» parece ser ${nc.pareceSer}. Lo que necesitamos es: ${DOC[esperado].que.toLowerCase()}. ` +
              'Puedes sustituirlo desde este trámite.',
          });
        }
      } else if (back.estado === 'error') {
        this.flujo.registrar(id, 'resultado', `El análisis no terminó: ${back.error ?? 'error sin detalle'}`, true);
      }
      return exp;
    } catch {
      return actual;
    }
  }

  async sincronizarEnProceso(): Promise<void> {
    await Promise.all(this._lista().filter(ExpedientesService.enProceso).map((e) => this.sincronizar(e.id)));
  }
}
