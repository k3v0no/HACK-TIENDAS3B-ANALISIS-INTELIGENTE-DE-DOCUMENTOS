// Catálogo de reglas: copia de back/app/reglas.py (mismos identificadores, nombres, efectos y
// tolerancias). El back no expone todavía una ruta para leerlas ni para recibir cambios, así que
// si el equipo cambia el catálogo en el back, hay que reflejarlo aquí.
import { Efecto } from './modelos';

export type Grupo = 'Generales' | 'Escrituras' | 'Predial' | 'Alineamiento y Número Oficial' | 'Uso de Suelo' | 'Validaciones cruzadas';
export type Causa = 'Identidad del inmueble' | 'Titularidad' | 'Superficie' | 'Vigencia' | 'Uso autorizado' | 'Documentación';

export interface Regla {
  id: string;
  nombre: string;
  efecto: Efecto; // qué recomendación provoca si no se cumple
  grupo: Grupo;
  causa: Causa;
  fuente: string;
}

const GUIA = 'Guía de criterios del comité del reto';
const EQUIPO = 'Criterio del equipo (pendiente de validar con el comité)';

export const REGLAS: Regla[] = [
  { id: 'G1', nombre: 'El documento se identifica como uno de los cuatro tipos esperados', efecto: 'Requiere revisión', grupo: 'Generales', causa: 'Documentación', fuente: GUIA },
  { id: 'G2', nombre: 'El documento es legible', efecto: 'Requiere revisión', grupo: 'Generales', causa: 'Documentación', fuente: GUIA },
  { id: 'G5', nombre: 'Los datos extraídos están sustentados en el texto del documento', efecto: 'Requiere revisión', grupo: 'Generales', causa: 'Documentación', fuente: EQUIPO },
  { id: 'E1', nombre: 'Escrituras: constan titular, dirección, identificación del inmueble y superficie', efecto: 'Requiere revisión', grupo: 'Escrituras', causa: 'Documentación', fuente: GUIA },
  { id: 'E2', nombre: 'Escrituras: el acto transmite la propiedad', efecto: 'Requiere revisión', grupo: 'Escrituras', causa: 'Titularidad', fuente: GUIA },
  { id: 'E4', nombre: 'Escrituras: constan número de instrumento, fecha y notario', efecto: 'Requiere revisión', grupo: 'Escrituras', causa: 'Documentación', fuente: GUIA },
  { id: 'E5', nombre: 'Escrituras: consta la inscripción en el Registro Público de la Propiedad', efecto: 'Requiere revisión', grupo: 'Escrituras', causa: 'Titularidad', fuente: GUIA },
  { id: 'E6', nombre: 'Escrituras: el inmueble está libre de gravámenes y limitaciones', efecto: 'Requiere revisión', grupo: 'Escrituras', causa: 'Titularidad', fuente: GUIA },
  { id: 'P1', nombre: 'Predial: constan contribuyente, dirección y cuenta o clave catastral', efecto: 'Requiere revisión', grupo: 'Predial', causa: 'Documentación', fuente: GUIA },
  { id: 'P2', nombre: 'Predial: corresponde al ejercicio fiscal en curso', efecto: 'No cumple', grupo: 'Predial', causa: 'Vigencia', fuente: GUIA },
  { id: 'P3', nombre: 'Predial: no presenta adeudos', efecto: 'Requiere revisión', grupo: 'Predial', causa: 'Documentación', fuente: GUIA },
  { id: 'A1', nombre: 'Alineamiento: constan dirección oficial, número oficial, identificación del predio y autoridad', efecto: 'Requiere revisión', grupo: 'Alineamiento y Número Oficial', causa: 'Documentación', fuente: GUIA },
  { id: 'A2', nombre: 'Alineamiento y número oficial: está vigente', efecto: 'No cumple', grupo: 'Alineamiento y Número Oficial', causa: 'Vigencia', fuente: GUIA },
  { id: 'A3', nombre: 'Alineamiento: constan folio y firma o sello de la autoridad', efecto: 'Requiere revisión', grupo: 'Alineamiento y Número Oficial', causa: 'Documentación', fuente: GUIA },
  { id: 'A4', nombre: 'Alineamiento: el predio no tiene afectaciones ni restricciones', efecto: 'Requiere revisión', grupo: 'Alineamiento y Número Oficial', causa: 'Uso autorizado', fuente: GUIA },
  { id: 'U1', nombre: 'Uso de suelo: constan dirección, uso autorizado y autoridad emisora', efecto: 'Requiere revisión', grupo: 'Uso de Suelo', causa: 'Uso autorizado', fuente: GUIA },
  { id: 'U2', nombre: 'Uso de suelo: autoriza el uso comercial requerido (minisúper o tienda de autoservicio)', efecto: 'No cumple', grupo: 'Uso de Suelo', causa: 'Uso autorizado', fuente: GUIA },
  { id: 'U3', nombre: 'Uso de suelo: está vigente', efecto: 'No cumple', grupo: 'Uso de Suelo', causa: 'Vigencia', fuente: GUIA },
  { id: 'U4', nombre: 'Uso de suelo: no impone condicionantes ni restricciones', efecto: 'Requiere revisión', grupo: 'Uso de Suelo', causa: 'Uso autorizado', fuente: GUIA },
  { id: 'U6', nombre: 'Uso de suelo: constan folio y firma o sello de la autoridad', efecto: 'Requiere revisión', grupo: 'Uso de Suelo', causa: 'Documentación', fuente: GUIA },
  { id: 'X1', nombre: 'La dirección coincide entre los documentos', efecto: 'Requiere revisión', grupo: 'Validaciones cruzadas', causa: 'Identidad del inmueble', fuente: GUIA },
  { id: 'X2', nombre: 'El propietario o titular coincide entre los documentos', efecto: 'Requiere revisión', grupo: 'Validaciones cruzadas', causa: 'Titularidad', fuente: GUIA },
  { id: 'X3', nombre: 'La superficie del terreno coincide entre los documentos', efecto: 'Requiere revisión', grupo: 'Validaciones cruzadas', causa: 'Superficie', fuente: GUIA },
  { id: 'X4', nombre: 'El número oficial coincide con la dirección de los demás documentos', efecto: 'Requiere revisión', grupo: 'Validaciones cruzadas', causa: 'Identidad del inmueble', fuente: GUIA },
  { id: 'X5', nombre: 'La clave catastral o cuenta predial coincide entre los documentos', efecto: 'Requiere revisión', grupo: 'Validaciones cruzadas', causa: 'Identidad del inmueble', fuente: GUIA },
  { id: 'X6', nombre: 'Los documentos corresponden al mismo inmueble', efecto: 'No cumple', grupo: 'Validaciones cruzadas', causa: 'Identidad del inmueble', fuente: GUIA },
  { id: 'X7', nombre: 'El expediente incluye los cuatro tipos de documento', efecto: 'Requiere revisión', grupo: 'Validaciones cruzadas', causa: 'Documentación', fuente: GUIA },
  { id: 'X8', nombre: 'El municipio de las autoridades emisoras coincide con el del inmueble', efecto: 'Requiere revisión', grupo: 'Validaciones cruzadas', causa: 'Identidad del inmueble', fuente: EQUIPO },
];

export const GRUPOS: Grupo[] = ['Generales', 'Escrituras', 'Predial', 'Alineamiento y Número Oficial', 'Uso de Suelo', 'Validaciones cruzadas'];
export const CAUSAS: Causa[] = ['Identidad del inmueble', 'Titularidad', 'Superficie', 'Vigencia', 'Uso autorizado', 'Documentación'];

export interface Parametros {
  toleranciaSuperficiePct: number; // diferencia de superficie aceptada, en % del valor mayor
  confianzaMinimaLegible: number; // de 0 a 1
  mesesSinVigenciaExpresa: number;
  diasAvisoVencimiento: number; // «próximo a vencer» para el gestor
}

export const PARAMETROS_BASE: Parametros = {
  toleranciaSuperficiePct: 2, confianzaMinimaLegible: 0.75, mesesSinVigenciaExpresa: 12, diasAvisoVencimiento: 60,
};

export const PARAMETRO_INFO: Record<keyof Parametros, { nombre: string; unidad: string; ayuda: string; enBack: boolean }> = {
  toleranciaSuperficiePct: { nombre: 'Tolerancia de superficie', unidad: '%', enBack: true,
    ayuda: 'Diferencia máxima entre superficies de terreno que no se marca como discrepancia (regla X3).' },
  confianzaMinimaLegible: { nombre: 'Confianza mínima de lectura', unidad: '', enBack: true,
    ayuda: 'Por debajo de este valor el documento se considera ilegible (regla G2).' },
  mesesSinVigenciaExpresa: { nombre: 'Antigüedad máxima sin vigencia expresa', unidad: 'meses', enBack: true,
    ayuda: 'Documentos sin fecha de vencimiento se piden revisar después de este plazo.' },
  diasAvisoVencimiento: { nombre: 'Aviso de vencimiento próximo', unidad: 'días', enBack: false,
    ayuda: 'Días antes del vencimiento en que el gestor ve el permiso como «próximo a vencer».' },
};

export function regla(id: string): Regla | undefined {
  return REGLAS.find((r) => r.id === id);
}

export function causaDe(reglaId: string): Causa {
  return regla(reglaId)?.causa ?? (reglaId === 'X' ? 'Documentación' : 'Documentación');
}
