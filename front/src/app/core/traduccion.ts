// Traduce la respuesta del back (back/app/schemas.py) a la forma que usan las vistas.
import { EvidenciaBack, ExpedienteBack, PaginaBack, TipoBack } from './back';
import {
  AlertaLectura, Dato, Dictamen, Documento, Evidencia, Hallazgo, Inconsistencia, TipoDocumento,
  UMBRAL_LECTURA, Validacion,
} from './modelos';

export const TIPO_BACK: Partial<Record<TipoBack, TipoDocumento>> = {
  escrituras: 'Escrituras',
  predial: 'Predial',
  alineamiento_numero_oficial: 'Alineamiento y Número Oficial',
  uso_de_suelo: 'Uso de Suelo',
};

// Por si el back no manda la etiqueta (versiones anteriores).
const NOMBRE_CAMPO: Record<string, string> = {
  propietario: 'Propietario', titular: 'Propietario o titular', contribuyente: 'Propietario o contribuyente',
  direccion: 'Dirección', superficie_m2: 'Superficie (m²)', superficie_terreno_m2: 'Superficie del terreno (m²)',
  cuenta_predial: 'Cuenta predial', clave_catastral: 'Clave catastral o cuenta predial',
  numero_oficial: 'Número oficial asignado', vigencia: 'Vigencia', vigencia_hasta: 'Vigente hasta',
  autoridad_emisora: 'Autoridad emisora', uso_autorizado: 'Uso de suelo autorizado',
};
const ORDEN_SEVERIDAD = { alta: 0, media: 1, baja: 2 } as const;

function nombreCampo(nombre: string, etiqueta?: string): string {
  if (etiqueta) return etiqueta;
  if (NOMBRE_CAMPO[nombre]) return NOMBRE_CAMPO[nombre];
  const t = nombre.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function numero(valor: string | null): number | null {
  const n = parseFloat((valor ?? '').replace(/,/g, '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function promedio(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Identificador estable de un hallazgo entre corridas: regla + título. */
export function idHallazgo(reglaId: string, titulo: string): string {
  const base = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  return `${reglaId || 'h'}:${base.slice(0, 60)}`;
}

export function traducir(exp: ExpedienteBack, declarados: Record<string, TipoDocumento>): Dictamen {
  const d = exp.dictamen!;
  const paginas = new Map<string, PaginaBack>();
  for (const doc of exp.documentos) for (const p of doc.paginas) paginas.set(`${doc.id}#${p.numero}`, p);

  const ev = (e: EvidenciaBack): Evidencia => {
    const p = paginas.get(`${e.documento_id}#${e.pagina}`);
    const salida: Evidencia = {
      documento: e.documento_id, pagina: e.pagina, linea: e.linea_id, texto: e.texto,
      confianza: p?.confianza_ocr ?? 1,
    };
    if (p?.ancho && p?.alto && e.caja?.length === 4) {
      const [x0, y0, x1, y1] = e.caja;
      salida.caja = [x0 / p.ancho, y0 / p.alto, x1 / p.ancho, y1 / p.alto];
    }
    return salida;
  };

  const documentos: Documento[] = [];
  const datos: Record<string, Dato[]> = {};
  const alertas: AlertaLectura[] = [];
  const validaciones: Validacion[] = [];

  for (const doc of exp.documentos) {
    const declarado = declarados[doc.id];
    const clasificado = TIPO_BACK[doc.tipo];
    if (clasificado && declarado && clasificado !== declarado) {
      validaciones.push({
        id: `tipo-${doc.id}`, reglaId: 'G1', nombre: 'Tipo de documento', documento: doc.id, resultado: 'revisar',
        efecto: 'Requiere revisión', evidencia: [], cruzada: false,
        detalle: `Se subió como ${declarado.toLowerCase()}, pero el contenido parece de ${clasificado.toLowerCase()}. ` +
          'Confirma que sea el documento correcto.',
      });
    }
    const confs = doc.paginas.map((p) => p.confianza_ocr).filter((c): c is number => c !== null);
    documentos.push({
      id: doc.id, tipo: clasificado ?? declarado ?? 'Desconocido', archivo: doc.archivo,
      paginas: doc.paginas.length, confianzaOcr: doc.confianza_ocr ?? promedio(confs), backId: exp.id,
      legible: doc.legible ?? true, observaciones: doc.observaciones ?? [],
    });
    datos[doc.id] = doc.campos.map((c) => ({
      nombre: c.nombre, campo: nombreCampo(c.nombre, c.etiqueta), valor: c.valor, sustentado: c.sustentado ?? true,
      confianza: c.confianza, evidencia: c.evidencia.map(ev),
    }));
    for (const p of doc.paginas) {
      if (p.confianza_ocr === null) {
        alertas.push({ documento: doc.id, pagina: p.numero, confianza: 0,
          mensaje: 'No se encontró texto en esta página. Revisa que la imagen sea legible.' });
      } else if (p.confianza_ocr < UMBRAL_LECTURA) {
        alertas.push({ documento: doc.id, pagina: p.numero, confianza: p.confianza_ocr,
          mensaje: 'Revisa esta página en el documento original antes de confiar en los datos que salen de ella.' });
      }
    }
  }

  d.requisitos.forEach((r, i) => validaciones.push({
    id: `req-${r.regla_id || i}`, reglaId: r.regla_id ?? '', nombre: r.nombre, documento: r.documento_id,
    resultado: r.cumple === true ? 'cumple' : r.cumple === false ? 'no_cumple' : 'revisar',
    efecto: r.efecto ?? '', detalle: r.detalle, evidencia: r.evidencia.map(ev), cruzada: false,
  }));

  const inconsistencias: Inconsistencia[] = [];
  d.validaciones_cruzadas.forEach((vc, i) => {
    const evidencia = vc.valores.flatMap((v) => v.evidencia.map(ev));
    validaciones.push({
      id: `cruz-${vc.regla_id || i}`, reglaId: vc.regla_id ?? '', nombre: vc.regla, documento: null,
      resultado: vc.estado === 'ok' ? 'cumple' : vc.estado === 'discrepancia' ? 'no_cumple' : 'revisar',
      efecto: '', detalle: vc.detalle, evidencia, cruzada: true,
    });
    if (vc.estado !== 'discrepancia') return;
    const campo = vc.regla.replace(/^(La|El|Los)\s+/i, '').split(/\s+(coincide|corresponden)/)[0];
    const inc: Inconsistencia = {
      id: `inc-${vc.regla_id || i}`, reglaId: vc.regla_id ?? '', campo: campo.charAt(0).toUpperCase() + campo.slice(1),
      explicacion: vc.detalle, accionSugerida: 'Compara los documentos y pide la aclaración al arrendador.',
      valores: vc.valores.map((v) => ({ documento: v.documento_id, valor: v.valor ?? 'No encontrado', evidencia: v.evidencia.map(ev) })),
    };
    const nums = vc.valores.map((v) => numero(v.valor));
    if (/superficie/i.test(campo) && nums.length >= 2 && nums.every((n) => n)) {
      const max = Math.max(...(nums as number[])), min = Math.min(...(nums as number[]));
      inc.diferenciaPct = Math.round(((max - min) / max) * 1000) / 10;
    }
    inconsistencias.push(inc);
  });

  const hallazgos: Hallazgo[] = d.hallazgos
    .map((h) => ({ id: idHallazgo(h.regla_id ?? '', h.titulo), reglaId: h.regla_id ?? '', severidad: h.severidad,
      titulo: h.titulo, explicacion: h.explicacion, accionSugerida: h.accion_sugerida, evidencia: h.evidencia.map(ev) }))
    .sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);

  // Dirección para el título: calle y número de la escritura (o del primer documento que la tenga).
  let inmueble = '';
  for (const doc of [...exp.documentos].sort((a, b) => Number(a.tipo !== 'escrituras') - Number(b.tipo !== 'escrituras'))) {
    const v = (n: string) => doc.campos.find((c) => c.nombre === n)?.valor;
    const viejo = doc.campos.find((c) => c.nombre.startsWith('direccion') && c.valor)?.valor;
    const calle = v('calle');
    if (calle) {
      inmueble = [calle, v('numero_exterior'), v('colonia') ? `col. ${v('colonia')}` : '', v('municipio')].filter(Boolean).join(', ')
        .replace(/, (\d)/, ' $1');
      break;
    }
    if (viejo) { inmueble = viejo; break; }
  }

  return {
    inmueble, fechaAnalisis: new Date().toISOString(), fechaReferencia: d.fecha_referencia || new Date().toISOString().slice(0, 10),
    recomendacion: d.recomendacion, confianza: d.confianza,
    nivelConfianza: d.nivel_confianza ?? (d.confianza >= 0.85 ? 'alto' : d.confianza >= 0.65 ? 'medio' : 'bajo'),
    resumen: d.resumen, documentos, faltantes: d.faltantes.map((t) => TIPO_BACK[t] ?? t), datos,
    validaciones, inconsistencias, hallazgos, alertas,
  };
}
