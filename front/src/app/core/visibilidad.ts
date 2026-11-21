// Qué partes del dictamen puede ver el perfil activo. Un dato sin permiso aparece oculto, y
// también los fragmentos citados que salen de ese dato (p. ej. el nombre del propietario).
import { inject, Injectable } from '@angular/core';
import { CuentasService } from './cuentas.service';
import { Dictamen, Evidencia } from './modelos';

const cache = new WeakMap<Dictamen, Map<string, string>>();

/** Mapa «documento#línea» → etiqueta del campo del que salió la cita. */
export function campoDeLinea(d: Dictamen): Map<string, string> {
  let m = cache.get(d);
  if (!m) {
    m = new Map();
    for (const [doc, datos] of Object.entries(d.datos)) {
      for (const x of datos) for (const ev of x.evidencia) m.set(`${doc}#${ev.linea}`, x.campo);
    }
    cache.set(d, m);
  }
  return m;
}

@Injectable({ providedIn: 'root' })
export class Visibilidad {
  private readonly cuentas = inject(CuentasService);
  readonly OCULTO = 'Oculto por permisos';

  campo(etiqueta: string): boolean {
    return this.cuentas.veCampo(etiqueta);
  }

  evidencia(d: Dictamen | undefined, ev: Evidencia): boolean {
    if (!d) return true;
    const campo = campoDeLinea(d).get(`${ev.documento}#${ev.linea}`);
    return !campo || this.campo(campo);
  }

  documentos(): boolean {
    return this.cuentas.puede('documentos.ver');
  }
}
