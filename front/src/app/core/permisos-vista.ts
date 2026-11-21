import { Dictamen } from './modelos';

export function contarHallazgos(d: Dictamen): number {
  return d.hallazgos.length || d.inconsistencias.length + d.validaciones.filter((v) => v.resultado !== 'cumple').length;
}
