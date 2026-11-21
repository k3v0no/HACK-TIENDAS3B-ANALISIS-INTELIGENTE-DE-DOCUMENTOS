import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Cuenta, CuentasService, Permiso, TIPO_ARRENDADOR } from './cuentas.service';

/** Inicio, menú y ruta del expediente de cada perfil. Cada rol tiene sus propias vistas. */
export interface Vista { ruta: string; texto: string; icono: string; permiso: Permiso }

export const MENU: Record<string, Vista[]> = {
  [TIPO_ARRENDADOR]: [
    { ruta: '/arrendador/enviar', texto: 'Enviar documentos', icono: 'upload_file', permiso: 'propios.cargar' },
    { ruta: '/arrendador/tramites', texto: 'Mis trámites', icono: 'folder_shared', permiso: 'propios.ver' },
  ],
  Superusuario: [
    { ruta: '/admin/usuarios', texto: 'Usuarios', icono: 'person_add', permiso: 'usuarios.admin' },
    { ruta: '/admin/trabajadores', texto: 'Trabajadores', icono: 'badge', permiso: 'usuarios.admin' },
  ],
  'Analista de expansión': [
    { ruta: '/analista/inmuebles', texto: 'Mis inmuebles', icono: 'travel_explore', permiso: 'inmuebles.gestionar' },
  ],
  Jurídico: [
    { ruta: '/juridico/casos', texto: 'Casos jurídicos', icono: 'gavel', permiso: 'casos.juridicos' },
    { ruta: '/juridico/mapa', texto: 'Mapa de inmuebles', icono: 'map', permiso: 'casos.juridicos' },
  ],
  'Gestor de trámites': [
    { ruta: '/gestor/tramites', texto: 'Trámites', icono: 'assignment', permiso: 'tramites.gestionar' },
    { ruta: '/gestor/permisos', texto: 'Permisos y vigencias', icono: 'event_available', permiso: 'tramites.gestionar' },
  ],
  Gerente: [
    { ruta: '/gerente/tablero', texto: 'Tablero de portafolio', icono: 'insights', permiso: 'portafolio.ver' },
  ],
  Auditor: [
    { ruta: '/auditor/casos', texto: 'Auditoría', icono: 'policy', permiso: 'auditoria.ver' },
  ],
  'Administrador de reglas': [
    { ruta: '/reglas', texto: 'Reglas', icono: 'tune', permiso: 'reglas.configurar' },
  ],
};

/** Prefijo de la ruta del expediente según el rol (cada uno lo ve a su manera). */
export const RUTA_EXPEDIENTE: Record<string, string> = {
  'Analista de expansión': '/analista/expediente',
  Jurídico: '/juridico/expediente',
  'Gestor de trámites': '/gestor/expediente',
  Gerente: '/gerente/expediente',
  Auditor: '/auditor/expediente',
};

export function rutaInicio(c: Cuenta): string {
  const menu = MENU[c.tipo === TIPO_ARRENDADOR ? TIPO_ARRENDADOR : c.perfil];
  return menu?.[0]?.ruta ?? '/';
}

/** Deja pasar solo si hay sesión y el perfil tiene el permiso. Si no, lleva a su inicio. */
export function requiere(permiso: Permiso): CanActivateFn {
  return () => {
    const cuentas = inject(CuentasService);
    const router = inject(Router);
    const c = cuentas.cuenta();
    if (!c) return router.parseUrl('/');
    return cuentas.puede(permiso) ? true : router.parseUrl(rutaInicio(c));
  };
}

/** En la portada: si ya hay sesión, ir directo al inicio del perfil. */
export const sinSesion: CanActivateFn = () => {
  const c = inject(CuentasService).cuenta();
  return c ? inject(Router).parseUrl(rutaInicio(c)) : true;
};
