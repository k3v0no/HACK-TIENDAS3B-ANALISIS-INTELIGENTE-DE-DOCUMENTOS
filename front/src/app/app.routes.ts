import { Routes } from '@angular/router';
import { requiere, sinSesion } from './core/navegacion';
import { Shell } from './paginas/shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [sinSesion], title: 'Tiendas 3B | Revisión de expedientes',
    loadComponent: () => import('./paginas/portada').then((m) => m.Portada) },
  {
    path: '',
    component: Shell,
    children: [
      { path: 'arrendador/enviar', canActivate: [requiere('propios.cargar')], title: 'Enviar documentos | Tiendas 3B',
        loadComponent: () => import('./paginas/arrendador/enviar').then((m) => m.Enviar) },
      { path: 'arrendador/tramites', canActivate: [requiere('propios.ver')], title: 'Mis trámites | Tiendas 3B',
        loadComponent: () => import('./paginas/arrendador/tramites').then((m) => m.Tramites) },
      { path: 'trabajador/bandeja', canActivate: [requiere('expedientes.ver')], title: 'Bandeja | Tiendas 3B',
        loadComponent: () => import('./paginas/trabajador/bandeja').then((m) => m.Bandeja) },
      { path: 'trabajador/cargar', canActivate: [requiere('expedientes.cargar')], title: 'Cargar expediente | Tiendas 3B',
        loadComponent: () => import('./paginas/trabajador/cargar').then((m) => m.Cargar) },
      { path: 'trabajador/expediente/:id', canActivate: [requiere('expedientes.ver')], title: 'Expediente | Tiendas 3B',
        loadComponent: () => import('./paginas/trabajador/expediente').then((m) => m.ExpedienteDetalle) },
      { path: 'admin/usuarios', canActivate: [requiere('usuarios.admin')], title: 'Usuarios | Tiendas 3B',
        loadComponent: () => import('./paginas/admin/usuarios').then((m) => m.Usuarios) },
      { path: 'admin/trabajadores', canActivate: [requiere('usuarios.admin')], title: 'Trabajadores | Tiendas 3B',
        loadComponent: () => import('./paginas/admin/trabajadores').then((m) => m.Trabajadores) },
    ],
  },
  { path: '**', redirectTo: '' },
];
