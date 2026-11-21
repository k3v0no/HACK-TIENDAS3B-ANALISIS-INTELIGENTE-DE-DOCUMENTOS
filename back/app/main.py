"""API del backend: carga de expedientes, consulta del dictamen e imágenes de evidencia."""
import secrets
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, Security, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader

from . import ejemplo, ocr, pipeline, storage
from .config import settings
from .schemas import Documento, Expediente

if not settings.api_key:
    raise RuntimeError("Falta API_KEY en back/.env (copia .env.example y rellénalo)")

app = FastAPI(title="Expedientes 3B", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origenes,
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)

_cabecera = APIKeyHeader(name="X-API-Key", auto_error=False)


def autenticar(
    cabecera: str | None = Security(_cabecera),
    key: str | None = Query(default=None, description="Alternativa a la cabecera, para etiquetas <img>"),
) -> None:
    recibida = cabecera or key or ""
    if not secrets.compare_digest(recibida.encode(), settings.api_key.encode()):
        raise HTTPException(status_code=401, detail="Clave de acceso no válida")


def _expediente(expediente_id: str) -> Expediente:
    if not storage.id_valido(expediente_id):
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    expediente = storage.cargar(expediente_id)
    if expediente is None:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    return expediente


def _documento(expediente: Expediente, documento_id: str) -> Documento:
    for documento in expediente.documentos:
        if documento.id == documento_id:
            return documento
    raise HTTPException(status_code=404, detail="Documento no encontrado")


@app.get("/salud")
def salud() -> dict:
    return {"ok": True}


@app.get("/ejemplo/expediente", response_model=Expediente, dependencies=[Depends(autenticar)])
def expediente_de_ejemplo() -> Expediente:
    """Expediente ficticio con dictamen completo, para desarrollar el front."""
    return ejemplo.EXPEDIENTE


@app.post("/expedientes", response_model=Expediente, status_code=202, dependencies=[Depends(autenticar)])
async def crear_expediente(
    tareas: BackgroundTasks, archivos: list[UploadFile] = File(description="Documentos del expediente: PDF, JPG o PNG")
) -> Expediente:
    """Recibe los PDFs y arranca el proceso. Consulta el avance con GET /expedientes/{id}."""
    limite = settings.max_pdf_mb * 1024 * 1024
    expediente = Expediente(id=storage.nuevo_id(), estado="en_cola", etapa="En cola")

    contenidos: list[tuple[Documento, bytes]] = []
    for archivo in archivos:
        datos = await archivo.read(limite + 1)
        nombre = Path(archivo.filename or "documento.pdf").name
        if len(datos) > limite:
            raise HTTPException(status_code=413, detail=f"{nombre} supera {settings.max_pdf_mb} MB")
        if ocr.tipo_de_archivo(datos) is None:
            raise HTTPException(status_code=415, detail=f"{nombre} no es un PDF ni una imagen JPG o PNG")
        contenidos.append((Documento(id=storage.nuevo_id(), archivo=nombre), datos))

    for documento, datos in contenidos:
        ruta = storage.ruta_pdf(expediente.id, documento.id)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_bytes(datos)
        expediente.documentos.append(documento)

    storage.guardar(expediente)
    tareas.add_task(pipeline.procesar, expediente.id)
    return expediente


@app.get("/expedientes/{expediente_id}", response_model=Expediente, dependencies=[Depends(autenticar)])
def consultar_expediente(expediente_id: str) -> Expediente:
    return _expediente(expediente_id)


@app.get(
    "/expedientes/{expediente_id}/documentos/{documento_id}/paginas/{numero}",
    response_class=FileResponse,
    dependencies=[Depends(autenticar)],
)
def imagen_de_pagina(expediente_id: str, documento_id: str, numero: int) -> FileResponse:
    """Imagen JPEG de la página; las cajas de la evidencia están en sus píxeles."""
    documento = _documento(_expediente(expediente_id), documento_id)
    if documento.hash_ocr is None or not any(p.numero == numero for p in documento.paginas):
        raise HTTPException(status_code=404, detail="Página no disponible")
    ruta = ocr.ruta_imagen(documento.hash_ocr, numero)
    if not ruta.exists():
        raise HTTPException(status_code=404, detail="Página no disponible")
    return FileResponse(ruta, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
