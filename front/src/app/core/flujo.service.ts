// Flujo de trabajo entre roles: tareas, solicitudes al arrendador, correcciones, validaciones
// jurídicas, decisiones de negocio, bitácora y versiones de reglas.
//
// Como el resto del prototipo, vive en el almacenamiento local del navegador. En producción
// serían tablas del back con permisos verificados en cada petición y bitácora inalterable.
import { Injectable, computed, inject, signal } from '@angular/core';
import { CuentasService } from './cuentas.service';
import {
  Area, Correccion, DecisionNegocio, EstadoTarea, Evento, Nota, Tarea, TipoDocumento, ValidacionJuridica,
} from './modelos';
import { Efecto } from './modelos';
import { PARAMETROS_BASE, Parametros, REGLAS } from './reglas-catalogo';

const LLAVE = 'tiendas3b.flujo.v1';

export interface VersionReglas {
  version: number;
  fecha: string;
  autor: string;
  motivo: string;
  fuente: string;
  cambios: string[];
  efectos: Record<string, Efecto>;
  parametros: Parametros;
}

interface Estado {
  tareas: Tarea[];
  correcciones: Correccion[];
  validaciones: ValidacionJuridica[];
  decisiones: DecisionNegocio[];
  eventos: Evento[];
  reglas: VersionReglas[]; // la última es la publicada
}

function inicial(): Estado {
  return {
    tareas: [], correcciones: [], validaciones: [], decisiones: [], eventos: [],
    reglas: [{
      version: 1, fecha: '2026-11-21T09:00:00.000Z', autor: 'Sistema', motivo: 'Catálogo inicial del back',
      fuente: 'back/app/reglas.py', cambios: [],
      efectos: Object.fromEntries(REGLAS.map((r) => [r.id, r.efecto])), parametros: { ...PARAMETROS_BASE },
    }],
  };
}

function id(): string {
  return crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '');
}

@Injectable({ providedIn: 'root' })
export class FlujoService {
  private readonly cuentas = inject(CuentasService);
  private readonly estado = signal<Estado>(this.leer());

  readonly tareas = computed(() => this.estado().tareas);
  readonly correcciones = computed(() => this.estado().correcciones);
  readonly validaciones = computed(() => this.estado().validaciones);
  readonly decisiones = computed(() => this.estado().decisiones);
  readonly eventos = computed(() => this.estado().eventos);
  readonly versionesReglas = computed(() => this.estado().reglas);
  readonly reglasVigentes = computed(() => this.estado().reglas[this.estado().reglas.length - 1]);

  private leer(): Estado {
    try {
      const v = localStorage.getItem(LLAVE);
      return v ? { ...inicial(), ...JSON.parse(v) } : inicial();
    } catch {
      return inicial();
    }
  }

  private cambiar(fn: (e: Estado) => void): void {
    const copia = structuredClone(this.estado());
    fn(copia);
    this.estado.set(copia);
    try { localStorage.setItem(LLAVE, JSON.stringify(copia)); } catch { /* sin almacenamiento */ }
  }

  /** Vuelve a leer (otra pestaña pudo cambiarlo). */
  refrescar(): void {
    this.estado.set(this.leer());
  }

  private quien(): { actor: string; perfil: string } {
    const c = this.cuentas.cuenta();
    return { actor: c?.nombre ?? 'Sistema', perfil: c?.perfil ?? 'Sistema' };
  }

  // ---------------------------------------------------------------- bitácora

  registrar(exp: string | null, tipo: Evento['tipo'], detalle: string, comoSistema = false): void {
    const q = comoSistema ? { actor: 'Sistema', perfil: 'Sistema' } : this.quien();
    this.cambiar((e) => e.eventos.push({ id: id(), exp, fecha: new Date().toISOString(), tipo, detalle, ...q }));
  }

  eventosDe(exp: string): Evento[] {
    return this.eventos().filter((e) => e.exp === exp).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // ---------------------------------------------------------------- tareas

  crearTarea(t: Omit<Tarea, 'id' | 'fecha' | 'creadoPor' | 'notas' | 'estado'> & { estado?: EstadoTarea; nota?: string }): Tarea {
    const q = this.quien();
    const nueva: Tarea = {
      ...t, id: id(), fecha: new Date().toISOString(), creadoPor: q.actor, estado: t.estado ?? 'pendiente',
      notas: t.nota ? [{ fecha: new Date().toISOString(), autor: q.actor, texto: t.nota }] : [],
    };
    delete (nueva as { nota?: string }).nota;
    this.cambiar((e) => e.tareas.push(nueva));
    const verbo = t.tipo === 'turnado' ? 'Turnó a' : t.tipo === 'solicitud_documento' ? 'Pidió un documento a' : 'Envió a';
    this.registrar(t.exp, t.tipo === 'solicitud_documento' ? 'solicitud' : 'turnado', `${verbo} ${t.area}: ${t.titulo}`);
    return nueva;
  }

  actualizarTarea(idTarea: string, cambios: Partial<Pick<Tarea, 'estado' | 'seguimiento' | 'solicitud' | 'area' | 'documento'>>, nota?: string): void {
    const q = this.quien();
    let tarea: Tarea | undefined;
    this.cambiar((e) => {
      tarea = e.tareas.find((t) => t.id === idTarea);
      if (!tarea) return;
      Object.assign(tarea, cambios);
      if (nota) tarea.notas.push({ fecha: new Date().toISOString(), autor: q.actor, texto: nota } as Nota);
    });
    if (tarea) {
      const partes = [cambios.estado ? `estado «${ETIQUETA_ESTADO[cambios.estado]}»` : '', cambios.area ? `turnada a ${cambios.area}` : '',
        cambios.seguimiento ? `seguimiento el ${cambios.seguimiento}` : '', cambios.documento ? `documento requerido: ${cambios.documento}` : '', nota ? `nota: ${nota}` : ''].filter(Boolean);
      this.registrar(tarea.exp, 'tarea', `${tarea.titulo}: ${partes.join(', ') || 'actualizada'}`);
    }
  }

  tareasDe(exp: string): Tarea[] {
    return this.tareas().filter((t) => t.exp === exp);
  }

  abiertas(exp?: string): Tarea[] {
    return this.tareas().filter((t) => t.estado !== 'resuelto' && (!exp || t.exp === exp));
  }

  /** Cuando el arrendador sube un documento, las solicitudes de ese tipo pasan a «recibido». */
  documentoRecibido(exp: string, tipo: TipoDocumento): void {
    const afectadas = this.tareas().filter((t) => t.exp === exp && t.documento === tipo && (t.estado === 'pendiente' || t.estado === 'solicitado'));
    if (!afectadas.length) return;
    this.cambiar((e) => e.tareas.filter((t) => afectadas.some((a) => a.id === t.id)).forEach((t) => {
      t.estado = 'recibido';
      t.notas.push({ fecha: new Date().toISOString(), autor: 'Sistema', texto: `El arrendador envió ${tipo.toLowerCase()}. El análisis dirá si resuelve el requisito.` });
    }));
    this.registrar(exp, 'tarea', `${afectadas.length} solicitud(es) de ${tipo.toLowerCase()} pasaron a «recibido»`, true);
  }

  /** Cuando termina un análisis, lo recibido pasa a «en verificación». */
  analisisTerminado(exp: string): void {
    const afectadas = this.tareas().filter((t) => t.exp === exp && t.estado === 'recibido');
    if (!afectadas.length) return;
    this.cambiar((e) => e.tareas.filter((t) => afectadas.some((a) => a.id === t.id)).forEach((t) => { t.estado = 'en_verificacion'; }));
  }

  // ---------------------------------------------------------------- jurídico

  corregir(c: Omit<Correccion, 'id' | 'autor' | 'fecha'>): void {
    const q = this.quien();
    this.cambiar((e) => {
      e.correcciones = e.correcciones.filter((x) => !(x.exp === c.exp && x.documento === c.documento && x.nombre === c.nombre));
      e.correcciones.push({ ...c, id: id(), autor: q.actor, fecha: new Date().toISOString() });
    });
    this.registrar(c.exp, 'correccion', `Corrigió «${c.campo}»: «${c.valorAuto ?? 'sin lectura'}» → «${c.valorCorregido}». Motivo: ${c.motivo}`);
  }

  quitarCorreccion(exp: string, documento: string, nombre: string): void {
    const c = this.correcciones().find((x) => x.exp === exp && x.documento === documento && x.nombre === nombre);
    if (!c) return;
    this.cambiar((e) => { e.correcciones = e.correcciones.filter((x) => x.id !== c.id); });
    this.registrar(exp, 'correccion', `Retiró la corrección de «${c.campo}»; vuelve a usarse la lectura automática`);
  }

  correccionesDe(exp: string): Correccion[] {
    return this.correcciones().filter((c) => c.exp === exp);
  }

  validar(v: Omit<ValidacionJuridica, 'autor' | 'fecha'>): void {
    const q = this.quien();
    this.cambiar((e) => {
      e.validaciones = e.validaciones.filter((x) => !(x.exp === v.exp && x.hallazgo === v.hallazgo));
      e.validaciones.push({ ...v, autor: q.actor, fecha: new Date().toISOString() });
    });
    this.registrar(v.exp, 'validacion', `${v.estado === 'confirmado' ? 'Confirmó' : 'Descartó'} el hallazgo «${v.titulo}»` +
      (v.observacion ? `. Observación: ${v.observacion.replace(/.$/, '')}` : '') + (v.derivadoA ? `. Derivado a ${v.derivadoA}` : ''));
  }

  validacionesDe(exp: string): ValidacionJuridica[] {
    return this.validaciones().filter((v) => v.exp === exp);
  }

  // ---------------------------------------------------------------- gerencia

  decidir(d: Omit<DecisionNegocio, 'autor' | 'fecha'>): void {
    const q = this.quien();
    this.cambiar((e) => e.decisiones.push({ ...d, autor: q.actor, fecha: new Date().toISOString() }));
    const texto = { avanza: 'Avanza', espera: 'En espera', descartado: 'Descartado' }[d.valor];
    this.registrar(d.exp, 'decision', `Decisión de negocio: ${texto}. Motivo: ${d.motivo}. Con la recomendación «${d.recomendacion ?? 'sin dictamen'}» (corrida ${d.corrida})`);
  }

  decisionDe(exp: string): DecisionNegocio | undefined {
    return this.decisiones().filter((d) => d.exp === exp).at(-1);
  }

  // ---------------------------------------------------------------- reglas

  publicarReglas(efectos: Record<string, Efecto>, parametros: Parametros, motivo: string, fuente: string, cambios: string[]): VersionReglas {
    const q = this.quien();
    const v: VersionReglas = {
      version: this.reglasVigentes().version + 1, fecha: new Date().toISOString(), autor: q.actor, motivo, fuente,
      cambios, efectos: { ...efectos }, parametros: { ...parametros },
    };
    this.cambiar((e) => e.reglas.push(v));
    this.registrar(null, 'reglas', `Publicó la versión ${v.version} de las reglas: ${cambios.join('; ')}. Motivo: ${motivo}`);
    return v;
  }
}

export const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente', solicitado: 'Solicitado', recibido: 'Recibido', en_verificacion: 'En verificación', resuelto: 'Resuelto',
};

export const AREA_ICONO: Record<Area, string> = {
  Expansión: 'travel_explore', Jurídico: 'gavel', Trámites: 'assignment', Arrendador: 'real_estate_agent', Gerencia: 'insights',
};
