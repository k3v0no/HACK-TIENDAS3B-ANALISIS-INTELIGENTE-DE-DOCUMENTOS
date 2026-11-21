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

const NOMBRE_CAMPO: Record<string, string> = {
  propietario: 'Propietario', titular: 'Titular', contribuyente: 'Contribuyente',
  direccion: 'Dirección', direccion_oficial: 'Dirección oficial',
  superficie_m2: 'Superficie (m²)', superficie: 'Superficie',
  cuenta_predial: 'Cuenta predial', clave_catastral: 'Clave catastral',
  numero_oficial: 'Número oficial', identificador: 'Identificador del inmueble',
  alineamiento: 'Alineamiento', vigencia: 'Vigencia', fecha_emision: 'Fecha de emisión',
  autoridad_emisora: 'Autoridad emisora', uso_autorizado: 'Uso autorizado',
  compatibilidad_comercial: 'Compatibilidad con uso comercial', restricciones: 'Restricciones',
};
const ORDEN_SEVERIDAD = { alta: 0, media: 1, baja: 2 } as const;

function nombreCampo(nombre: string): string {
  if (NOMBRE_CAMPO[nombre]) return NOMBRE_CAMPO[nombre];
  const t = nombre.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function numero(valor: string | null): number | null {
  const n = parseFloat((valor ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function promedio(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
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
        id: `tipo-${doc.id}`, nombre: 'Tipo de documento', documento: doc.id, resultado: 'revisar', evidencia: [],
        detalle: `Se subió como ${declarado.toLowerCase()}, pero el contenido parece de ${clasificado.toLowerCase()}. ` +
          'Confirma que sea el documento correcto.',
      });
    }
    const confs = doc.paginas.map((p) => p.confianza_ocr).filter((c): c is number => c !== null);
    documentos.push({
      id: doc.id, tipo: clasificado ?? declarado ?? 'Desconocido', archivo: doc.archivo,
      paginas: doc.paginas.length, confianzaOcr: promedio(confs), backId: exp.id,
    });
    datos[doc.id] = doc.campos.map((c) => ({
      campo: nombreCampo(c.nombre), valor: c.valor, evidencia: c.evidencia.map(ev),
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
    id: `req-${i}`, nombre: r.nombre, documento: r.documento_id,
    resultado: r.cumple === true ? 'cumple' : r.cumple === false ? 'no_cumple' : 'revisar',
    detalle: r.detalle, evidencia: r.evidencia.map(ev),
  }));

  const inconsistencias: Inconsistencia[] = [];
  d.validaciones_cruzadas.forEach((vc, i) => {
    if (vc.estado !== 'discrepancia') {
      validaciones.push({
        id: `cruz-${i}`, nombre: vc.regla, documento: null,
        resultado: vc.estado === 'ok' ? 'cumple' : 'revisar', detalle: vc.detalle,
        evidencia: vc.valores.flatMap((v) => v.evidencia.map(ev)),
      });
      return;
    }
    const campo = vc.regla.split(/\s+coincide/)[0];
    const inc: Inconsistencia = {
      id: `cruz-${i}`, campo, explicacion: vc.detalle,
      accionSugerida: 'Compara los documentos y pide la aclaración al arrendador.',
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
    .map((h, i) => ({ id: `hal-${i}`, severidad: h.severidad, titulo: h.titulo, explicacion: h.explicacion,
      accionSugerida: h.accion_sugerida, evidencia: h.evidencia.map(ev) }))
    .sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);

  let inmueble = '';
  for (const doc of [...exp.documentos].sort((a, b) => Number(a.tipo !== 'escrituras') - Number(b.tipo !== 'escrituras'))) {
    const c = doc.campos.find((c) => c.nombre.startsWith('direccion') && c.valor);
    if (c?.valor) { inmueble = c.valor; break; }
  }

  return {
    inmueble, fechaAnalisis: new Date().toISOString(), recomendacion: d.recomendacion, confianza: d.confianza,
    resumen: d.resumen, documentos, faltantes: d.faltantes.map((t) => TIPO_BACK[t] ?? t), datos,
    validaciones, inconsistencias, hallazgos, alertas,
  };
}
