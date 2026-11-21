// Simulación de cuentas con contraseña y permisos por área.
//
// Las cuentas viven en el almacenamiento local del navegador, con la contraseña derivada con
// PBKDF2 (Web Crypto). Las cuentas iniciales se crean con su sal y su hash ya calculados: la
// contraseña no aparece en el código (el repositorio es público). El equipo la comparte aparte.
// La sesión dura mientras la pestaña esté abierta. En producción esto lo resuelve el back con un
// proveedor de identidad y verifica permisos en cada petición; aquí solo se simula para mostrar
// cómo cambia lo que ve cada área.
//
// Los perfiles siguen la guía de actores del reto: Analista de expansión, Jurídico, Gestor de
// trámites, Gerente o comité, Auditor y Administrador de reglas. Solo el arrendador sube documentos.
import { Injectable, computed, signal } from '@angular/core';

export const TIPO_TRABAJADOR = 'Trabajador 3B';
export const TIPO_ARRENDADOR = 'Arrendador';
export type TipoCuenta = typeof TIPO_TRABAJADOR | typeof TIPO_ARRENDADOR;

export type Permiso =
  // datos que se pueden ver
  | 'expedientes.ver' | 'documentos.ver' | 'propietario.ver' | 'inmueble.ver' | 'fiscal.ver' | 'regulatorio.ver'
  | 'hallazgos.ver'
  // acciones por rol
  | 'expedientes.analizar' | 'inmuebles.gestionar' | 'pendientes.turnar' | 'casos.juridicos' | 'extraccion.corregir'
  | 'hallazgos.validar' | 'tramites.gestionar' | 'portafolio.ver' | 'negocio.decidir' | 'fichas.exportar'
  | 'auditoria.ver' | 'reglas.configurar' | 'usuarios.admin'
  // arrendador
  | 'propios.cargar' | 'propios.ver';

/** Perfiles = conjuntos de permisos (datos, no código). */
const VER_TODO: Permiso[] = ['expedientes.ver', 'documentos.ver', 'propietario.ver', 'inmueble.ver', 'fiscal.ver',
  'regulatorio.ver', 'hallazgos.ver'];
export const PERMISOS: Record<string, Permiso[]> = {
  Superusuario: ['usuarios.admin'],
  'Analista de expansión': [...VER_TODO, 'expedientes.analizar', 'inmuebles.gestionar', 'pendientes.turnar'],
  Jurídico: [...VER_TODO, 'casos.juridicos', 'extraccion.corregir', 'hallazgos.validar', 'pendientes.turnar'],
  'Gestor de trámites': ['expedientes.ver', 'documentos.ver', 'inmueble.ver', 'regulatorio.ver', 'hallazgos.ver',
    'tramites.gestionar'],
  Gerente: ['expedientes.ver', 'documentos.ver', 'inmueble.ver', 'regulatorio.ver', 'hallazgos.ver', 'portafolio.ver',
    'negocio.decidir', 'fichas.exportar'],
  Auditor: [...VER_TODO, 'auditoria.ver', 'fichas.exportar'],
  'Administrador de reglas': ['expedientes.ver', 'hallazgos.ver', 'reglas.configurar'],
  [TIPO_ARRENDADOR]: ['propios.cargar', 'propios.ver'],
};
export const AREAS = Object.keys(PERMISOS).filter((p) => p !== TIPO_ARRENDADOR && p !== 'Superusuario');

export const PERFIL_INFO: Record<string, { descripcion: string; icono: string }> = {
  Superusuario: { descripcion: 'Da de alta a trabajadores. No ve expedientes.', icono: 'admin_panel_settings' },
  'Analista de expansión': { descripcion: 'Inicia la revisión de cada inmueble y resuelve o turna lo que impide avanzar.', icono: 'travel_explore' },
  Jurídico: { descripcion: 'Compara documentos con evidencia, corrige lecturas y valida los hallazgos.', icono: 'gavel' },
  'Gestor de trámites': { descripcion: 'Da seguimiento a permisos, vigencias y solicitudes de documentos.', icono: 'assignment' },
  Gerente: { descripcion: 'Decide si un inmueble avanza, con el tablero y el resumen ejecutivo.', icono: 'insights' },
  Auditor: { descripcion: 'Reconstruye qué pasó en cada expediente, en solo lectura.', icono: 'policy' },
  'Administrador de reglas': { descripcion: 'Mantiene las reglas y prueba su impacto antes de publicarlas.', icono: 'tune' },
  [TIPO_ARRENDADOR]: { descripcion: 'Sube documentos y consulta su trámite.', icono: 'real_estate_agent' },
};

export interface Cuenta { usuario: string; nombre: string; tipo: TipoCuenta; perfil: string; activo: boolean }
interface Registro extends Cuenta { sal: string; hash: string }

/** usuario, nombre, tipo, perfil, sal y hash PBKDF2 (SHA-256, 120 000 iteraciones) de la contraseña. */
const SEMILLA: [string, string, TipoCuenta, string, string, string][] = [
  ['admin', 'Ana Torres', TIPO_TRABAJADOR, 'Superusuario',
    '27e2100ca2cc2540bf5aa31ce26f061a', '029b3bb5c9e16554a4e8ec27362a35121e526d38591d0c53ffb05e2a5cc14e15'],
  ['juridico', 'Luis Herrera', TIPO_TRABAJADOR, 'Jurídico',
    '2bc1f6ba14e9801df7f13c2c9856520c', '7259fdb39ddf6199f6ce31db2e0469d58f8f3c289ef67f07de53f43580c0e3a2'],
  ['analista', 'Carla Méndez', TIPO_TRABAJADOR, 'Analista de expansión',
    '3de0b8da01c1f1aa3f0a2722d2481873', 'e1dcab100bf96d9551f0af022a2d8d4c964d790250cd9f3bb5ea807ce35bbf22'],
  ['gestor', 'Sofía Núñez', TIPO_TRABAJADOR, 'Gestor de trámites',
    '65620e0561541a7e3028b58891f17249', 'bb6886f78f9fa1959814126ae65f5a3805abc81ecd92d79673327144c015ba26'],
  ['gerente', 'Raúl Ortega', TIPO_TRABAJADOR, 'Gerente',
    'ea17841418de4da637dbcf7695a9295c', '500b73a9724d0abf14a5badcfde0bb63b12ae8d631e46c676a66dd4a55c850f4'],
  ['auditor', 'Elena Ríos', TIPO_TRABAJADOR, 'Auditor',
    'b43393c046ba482afa7cc2929189c3a3', '97ca79cdd331f0a76567d6f629586338dc11ef30ef770f1eeeeac08c787b56ee'],
  ['reglas', 'Martín Cruz', TIPO_TRABAJADOR, 'Administrador de reglas',
    'c1b5f29ea778e723742560bf7e991587', '0fced854cdbb7dd64720aacdc6bc8822279aa06b69b13b17e6b8a19843cf0153'],
  ['arrendador', 'Patricia Lara', TIPO_ARRENDADOR, TIPO_ARRENDADOR,
    '20fedfeb277c6e30c850bbfd847176fd', '7bcb76833693286bbd267db09bba6b1827d95760a2f93a5930435fcd8241c0eb'],
];
// v3: perfiles según la guía de actores (sale Fiscal, entra Administrador de reglas). Los navegadores con
// una versión anterior vuelven a sembrar las cuentas iniciales.
const LLAVE_CUENTAS = 'tiendas3b.cuentas.v3';
const LLAVE_SESION = 'tiendas3b.sesion';

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function derivar(clave: string, salHex: string): Promise<string> {
  const sal = new Uint8Array(salHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: 120_000 }, base, 256);
  return hex(bits);
}

function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function leer<T>(almacen: Storage, llave: string): T | null {
  try {
    const v = almacen.getItem(llave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function escribir(almacen: Storage, llave: string, valor: unknown): void {
  try {
    if (valor === null) almacen.removeItem(llave);
    else almacen.setItem(llave, JSON.stringify(valor));
  } catch {
    /* almacenamiento no disponible: la sesión vive solo en memoria */
  }
}

@Injectable({ providedIn: 'root' })
export class CuentasService {
  private readonly _cuenta = signal<Cuenta | null>(leer<Cuenta>(sessionStorage, LLAVE_SESION));
  readonly cuenta = this._cuenta.asReadonly();
  readonly esTrabajador = computed(() => this._cuenta()?.tipo === TIPO_TRABAJADOR);
  private listo: Promise<void>;

  constructor() {
    this.listo = this.sembrar();
  }

  private async sembrar(): Promise<void> {
    if (leer<Record<string, Registro>>(localStorage, LLAVE_CUENTAS)) return;
    const datos: Record<string, Registro> = {};
    for (const [usuario, nombre, tipo, perfil, sal, hash] of SEMILLA) {
      datos[usuario] = { usuario, nombre, tipo, perfil, activo: true, sal, hash };
    }
    escribir(localStorage, LLAVE_CUENTAS, datos);
    try { ['tiendas3b.cuentas.v1', 'tiendas3b.cuentas.v2'].forEach((k) => localStorage.removeItem(k)); } catch { /* sin almacenamiento */ }
  }

  private async nuevoRegistro(usuario: string, nombre: string, tipo: TipoCuenta, perfil: string, clave: string): Promise<Registro> {
    const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
    return { usuario, nombre, tipo, perfil, activo: true, sal, hash: await derivar(clave, sal) };
  }

  private registros(): Record<string, Registro> {
    return leer<Record<string, Registro>>(localStorage, LLAVE_CUENTAS) ?? {};
  }

  private publico(r: Registro): Cuenta {
    return { usuario: r.usuario, nombre: r.nombre, tipo: r.tipo, perfil: r.perfil, activo: r.activo };
  }

  private iniciar(c: Cuenta): void {
    this._cuenta.set(c);
    escribir(sessionStorage, LLAVE_SESION, c);
  }

  async autenticar(usuario: string, clave: string, tipo: TipoCuenta): Promise<Cuenta | null> {
    await this.listo;
    const r = this.registros()[usuario.trim().toLowerCase()];
    if (!r || !r.activo || r.tipo !== tipo) return null;
    if (!iguales(r.hash, await derivar(clave, r.sal))) return null;
    const c = this.publico(r);
    this.iniciar(c);
    return c;
  }

  async registrarArrendador(usuario: string, nombre: string, clave: string): Promise<Cuenta> {
    await this.listo;
    const datos = this.registros();
    const u = usuario.trim().toLowerCase();
    if (datos[u]) throw new Error('ese usuario ya existe; elige otro');
    datos[u] = await this.nuevoRegistro(u, nombre.trim(), TIPO_ARRENDADOR, TIPO_ARRENDADOR, clave);
    escribir(localStorage, LLAVE_CUENTAS, datos);
    const c = this.publico(datos[u]);
    this.iniciar(c);
    return c;
  }

  /** Crea un trabajador con contraseña temporal. Devuelve la contraseña para mostrarla una vez. */
  async crearTrabajador(usuario: string, nombre: string, perfil: string): Promise<{ cuenta: Cuenta; temporal: string }> {
    await this.listo;
    if (!AREAS.includes(perfil)) throw new Error('área no válida');
    const datos = this.registros();
    const u = usuario.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(u)) throw new Error('el usuario debe tener al menos 3 letras, números o puntos');
    if (datos[u]) throw new Error('ese usuario ya existe; elige otro');
    const temporal = hex(crypto.getRandomValues(new Uint8Array(4)));
    datos[u] = await this.nuevoRegistro(u, nombre.trim(), TIPO_TRABAJADOR, perfil, temporal);
    escribir(localStorage, LLAVE_CUENTAS, datos);
    return { cuenta: this.publico(datos[u]), temporal };
  }

  /** Cambia el nombre o el área de un trabajador. El superusuario no cambia de área. */
  actualizarTrabajador(usuario: string, cambios: { nombre: string; perfil: string }): Cuenta {
    const datos = this.registros();
    const r = datos[usuario];
    if (!r || r.tipo !== TIPO_TRABAJADOR) throw new Error('no existe ese trabajador');
    if (!cambios.nombre.trim()) throw new Error('escribe el nombre');
    if (r.perfil !== 'Superusuario' && !AREAS.includes(cambios.perfil)) throw new Error('área no válida');
    r.nombre = cambios.nombre.trim();
    if (r.perfil !== 'Superusuario') r.perfil = cambios.perfil;
    escribir(localStorage, LLAVE_CUENTAS, datos);
    return this.publico(r);
  }

  cambiarEstado(usuario: string, activo: boolean): void {
    const datos = this.registros();
    if (datos[usuario]) {
      datos[usuario].activo = activo;
      escribir(localStorage, LLAVE_CUENTAS, datos);
    }
  }

  async trabajadores(): Promise<Cuenta[]> {
    await this.listo;
    return Object.values(this.registros()).filter((r) => r.tipo === TIPO_TRABAJADOR).map((r) => this.publico(r));
  }

  cerrarSesion(): void {
    this._cuenta.set(null);
    escribir(sessionStorage, LLAVE_SESION, null);
  }

  puede(permiso: Permiso): boolean {
    const c = this._cuenta();
    return !!c && (PERMISOS[c.perfil] ?? []).includes(permiso);
  }

  /** Qué permiso hace falta para ver un dato extraído, según el nombre del campo. */
  static permisoDeCampo(campo: string): Permiso {
    const c = campo.toLowerCase();
    if (['propietario', 'contribuyente', 'titular', 'transmite', 'solicitante'].some((p) => c.includes(p))) return 'propietario.ver';
    if (['clave', 'cuenta predial', 'adeudo', 'pago', 'ejercicio'].some((p) => c.includes(p))) return 'fiscal.ver';
    if (['uso', 'giro', 'zonific', 'alineamiento', 'vigen', 'plazo', 'emisión', 'autoridad', 'restricci', 'afectaci',
      'compatib', 'condicion', 'folio', 'firma'].some((p) => c.includes(p))) return 'regulatorio.ver';
    return 'inmueble.ver';
  }

  veCampo(campo: string): boolean {
    return this.puede(CuentasService.permisoDeCampo(campo));
  }
}
