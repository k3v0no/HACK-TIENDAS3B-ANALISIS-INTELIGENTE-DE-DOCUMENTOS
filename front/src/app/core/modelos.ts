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

/** Uso previsto que se revisa en todos los expedientes del prototipo. */
export const USO_PREVISTO = 'Tienda de autoservicio (minisúper)';

export type Recomendacion = 'Cumple' | 'Requiere revisión' | 'No cumple';
export type Efecto = 'No cumple' | 'Requiere revisión' | 'Informativo';
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
  legible: boolean;
  observaciones: string[];
  backId: string; // id del expediente en el back, para pedir la imagen de página
}

export interface Dato {
  nombre: string; // identificador del back, p. ej. superficie_terreno_m2
  campo: string; // etiqueta legible
  valor: string | null;
  sustentado: boolean; // false si el verificador no encontró el valor en el texto citado
  confianza: number;
  evidencia: Evidencia[];
}

export interface Validacion {
  id: string;
  reglaId: string;
  nombre: string;
  documento: string | null;
  resultado: Resultado;
  efecto: string;
  detalle: string;
  evidencia: Evidencia[];
  cruzada: boolean;
}

export interface Inconsistencia {
  id: string;
  reglaId: string;
  campo: string;
  explicacion: string;
  accionSugerida: string;
  valores: { documento: string; valor: string; evidencia: Evidencia[] }[];
  diferenciaPct?: number;
}

export interface Hallazgo {
  id: string;
  reglaId: string;
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
  fechaReferencia: string; // contra la que se evaluaron las vigencias
  recomendacion: Recomendacion;
  confianza: number;
  nivelConfianza: 'alto' | 'medio' | 'bajo';
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

export interface ArchivoRecibido {
  tipo: TipoDocumento;
  nombre: string;
  tamano: number;
  version: number; // 1 = primera entrega de ese tipo
  vigente: boolean; // false si una versión posterior lo sustituyó
  fecha: string;
}

/** Una ejecución del análisis: qué archivos se analizaron y qué salió. */
export interface Corrida {
  n: number;
  fecha: string;
  backId: string;
  archivos: { tipo: TipoDocumento; nombre: string; version: number }[];
  reglasVersion: number;
  motivo: string; // primera revisión, documento nuevo, reintento...
  dictamen?: Dictamen;
}

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
  corridas: Corrida[];
  dictamen?: Dictamen; // el de la última corrida terminada
}

export type EstadoBandeja = 'Sin analizar' | 'Analizando' | Recomendacion;

// ---------------------------------------------------------------- flujo de trabajo entre roles

export type Area = 'Expansión' | 'Jurídico' | 'Trámites' | 'Arrendador' | 'Gerencia';
export type EstadoTarea = 'pendiente' | 'solicitado' | 'recibido' | 'en_verificacion' | 'resuelto';
export type TipoTarea = 'turnado' | 'solicitud_documento' | 'aclaracion' | 'derivacion';

export interface Nota { fecha: string; autor: string; texto: string }

export interface Tarea {
  id: string;
  exp: string;
  tipo: TipoTarea;
  area: Area;
  titulo: string;
  causa: string; // faltante, vencido, ilegible, otra unidad, discrepancia...
  hallazgo?: { id: string; titulo: string; reglaId: string };
  documento?: TipoDocumento;
  solicitud?: string; // texto editable que se envía al arrendador
  estado: EstadoTarea;
  creadoPor: string;
  fecha: string;
  seguimiento?: string; // fecha de seguimiento
  notas: Nota[];
}

export interface Correccion {
  id: string;
  exp: string;
  documento: string;
  nombre: string; // campo (id del back)
  campo: string; // etiqueta
  valorAuto: string | null;
  valorCorregido: string;
  motivo: string;
  autor: string;
  fecha: string;
  corrida: number;
}

export interface ValidacionJuridica {
  exp: string;
  hallazgo: string; // id estable del hallazgo
  titulo: string;
  estado: 'confirmado' | 'descartado';
  observacion: string;
  derivadoA?: Area;
  autor: string;
  fecha: string;
  corrida: number;
}

export interface DecisionNegocio {
  exp: string;
  valor: 'avanza' | 'espera' | 'descartado';
  motivo: string;
  autor: string;
  fecha: string;
  recomendacion: Recomendacion | null;
  corrida: number;
  validacionJuridica: string;
}

export interface Evento {
  id: string;
  exp: string | null; // null = evento global (p. ej. publicar reglas)
  fecha: string;
  actor: string; // nombre de la persona o «Sistema»
  perfil: string;
  tipo: 'carga' | 'version' | 'analisis' | 'resultado' | 'turnado' | 'solicitud' | 'tarea' | 'correccion'
    | 'validacion' | 'decision' | 'reglas' | 'exportacion';
  detalle: string;
}
