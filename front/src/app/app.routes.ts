import { Routes } from '@angular/router';
import { requiere, sinSesion } from './core/navegacion';
import { Shell } from './paginas/shell';

const t = (titulo: string) => `${titulo} | Tiendas 3B`;

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [sinSesion], title: 'Tiendas 3B | Revisión de expedientes',
    loadComponent: () => import('./paginas/portada').then((m) => m.Portada) },
  {
    path: '',
    component: Shell,
    children: [
      // Arrendador: el único que sube documentos
      { path: 'arrendador/enviar', canActivate: [requiere('propios.cargar')], title: t('Enviar documentos'),
        loadComponent: () => import('./paginas/arrendador/enviar').then((m) => m.Enviar) },
      { path: 'arrendador/tramites', canActivate: [requiere('propios.ver')], title: t('Mis trámites'),
        loadComponent: () => import('./paginas/arrendador/tramites').then((m) => m.Tramites) },

      // Analista de expansión
      { path: 'analista/inmuebles', canActivate: [requiere('inmuebles.gestionar')], title: t('Mis inmuebles'),
        loadComponent: () => import('./paginas/analista/inmuebles').then((m) => m.Inmuebles) },
      { path: 'analista/expediente/:id', canActivate: [requiere('inmuebles.gestionar')], title: t('Inmueble'),
        loadComponent: () => import('./paginas/analista/expediente').then((m) => m.ExpedienteAnalista) },

      // Jurídico
      { path: 'juridico/casos', canActivate: [requiere('casos.juridicos')], title: t('Casos jurídicos'),
        loadComponent: () => import('./paginas/juridico/casos').then((m) => m.Casos) },
      { path: 'juridico/expediente/:id', canActivate: [requiere('casos.juridicos')], title: t('Comparador'),
        loadComponent: () => import('./paginas/juridico/expediente').then((m) => m.ExpedienteJuridico) },

      // Gestor de trámites
      { path: 'gestor/tramites', canActivate: [requiere('tramites.gestionar')], title: t('Trámites'),
        loadComponent: () => import('./paginas/gestor/tramites').then((m) => m.TramitesGestor) },
      { path: 'gestor/permisos', canActivate: [requiere('tramites.gestionar')], title: t('Permisos y vigencias'),
        loadComponent: () => import('./paginas/gestor/permisos').then((m) => m.Permisos) },
      { path: 'gestor/expediente/:id', canActivate: [requiere('tramites.gestionar')], title: t('Permisos del inmueble'),
        loadComponent: () => import('./paginas/gestor/expediente').then((m) => m.ExpedienteGestor) },

      // Gerente o comité
      { path: 'gerente/tablero', canActivate: [requiere('portafolio.ver')], title: t('Tablero'),
        loadComponent: () => import('./paginas/gerente/tablero').then((m) => m.Tablero) },
      { path: 'gerente/expediente/:id', canActivate: [requiere('portafolio.ver')], title: t('Resumen ejecutivo'),
        loadComponent: () => import('./paginas/gerente/resumen').then((m) => m.Resumen) },

      // Auditor
      { path: 'auditor/casos', canActivate: [requiere('auditoria.ver')], title: t('Auditoría'),
        loadComponent: () => import('./paginas/auditor/casos').then((m) => m.CasosAuditor) },
      { path: 'auditor/expediente/:id', canActivate: [requiere('auditoria.ver')], title: t('Historial del caso'),
        loadComponent: () => import('./paginas/auditor/expediente').then((m) => m.ExpedienteAuditor) },

      // Administrador de reglas
      { path: 'reglas', canActivate: [requiere('reglas.configurar')], title: t('Reglas'),
        loadComponent: () => import('./paginas/reglas/catalogo').then((m) => m.Catalogo) },

      // Dictamen completo (consulta compartida desde las vistas de cada rol)
      { path: 'expediente/:id', canActivate: [requiere('hallazgos.ver')], title: t('Dictamen completo'),
        loadComponent: () => import('./paginas/comun/dictamen').then((m) => m.DictamenCompleto) },

      // Revisión de un documento: página completa con las anomalías marcadas y la decisión de validez
      { path: 'revision/:id/:doc', canActivate: [requiere('documentos.ver')], title: t('Revisión de documento'),
        loadComponent: () => import('./paginas/comun/revision-documento').then((m) => m.RevisionDocumento) },

      // Superusuario
      { path: 'admin/usuarios', canActivate: [requiere('usuarios.admin')], title: t('Usuarios'),
        loadComponent: () => import('./paginas/admin/usuarios').then((m) => m.Usuarios) },
      { path: 'admin/trabajadores', canActivate: [requiere('usuarios.admin')], title: t('Trabajadores'),
        loadComponent: () => import('./paginas/admin/trabajadores').then((m) => m.Trabajadores) },
    ],
  },
  { path: '**', redirectTo: '' },
];
