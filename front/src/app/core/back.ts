// Contrato JSON del back (copia de back/app/schemas.py). Si el back lo cambia, se ajusta aquí
// y en traduccion.ts; el resto del front no se entera.

export type TipoBack = 'escrituras' | 'predial' | 'alineamiento_numero_oficial' | 'uso_de_suelo' | 'desconocido';

export interface EvidenciaBack {
  documento_id: string;
  pagina: number;
  linea_id: string;
  texto: string;
  caja: number[]; // [x0, y0, x1, y1] en píxeles de la imagen de la página
}

export interface CampoBack {
  nombre: string;
  etiqueta?: string;
  valor: string | null;
  confianza: number;
  sustentado?: boolean;
  evidencia: EvidenciaBack[];
}
export interface PaginaBack { numero: number; ancho: number; alto: number; confianza_ocr: number | null }

export interface DocumentoBack {
  id: string;
  archivo: string;
  tipo: TipoBack;
  tipo_detectado?: string | null; // qué parece ser, si no es ninguno de los cuatro
  legible?: boolean;
  confianza_ocr?: number | null;
  observaciones?: string[];
  paginas: PaginaBack[];
  campos: CampoBack[];
}

export interface DictamenBack {
  recomendacion: 'Cumple' | 'Requiere revisión' | 'No cumple';
  confianza: number;
  nivel_confianza?: 'alto' | 'medio' | 'bajo';
  fecha_referencia?: string;
  resumen: string;
  faltantes: TipoBack[];
  requisitos: { regla_id?: string; efecto?: string; nombre: string; cumple: boolean | null; detalle: string; documento_id: string | null; evidencia: EvidenciaBack[] }[];
  validaciones_cruzadas: {
    regla_id?: string;
    regla: string;
    estado: 'ok' | 'discrepancia' | 'no_evaluable';
    detalle: string;
    valores: { documento_id: string; valor: string | null; evidencia: EvidenciaBack[] }[];
  }[];
  hallazgos: {
    regla_id?: string;
    severidad: 'alta' | 'media' | 'baja';
    titulo: string;
    explicacion: string;
    accion_sugerida: string | null;
    evidencia: EvidenciaBack[];
  }[];
}

/** Fila de GET /expedientes: sin documentos ni dictamen. */
export interface ResumenBack {
  id: string;
  estado: 'en_cola' | 'procesando' | 'listo' | 'error';
  creado: string;
  origen: string | null;
  cuenta: string | null;
  titulo: string;
  recomendacion: 'Cumple' | 'Requiere revisión' | 'No cumple' | null;
  documentos: number;
}

export interface ExpedienteBack {
  id: string;
  estado: 'en_cola' | 'procesando' | 'listo' | 'error';
  etapa: string;
  error: string | null;
  creado?: string;
  origen?: string | null;
  cuenta?: string | null;
  documentos: DocumentoBack[];
  dictamen: DictamenBack | null;
}
