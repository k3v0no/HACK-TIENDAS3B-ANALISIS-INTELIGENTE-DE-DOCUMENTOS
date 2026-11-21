import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Cuenta, CuentasService, Permiso, TIPO_ARRENDADOR } from './cuentas.service';

/** Página de inicio de cada perfil. */
export function rutaInicio(c: Cuenta): string {
  if (c.tipo === TIPO_ARRENDADOR) return '/arrendador/enviar';
  if (c.perfil === 'Superusuario') return '/admin/usuarios';
  return '/trabajador/bandeja';
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
