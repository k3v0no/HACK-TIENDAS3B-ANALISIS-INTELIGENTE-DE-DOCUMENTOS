# Front (Angular)

Prototipo de revisión de expedientes, Hackatón Tiendas 3B. Angular 21 con componentes
standalone y señales. La versión anterior en Streamlit está en `../front-streamlit/`.

## Correrlo

Requiere Node 20.19+, 22.12+ o 24+ y pnpm (`npm install -g pnpm` si no lo tienes).

```powershell
cd front
pnpm install         # una sola vez
pnpm start           # http://localhost:4200
```

Los comandos van dentro de `front/`: el `package.json` de la raíz del repo solo trae herramientas
de prueba. `pnpm-workspace.yaml` deja correr los scripts de instalación de esbuild, lmdb,
msgpackr-extract y @parcel/watcher, que usa el compilador de Angular.

Antes, enciende el back (ver `../back/README.md`). El servidor de desarrollo reenvía `/api` al
back y le agrega la cabecera `X-API-Key`, así la clave nunca llega al navegador y no hace falta
tocar `CORS_ORIGINS`. La configuración está en `proxy.conf.mjs`:

- Si el back corre en esta misma computadora no hay que configurar nada: la clave se lee de
  `back/.env`.
- Si corre en otra laptop (arrancado con `--host 0.0.0.0`):

  ```powershell
  $env:BACK_URL = "http://<IP de esa laptop>:8000"
  $env:BACK_API_KEY = "<el API_KEY de back/.env>"
  pnpm start
  ```

Si el back no responde, los expedientes se guardan y quedan como «Sin analizar»; el botón
«Analizar» se activa cuando el back vuelve.

## Cuentas iniciales

La contraseña de estas cuentas **no está en el repositorio** (es público): pídela al equipo.
En el código solo están su sal y su hash PBKDF2 (`src/app/core/cuentas.service.ts`).

| Perfil | Usuario | Qué ve |
|---|---|---|
| Arrendador | `arrendador` | Envía documentos por pasos y consulta su trámite. Nunca ve el dictamen |
| Superusuario | `admin` | Da de alta trabajadores y administra su acceso. No ve expedientes |
| Jurídico | `juridico` | Todo el expediente; decide |
| Analista de expansión | `analista` | Carga y revisa, sin datos fiscales |
| Gestor de trámites | `gestor` | Sin propietario ni datos fiscales |
| Fiscal | `fiscal` | Sin datos regulatorios |
| Gerente | `gerente` | Sin documentos originales; decide |
| Auditor | `auditor` | Todo, en solo lectura |

Las cuentas, la sesión y la lista de expedientes se simulan en el navegador (almacenamiento
local; contraseñas derivadas con PBKDF2). Para cambiar la contraseña de las cuentas iniciales hay
que recalcular sal y hash en `SEMILLA` y subir la versión de `LLAVE_CUENTAS`, para que los
navegadores que ya las tenían las vuelvan a crear. El back no tiene una ruta para listar expedientes, así
que para la demo el arrendador y los trabajadores usan el mismo navegador. Los archivos subidos
se guardan en IndexedDB para poder reintentar el análisis.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/styles.css` | Sistema visual: paleta 3B, tipografía, botones, avisos, insignias |
| `src/app/core/back.ts` | Contrato JSON del back (copia de `back/app/schemas.py`) |
| `src/app/core/traduccion.ts` | Convierte la respuesta del back a la forma que usan las vistas |
| `src/app/core/expedientes.service.ts` | Registro local, IndexedDB y llamadas al back |
| `src/app/core/cuentas.service.ts` | Cuentas, perfiles y permisos por área |
| `src/app/core/navegacion.ts` | Guardias de ruta e inicio por perfil |
| `src/app/ui/` | Componentes compartidos: asistente de carga, visor de evidencia, insignias |
| `src/app/paginas/` | Portada, marco con barra lateral y vistas por perfil |

Si el back cambia `app/schemas.py`, solo hay que ajustar `core/back.ts` y `core/traduccion.ts`.

## Compilar

```powershell
pnpm build           # salida en dist/front
```

En producción, el mismo papel del proxy (agregar la clave y reenviar `/api`) lo hace el
servidor que publique el front, dentro de la red de Tiendas 3B.
