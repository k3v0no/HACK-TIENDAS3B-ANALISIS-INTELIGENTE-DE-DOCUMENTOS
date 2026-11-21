// Simulación de cuentas con contraseña y permisos por área.
//
// Las cuentas viven en el almacenamiento local del navegador, con la contraseña derivada con
// PBKDF2 (Web Crypto). Las cuentas iniciales se crean con su sal y su hash ya calculados: la
// contraseña no aparece en el código (el repositorio es público). El equipo la comparte aparte. La sesión dura mientras la pestaña esté abierta. En producción esto lo
// resuelve el back con un proveedor de identidad y verifica permisos en cada petición; aquí
// solo se simula para mostrar cómo cambia lo que ve cada área.
import { Injectable, computed, signal } from '@angular/core';

export const TIPO_TRABAJADOR = 'Trabajador 3B';
export const TIPO_ARRENDADOR = 'Arrendador';
export type TipoCuenta = typeof TIPO_TRABAJADOR | typeof TIPO_ARRENDADOR;

export type Permiso =
  | 'usuarios.admin' | 'expedientes.ver' | 'expedientes.cargar' | 'documentos.ver' | 'propietario.ver'
  | 'inmueble.ver' | 'fiscal.ver' | 'regulatorio.ver' | 'hallazgos.ver' | 'dictamen.decidir'
  | 'propios.cargar' | 'propios.ver';

/** Perfiles = conjuntos de permisos (datos, no código). */
export const PERMISOS: Record<string, Permiso[]> = {
  Superusuario: ['usuarios.admin'],
  Jurídico: ['expedientes.ver', 'expedientes.cargar', 'documentos.ver', 'propietario.ver', 'inmueble.ver',
    'fiscal.ver', 'regulatorio.ver', 'hallazgos.ver', 'dictamen.decidir'],
  'Analista de expansión': ['expedientes.ver', 'expedientes.cargar', 'documentos.ver', 'propietario.ver',
    'inmueble.ver', 'regulatorio.ver', 'hallazgos.ver'],
  'Gestor de trámites': ['expedientes.ver', 'documentos.ver', 'inmueble.ver', 'regulatorio.ver', 'hallazgos.ver'],
  Fiscal: ['expedientes.ver', 'documentos.ver', 'propietario.ver', 'inmueble.ver', 'fiscal.ver', 'hallazgos.ver'],
  Gerente: ['expedientes.ver', 'inmueble.ver', 'regulatorio.ver', 'hallazgos.ver', 'dictamen.decidir'],
  Auditor: ['expedientes.ver', 'documentos.ver', 'propietario.ver', 'inmueble.ver', 'fiscal.ver',
    'regulatorio.ver', 'hallazgos.ver'],
  [TIPO_ARRENDADOR]: ['propios.cargar', 'propios.ver'],
};
export const AREAS = Object.keys(PERMISOS).filter((p) => p !== TIPO_ARRENDADOR && p !== 'Superusuario');

export const PERFIL_INFO: Record<string, { descripcion: string; icono: string }> = {
  Superusuario: { descripcion: 'Da de alta a trabajadores. No ve expedientes.', icono: 'admin_panel_settings' },
  Jurídico: { descripcion: 'Ve todo el expediente y emite el dictamen.', icono: 'gavel' },
  'Analista de expansión': { descripcion: 'Carga y revisa expedientes, sin datos fiscales.', icono: 'travel_explore' },
  'Gestor de trámites': { descripcion: 'Revisa vigencias y documentos municipales.', icono: 'assignment' },
  Fiscal: { descripcion: 'Revisa predial, contribuyente y clave catastral.', icono: 'account_balance' },
  Gerente: { descripcion: 'Ve resultados y decide, sin documentos originales.', icono: 'insights' },
  Auditor: { descripcion: 'Consulta todo en solo lectura.', icono: 'policy' },
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
  ['fiscal', 'Jorge Ramos', TIPO_TRABAJADOR, 'Fiscal',
    '68bfc2b8a68a719fe0ae9047996cfe19', 'd1d3067fb27f91e099eb4e79cc469bb48ee7c7277e353b335adc5afff9a3a3b3'],
  ['gestor', 'Sofía Núñez', TIPO_TRABAJADOR, 'Gestor de trámites',
    '65620e0561541a7e3028b58891f17249', 'bb6886f78f9fa1959814126ae65f5a3805abc81ecd92d79673327144c015ba26'],
  ['gerente', 'Raúl Ortega', TIPO_TRABAJADOR, 'Gerente',
    'ea17841418de4da637dbcf7695a9295c', '500b73a9724d0abf14a5badcfde0bb63b12ae8d631e46c676a66dd4a55c850f4'],
  ['auditor', 'Elena Ríos', TIPO_TRABAJADOR, 'Auditor',
    'b43393c046ba482afa7cc2929189c3a3', '97ca79cdd331f0a76567d6f629586338dc11ef30ef770f1eeeeac08c787b56ee'],
  ['arrendador', 'Patricia Lara', TIPO_ARRENDADOR, TIPO_ARRENDADOR,
    '20fedfeb277c6e30c850bbfd847176fd', '7bcb76833693286bbd267db09bba6b1827d95760a2f93a5930435fcd8241c0eb'],
];
// v2: cambió la contraseña de las cuentas iniciales; los navegadores con la versión anterior se vuelven a sembrar.
const LLAVE_CUENTAS = 'tiendas3b.cuentas.v2';
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
    try { localStorage.removeItem('tiendas3b.cuentas.v1'); } catch { /* sin almacenamiento */ }
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
    if (['propietario', 'contribuyente', 'titular'].some((p) => c.includes(p))) return 'propietario.ver';
    if (['clave', 'cuenta predial', 'adeudo', 'pago'].some((p) => c.includes(p))) return 'fiscal.ver';
    if (['uso', 'alineamiento', 'vigencia', 'emisión', 'autoridad', 'restricci', 'compatib', 'condicion']
      .some((p) => c.includes(p))) return 'regulatorio.ver';
    return 'inmueble.ver';
  }

  veCampo(campo: string): boolean {
    return this.puede(CuentasService.permisoDeCampo(campo));
  }
}
