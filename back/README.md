# Backend — Expedientes 3B

API en FastAPI que recibe los PDFs de un expediente, los lee con OCR local (PaddleOCR) y
entrega un dictamen con evidencia. Corre en una laptop; el front se conecta por HTTP.

> **Este repositorio es público.** Nunca subas PDFs, salidas de OCR ni llaves. `back/.env`,
> `back/data/` y `modules/` están en `.gitignore`.

## Instalación (Windows, Python 3.13)

Desde la carpeta `back/`:

```bash
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip

# PaddlePaddle con GPU (NVIDIA, CUDA 12.6). Sin GPU: pip install paddlepaddle==3.3.1
.venv\Scripts\python -m pip install paddlepaddle-gpu==3.3.1 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/

.venv\Scripts\python -m pip install -r requirements.txt
```

## Configuración

Copia `.env.example` como `.env` y rellena:

| Variable | Para qué |
|---|---|
| `API_KEY` | Clave que el front envía en la cabecera `X-API-Key`. Obligatoria |
| `CORS_ORIGINS` | URL(s) del front, separadas por coma |
| `DEEPSEEK_API_KEY` | Llave del LLM |
| `OCR_DEVICE` | `gpu` o `cpu` |

## Ejecutar

```bash
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Documentación interactiva: http://127.0.0.1:8000/docs

Para que un front publicado en internet llegue al back hace falta un túnel con HTTPS
(por ejemplo `ngrok http 8000`) y poner la URL del front en `CORS_ORIGINS`.

## Rutas

Todas menos `/salud` piden la cabecera `X-API-Key` (o `?key=` en la URL, pensado para `<img>`).

| Método y ruta | Qué hace |
|---|---|
| `GET /salud` | Comprueba que el servicio responde |
| `GET /ejemplo/expediente` | Expediente ficticio con dictamen completo, para desarrollar el front |
| `POST /expedientes` | Sube los PDFs (campo `archivos`, uno o varios). Devuelve el expediente con su `id` |
| `GET /expedientes/{id}` | Estado y avance; al terminar incluye el dictamen |
| `GET /expedientes/{id}/documentos/{doc_id}/paginas/{n}` | Imagen JPEG de la página |

El front consulta `GET /expedientes/{id}` cada pocos segundos hasta que `estado` sea `listo` o `error`.

### Evidencia

Cada evidencia trae `documento_id`, `pagina`, `texto` y `caja` (`[x0, y0, x1, y1]`).
La caja está en píxeles de la imagen de esa página; el tamaño real viene en
`documentos[].paginas[]` (`ancho`, `alto`) para escalar el resaltado.

El contrato completo está en `app/schemas.py` y en `/docs`.

## OCR por lote

Procesa una carpeta de PDFs y deja el resultado en caché, para que después el análisis sea rápido:

```bash
.venv\Scripts\python -m scripts.ocr_lote <carpeta_con_pdfs>
```

Solo imprime conteos y confianzas, no el contenido.

## Estructura

| Archivo | Contenido |
|---|---|
| `app/main.py` | Rutas, CORS y clave de acceso |
| `app/schemas.py` | Contrato JSON con el front |
| `app/ocr.py` | Rasterizado, PaddleOCR y caché por hash del PDF |
| `app/pipeline.py` | Proceso en segundo plano: OCR y análisis |
| `app/agentes.py` | Análisis multiagente (pendiente) |
| `app/llm.py` | Conexión al LLM |
| `app/ejemplo.py` | Expediente ficticio |
| `data/` | PDFs subidos y caché de OCR (no se sube al repo) |
