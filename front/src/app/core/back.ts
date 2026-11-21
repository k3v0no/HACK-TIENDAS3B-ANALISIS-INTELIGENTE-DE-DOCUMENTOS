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

export interface CampoBack { nombre: string; valor: string | null; confianza: number; evidencia: EvidenciaBack[] }
export interface PaginaBack { numero: number; ancho: number; alto: number; confianza_ocr: number | null }

export interface DocumentoBack {
  id: string;
  archivo: string;
  tipo: TipoBack;
  paginas: PaginaBack[];
  campos: CampoBack[];
}

export interface DictamenBack {
  recomendacion: 'Cumple' | 'Requiere revisión' | 'No cumple';
  confianza: number;
  resumen: string;
  faltantes: TipoBack[];
  requisitos: { nombre: string; cumple: boolean | null; detalle: string; documento_id: string | null; evidencia: EvidenciaBack[] }[];
  validaciones_cruzadas: {
    regla: string;
    estado: 'ok' | 'discrepancia' | 'no_evaluable';
    detalle: string;
    valores: { documento_id: string; valor: string | null; evidencia: EvidenciaBack[] }[];
  }[];
  hallazgos: {
    severidad: 'alta' | 'media' | 'baja';
    titulo: string;
    explicacion: string;
    accion_sugerida: string | null;
    evidencia: EvidenciaBack[];
  }[];
}

export interface ExpedienteBack {
  id: string;
  estado: 'en_cola' | 'procesando' | 'listo' | 'error';
  etapa: string;
  error: string | null;
  documentos: DocumentoBack[];
  dictamen: DictamenBack | null;
}
