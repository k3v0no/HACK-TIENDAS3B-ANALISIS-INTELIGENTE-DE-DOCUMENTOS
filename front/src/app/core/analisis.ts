// Lecturas derivadas del dictamen y del flujo, que usan las vistas de cada rol.
import {
  Area, Correccion, Dato, DecisionNegocio, Dictamen, Documento, Efecto, Evidencia, Expediente, Hallazgo, Recomendacion,
  Tarea, TipoDocumento, ValidacionJuridica,
} from './modelos';
import { Causa, Parametros, causaDe, regla } from './reglas-catalogo';
import { ExpedientesService } from './expedientes.service';

// ---------------------------------------------------------------- normalización (como el back)

const ABREV: Record<string, string> = {
  av: 'avenida', avda: 'avenida', ave: 'avenida', c: 'calle', cll: 'calle', col: 'colonia', fracc: 'fraccionamiento',
  frac: 'fraccionamiento', blvd: 'boulevard', blv: 'boulevard', bulevar: 'boulevard', carr: 'carretera', km: 'kilometro',
  no: '', num: '', numero: '', nro: '', mza: 'manzana', mz: 'manzana', lt: 'lote', lte: 'lote', edo: 'estado',
  mpio: 'municipio', sta: 'santa', sto: 'santo', pte: 'poniente', ote: 'oriente', nte: 'norte', ma: 'maria',
};
const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'sr', 'sra', 'lic', 'ing']);

export function normalizar(t: string | null | undefined): string {
  if (!t) return '';
  const limpio = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  return limpio.split(/\s+/).map((p) => ABREV[p] ?? p).filter(Boolean).join(' ');
}

function numero(t: string | null | undefined): number | null {
  const m = (t ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function mismoNombre(a: string, b: string): boolean {
  const ta = new Set(normalizar(a).split(' ').filter((p) => !VACIAS.has(p)));
  const tb = new Set(normalizar(b).split(' ').filter((p) => !VACIAS.has(p)));
  const comunes = [...ta].filter((p) => tb.has(p)).length;
  const menor = Math.min(ta.size, tb.size);
  return menor > 0 && comunes >= (menor <= 3 ? menor : menor - 1);
}

export function aFecha(t: string | null | undefined): Date | null {
  if (!t) return null;
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

export function fechaCorta(d: Date | null): string {
  return d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export function dato(d: Dictamen, docId: string, nombre: string): Dato | undefined {
  return d.datos[docId]?.find((x) => x.nombre === nombre);
}

export function docDeTipo(d: Dictamen, tipo: TipoDocumento): Documento | undefined {
  return d.documentos.find((x) => x.tipo === tipo);
}

// ---------------------------------------------------------------- ¿qué impide avanzar?

export interface Bloqueo { frase: string; detalle: string; accion: string | null; hallazgo?: Hallazgo; documento?: TipoDocumento }

const DOC_DE_REGLA: Record<string, TipoDocumento> = {
  E: 'Escrituras', P: 'Predial', A: 'Alineamiento y Número Oficial', U: 'Uso de Suelo',
};

export function documentoDeRegla(reglaId: string): TipoDocumento | undefined {
  return DOC_DE_REGLA[reglaId.charAt(0)];
}

export function queImpideAvanzar(e: Expediente): Bloqueo {
  const d = e.dictamen;
  if (!d) {
    return ExpedientesService.enProceso(e)
      ? { frase: 'El análisis está en curso.', detalle: e.back?.etapa || 'En cola', accion: null }
      : { frase: 'Todavía no se ha analizado.', detalle: 'Lanza el análisis para saber qué falta.', accion: 'Analizar expediente' };
  }
  const h = d.hallazgos[0];
  if (!h) return { frase: 'Nada impide avanzar.', detalle: 'Todas las reglas se cumplieron; el expediente puede pasar a decisión.', accion: null };
  const faltante = d.faltantes[0];
  if (h.reglaId === 'X7' && faltante) {
    return { frase: `Falta ${faltante.toLowerCase()}.`, detalle: h.explicacion, accion: h.accionSugerida, hallazgo: h,
      documento: faltante as TipoDocumento };
  }
  return { frase: h.titulo.endsWith('.') ? h.titulo : `${h.titulo}.`, detalle: h.explicacion, accion: h.accionSugerida, hallazgo: h,
    documento: documentoDeRegla(h.reglaId) };
}

export function causas(d: Dictamen | undefined): Set<Causa> {
  return new Set((d?.hallazgos ?? []).map((h) => causaDe(h.reglaId)));
}

// ---------------------------------------------------------------- validación jurídica

export interface EstadoValidacion { estado: 'sin_hallazgos' | 'pendiente' | 'parcial' | 'validado'; hechos: number; total: number; texto: string }

export function relevantes(d: Dictamen | undefined): Hallazgo[] {
  return (d?.hallazgos ?? []).filter((h) => h.severidad !== 'baja');
}

export function estadoValidacion(e: Expediente, vals: ValidacionJuridica[]): EstadoValidacion {
  const rel = relevantes(e.dictamen);
  const hechos = rel.filter((h) => vals.some((v) => v.exp === e.id && v.hallazgo === h.id)).length;
  if (!rel.length) return { estado: 'sin_hallazgos', hechos, total: 0, texto: 'Sin hallazgos que validar' };
  if (!hechos) return { estado: 'pendiente', hechos, total: rel.length, texto: 'Sin validación jurídica' };
  if (hechos < rel.length) return { estado: 'parcial', hechos, total: rel.length, texto: `Validación jurídica: ${hechos} de ${rel.length}` };
  return { estado: 'validado', hechos, total: rel.length, texto: 'Validado por Jurídico' };
}

// ---------------------------------------------------------------- responsable de la siguiente acción

export interface Siguiente { area: Area | 'Sistema' | 'Sin pendientes'; accion: string; icono: string }

export function siguienteAccion(e: Expediente, tareas: Tarea[], vals: ValidacionJuridica[], decision?: DecisionNegocio): Siguiente {
  if (decision) {
    const t = { avanza: 'Avanza', espera: 'En espera', descartado: 'Descartado' }[decision.valor];
    return { area: 'Sin pendientes', accion: `Decidido: ${t}`, icono: 'flag' };
  }
  if (ExpedientesService.enProceso(e)) return { area: 'Sistema', accion: 'Analizando documentos', icono: 'progress_activity' };
  if (!e.dictamen) {
    return e.back?.estado === 'error'
      ? { area: 'Expansión', accion: 'Reintentar el análisis', icono: 'refresh' }
      : { area: 'Expansión', accion: 'Lanzar el análisis', icono: 'play_arrow' };
  }
  const abiertas = tareas.filter((t) => t.exp === e.id && t.estado !== 'resuelto').sort((a, b) => a.fecha.localeCompare(b.fecha));
  const t = abiertas[0];
  if (t) {
    if (t.estado === 'solicitado') return { area: 'Arrendador', accion: `Enviar ${t.documento?.toLowerCase() ?? 'el documento solicitado'}`, icono: 'real_estate_agent' };
    if (t.estado === 'recibido' || t.estado === 'en_verificacion') {
      return { area: t.area === 'Arrendador' ? 'Trámites' : t.area, accion: `Verificar lo recibido: ${t.titulo}`, icono: 'fact_check' };
    }
    return { area: t.area, accion: t.titulo, icono: 'assignment_ind' };
  }
  const v = estadoValidacion(e, vals);
  if (e.dictamen.recomendacion === 'Cumple' || v.estado === 'validado') return { area: 'Gerencia', accion: 'Decidir si avanza', icono: 'gavel' };
  return { area: 'Expansión', accion: 'Revisar y turnar lo que impide avanzar', icono: 'travel_explore' };
}

// ---------------------------------------------------------------- vigencias (gestor)

export type EstadoVigencia = 'vigente' | 'proximo' | 'vencido' | 'no_acreditada' | 'no_aplicable';
export const VIGENCIA: Record<EstadoVigencia, { texto: string; clase: string; icono: string }> = {
  vigente: { texto: 'Vigente', clase: 'cumple', icono: 'event_available' },
  proximo: { texto: 'Próximo a vencer', clase: 'revisar', icono: 'schedule' },
  vencido: { texto: 'Vencido', clase: 'no_cumple', icono: 'event_busy' },
  no_acreditada: { texto: 'Vigencia no acreditada', clase: 'revisar', icono: 'help' },
  no_aplicable: { texto: 'Vigencia no aplicable', clase: 'neutra', icono: 'remove' },
};

export interface Permiso {
  exp: Expediente;
  documento: Documento;
  autoridad: string | null;
  emision: Date | null;
  vence: Date | null;
  estado: EstadoVigencia;
  dias: number | null; // días hasta el vencimiento (negativo si ya venció)
  referencia: Date;
  explicacion: string;
  datos: Dato[];
}

const REGLA_VIGENCIA: Partial<Record<TipoDocumento, string>> = {
  'Alineamiento y Número Oficial': 'A2', 'Uso de Suelo': 'U3', Predial: 'P2',
};

export function permisos(e: Expediente, diasAviso: number): Permiso[] {
  const d = e.dictamen;
  if (!d) return [];
  const ref = aFecha(d.fechaReferencia) ?? new Date();
  const salida: Permiso[] = [];
  for (const doc of d.documentos) {
    if (doc.tipo === 'Escrituras' || doc.tipo === 'Desconocido') continue;
    const v = (n: string) => dato(d, doc.id, n)?.valor ?? null;
    const emision = aFecha(v('fecha_emision') ?? v('fecha_pago'));
    let vence = aFecha(v('vigencia_hasta'));
    let explicacion = '';
    if (vence) explicacion = 'Fecha de vencimiento expresa en el documento.';
    const plazo = numero(v('vigencia_plazo_meses'));
    if (!vence && emision && plazo) {
      vence = new Date(emision); vence.setMonth(vence.getMonth() + plazo);
      explicacion = `Emisión más ${plazo} meses de plazo.`;
    }
    const ejercicio = numero(v('ejercicio_fiscal'));
    if (!vence && doc.tipo === 'Predial' && ejercicio) {
      vence = new Date(ejercicio, 11, 31);
      explicacion = `Ejercicio fiscal ${ejercicio} pagado: cubre hasta el fin de ese año.`;
    }
    const reglaId = REGLA_VIGENCIA[doc.tipo as TipoDocumento];
    const val = d.validaciones.find((x) => x.reglaId === reglaId);
    let estado: EstadoVigencia;
    let dias: number | null = null;
    if (vence) {
      dias = Math.round((vence.getTime() - ref.getTime()) / 86_400_000);
      estado = dias < 0 ? 'vencido' : dias <= diasAviso ? 'proximo' : 'vigente';
    } else if (val?.resultado === 'cumple') {
      estado = 'no_aplicable';
      explicacion = 'El documento no da fecha de vencimiento y la regla no la exige.';
    } else {
      estado = 'no_acreditada';
      explicacion = val?.detalle || 'El documento no indica fecha de vencimiento ni plazo.';
    }
    salida.push({
      exp: e, documento: doc, autoridad: v('autoridad_emisora'), emision, vence, estado, dias, referencia: ref, explicacion,
      datos: (d.datos[doc.id] ?? []).filter((x) => /autoridad|emisi|vigen|plazo|uso|giro|zonif|compatib|condicion|afectaci|alineamiento|folio|firma|ejercicio|adeudo/i.test(x.nombre)),
    });
  }
  return salida;
}

// ---------------------------------------------------------------- comparador (jurídico)

export interface Celda { documento: string; valor: string | null; auto: string | null; correccion?: Correccion; evidencia: Evidencia[]; sustentado: boolean }
export interface FilaMatriz {
  clave: string;
  etiqueta: string;
  nombres: string[];
  reglaId?: string;
  celdas: Celda[];
  estado: 'coincide' | 'difiere' | 'uno' | 'ausente';
  nota: string;
  reglaResultado?: string;
}

const FILAS: { clave: string; etiqueta: string; nombres: string[]; reglaId?: string; tipo: 'texto' | 'nombre' | 'numero' }[] = [
  { clave: 'titular', etiqueta: 'Titular o propietario', nombres: ['titular', 'contribuyente', 'solicitante', 'propietario'], reglaId: 'X2', tipo: 'nombre' },
  { clave: 'direccion', etiqueta: 'Dirección', nombres: ['direccion'], reglaId: 'X1', tipo: 'texto' },
  { clave: 'calle', etiqueta: 'Calle', nombres: ['calle'], reglaId: 'X1', tipo: 'texto' },
  { clave: 'numero_exterior', etiqueta: 'Número exterior', nombres: ['numero_exterior'], reglaId: 'X1', tipo: 'texto' },
  { clave: 'numero_oficial', etiqueta: 'Número oficial asignado', nombres: ['numero_oficial'], reglaId: 'X4', tipo: 'texto' },
  { clave: 'colonia', etiqueta: 'Colonia', nombres: ['colonia'], reglaId: 'X1', tipo: 'texto' },
  { clave: 'municipio', etiqueta: 'Municipio', nombres: ['municipio'], reglaId: 'X8', tipo: 'texto' },
  { clave: 'lote_manzana', etiqueta: 'Lote y manzana', nombres: ['lote_manzana'], tipo: 'texto' },
  { clave: 'clave_catastral', etiqueta: 'Clave catastral o cuenta predial', nombres: ['clave_catastral', 'cuenta_predial'], reglaId: 'X5', tipo: 'texto' },
  { clave: 'superficie_terreno', etiqueta: 'Superficie del terreno (m²)', nombres: ['superficie_terreno_m2', 'superficie_m2'], reglaId: 'X3', tipo: 'numero' },
  { clave: 'superficie_construccion', etiqueta: 'Superficie de construcción (m²)', nombres: ['superficie_construccion_m2'], tipo: 'numero' },
];

export function matriz(d: Dictamen, correcciones: Correccion[], toleranciaPct: number): FilaMatriz[] {
  const docs = d.documentos;
  const filas: FilaMatriz[] = [];
  for (const f of FILAS) {
    const celdas: Celda[] = docs.map((doc) => {
      const x = f.nombres.map((n) => dato(d, doc.id, n)).find((y) => y);
      const corr = correcciones.find((c) => c.documento === doc.id && f.nombres.includes(c.nombre));
      return { documento: doc.id, auto: x?.valor ?? null, valor: corr ? corr.valorCorregido : x?.valor ?? null,
        correccion: corr, evidencia: x?.evidencia ?? [], sustentado: x?.sustentado ?? true };
    });
    const presentes = celdas.filter((c) => c.valor);
    if (!celdas.some((c) => c.auto !== null || c.correccion) && !presentes.length) continue;
    let estado: FilaMatriz['estado'];
    let nota = '';
    if (!presentes.length) { estado = 'ausente'; nota = 'Ningún documento lo indica.'; }
    else if (presentes.length === 1) { estado = 'uno'; nota = 'Solo un documento lo indica; no hay con qué comparar.'; }
    else {
      const vals = presentes.map((c) => c.valor!);
      let iguales: boolean;
      if (f.tipo === 'numero') {
        const ns = vals.map(numero).filter((n): n is number => n !== null);
        const max = Math.max(...ns), min = Math.min(...ns);
        const pct = max ? ((max - min) / max) * 100 : 0;
        iguales = pct <= toleranciaPct;
        nota = pct ? `Diferencia de ${pct.toFixed(1)} % (tolerancia ${toleranciaPct} %).` : 'Mismo valor.';
      } else if (f.tipo === 'nombre') {
        iguales = vals.every((v) => mismoNombre(v, vals[0]));
        nota = iguales ? 'Mismo nombre al ignorar mayúsculas, acentos y partículas.' : 'Los nombres no coinciden.';
      } else {
        // En colonia y calle, el tipo de vialidad o asentamiento («colonia», «calle») no distingue.
        const quitar = f.clave === 'colonia' ? /^(colonia|fraccionamiento|barrio|unidad) /
          : f.clave === 'calle' ? /^calle / : null;
        const n = (v: string) => (quitar ? normalizar(v).replace(quitar, '') : normalizar(v));
        iguales = vals.every((v) => n(v) === n(vals[0]));
        nota = iguales ? 'Coincide al expandir abreviaturas y quitar acentos.' : 'Los valores no coinciden.';
      }
      estado = iguales ? 'coincide' : 'difiere';
      const faltan = celdas.length - presentes.length;
      if (faltan) nota += ` Ausente en ${faltan} documento${faltan > 1 ? 's' : ''}.`;
    }
    if (celdas.some((c) => c.correccion)) nota += ' Incluye una corrección humana.';
    const reglaResultado = f.reglaId ? d.validaciones.find((v) => v.reglaId === f.reglaId)?.resultado : undefined;
    filas.push({ clave: f.clave, etiqueta: f.etiqueta, nombres: f.nombres, reglaId: f.reglaId, celdas, estado, nota, reglaResultado });
  }
  return filas;
}

// ---------------------------------------------------------------- simulación de reglas

export interface Simulacion {
  real: Recomendacion;
  base: Recomendacion;
  simulada: Recomendacion;
  cambios: { reglaId: string; nombre: string; antes: string; despues: string }[];
}

function efectosDe(d: Dictamen, efectos: Record<string, Efecto>, p: Parametros): Map<string, Efecto | null> {
  const r = new Map<string, Efecto | null>();
  for (const v of d.validaciones) {
    if (!v.reglaId) continue;
    let resultado = v.resultado;
    if (v.reglaId === 'X3') {
      const ns = d.documentos.map((doc) => numero(dato(d, doc.id, 'superficie_terreno_m2')?.valor)).filter((n): n is number => n !== null);
      if (ns.length >= 2) {
        const max = Math.max(...ns), min = Math.min(...ns);
        resultado = ((max - min) / max) * 100 <= p.toleranciaSuperficiePct ? 'cumple' : 'no_cumple';
      }
    }
    const efecto: Efecto | null = resultado === 'cumple' ? null
      : resultado === 'no_cumple' ? (efectos[v.reglaId] ?? regla(v.reglaId)?.efecto ?? 'Requiere revisión')
      : 'Requiere revisión';
    const previo = r.get(v.reglaId);
    if (previo === undefined || peso(efecto) > peso(previo)) r.set(v.reglaId, efecto);
  }
  return r;
}

function peso(e: Efecto | null | undefined): number {
  return e === 'No cumple' ? 3 : e === 'Requiere revisión' ? 2 : e === 'Informativo' ? 1 : 0;
}

function recomendacionDe(m: Map<string, Efecto | null>): Recomendacion {
  const vals = [...m.values()];
  if (vals.includes('No cumple')) return 'No cumple';
  if (vals.includes('Requiere revisión')) return 'Requiere revisión';
  return 'Cumple';
}

export function simular(d: Dictamen, publicadas: { efectos: Record<string, Efecto>; parametros: Parametros },
  borrador: { efectos: Record<string, Efecto>; parametros: Parametros }): Simulacion {
  const antes = efectosDe(d, publicadas.efectos, publicadas.parametros);
  const despues = efectosDe(d, borrador.efectos, borrador.parametros);
  const cambios: Simulacion['cambios'] = [];
  for (const [id, a] of antes) {
    const b = despues.get(id) ?? null;
    if (a !== b) cambios.push({ reglaId: id, nombre: regla(id)?.nombre ?? id, antes: a ?? 'Cumple', despues: b ?? 'Cumple' });
  }
  return { real: d.recomendacion, base: recomendacionDe(antes), simulada: recomendacionDe(despues), cambios };
}
