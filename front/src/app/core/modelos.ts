// Tipos y constantes compartidos por todo el front.

export const TIPOS_DOCUMENTO = [
  'Escrituras',
  'Predial',
  'Alineamiento y Número Oficial',
  'Uso de Suelo',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/** Icono, qué es y para qué sirve cada documento, en el orden del expediente. */
export const DOC: Record<TipoDocumento, { icono: string; corto: string; que: string; paraQue: string }> = {
  Escrituras: {
    icono: 'history_edu', corto: 'Escrituras', que: 'Escritura pública del inmueble',
    paraQue: 'Acredita quién es el propietario, dónde está el inmueble y su superficie.',
  },
  Predial: {
    icono: 'receipt_long', corto: 'Predial', que: 'Boleta o recibo de predial más reciente',
    paraQue: 'Muestra el contribuyente, la clave catastral y la superficie registrada.',
  },
  'Alineamiento y Número Oficial': {
    icono: 'signpost', corto: 'Alineamiento', que: 'Constancia expedida por el municipio',
    paraQue: 'Confirma el número oficial y si hay restricciones viales.',
  },
  'Uso de Suelo': {
    icono: 'storefront', corto: 'Uso de suelo', que: 'Licencia o constancia de uso de suelo',
    paraQue: 'Indica si en el inmueble se puede operar una tienda y con qué condiciones.',
  },
};

export type Recomendacion = 'Cumple' | 'Requiere revisión' | 'No cumple';
export type Resultado = 'cumple' | 'no_cumple' | 'revisar';
export const UMBRAL_LECTURA = 0.7;

// ---------------------------------------------------------------- dictamen (forma del front)

export interface Evidencia {
  documento: string;
  pagina: number;
  linea: string;
  texto: string;
  confianza: number;
  caja?: [number, number, number, number]; // normalizada de 0 a 1 sobre la imagen de la página
}

export interface Documento {
  id: string;
  tipo: TipoDocumento | 'Desconocido';
  archivo: string;
  paginas: number;
  confianzaOcr: number;
  backId: string; // id del expediente en el back, para pedir la imagen de página
}

export interface Dato { campo: string; valor: string | null; evidencia: Evidencia[] }

export interface Validacion {
  id: string;
  nombre: string;
  documento: string | null;
  resultado: Resultado;
  detalle: string;
  evidencia: Evidencia[];
}

export interface Inconsistencia {
  id: string;
  campo: string;
  explicacion: string;
  accionSugerida: string;
  valores: { documento: string; valor: string; evidencia: Evidencia[] }[];
  diferenciaPct?: number;
}

export interface Hallazgo {
  id: string;
  severidad: 'alta' | 'media' | 'baja';
  titulo: string;
  explicacion: string;
  accionSugerida: string | null;
  evidencia: Evidencia[];
}

export interface AlertaLectura { documento: string; pagina: number; confianza: number; mensaje: string }

export interface Dictamen {
  inmueble: string;
  fechaAnalisis: string;
  recomendacion: Recomendacion;
  confianza: number;
  resumen: string;
  documentos: Documento[];
  faltantes: string[];
  datos: Record<string, Dato[]>;
  validaciones: Validacion[];
  inconsistencias: Inconsistencia[];
  hallazgos: Hallazgo[];
  alertas: AlertaLectura[];
}

// ---------------------------------------------------------------- expediente (registro local)

export type EstadoBack = 'en_cola' | 'procesando' | 'listo' | 'error';

export interface ArchivoRecibido { tipo: TipoDocumento; nombre: string; tamano: number }

export interface Expediente {
  id: string;
  origen: 'arrendador' | '3b';
  cuenta: string;
  fecha: string;
  archivos: ArchivoRecibido[];
  back?: {
    id: string;
    estado: EstadoBack;
    etapa: string;
    error: string | null;
    declarados: Record<string, TipoDocumento>; // id de documento del back -> tipo declarado
  };
  dictamen?: Dictamen;
  decision?: { valor: 'aprobado' | 'rechazado'; por: string; fecha: string };
}

export type EstadoBandeja = 'Sin analizar' | 'Analizando' | Recomendacion;
