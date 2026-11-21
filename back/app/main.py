"""API del backend: carga de expedientes, consulta del dictamen e imágenes de evidencia."""
import secrets
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Query, Security, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader

from . import agentes, ejemplo, extraccion, ocr, pipeline, storage
from .config import settings
from .schemas import (
    Campo, Correccion, CorreccionEntrada, Decision, DecisionEntrada, Documento, EventoBitacora, Expediente,
    ExpedienteResumen,
)

if not settings.api_key:
    raise RuntimeError("Falta API_KEY en back/.env (copia .env.example y rellénalo)")

storage.marcar_interrumpidos()

app = FastAPI(title="Expedientes 3B", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origenes,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["X-API-Key", "X-Usuario", "Content-Type"],
)

_cabecera = APIKeyHeader(name="X-API-Key", auto_error=False)


def autenticar(
    cabecera: str | None = Security(_cabecera),
    key: str | None = Query(default=None, description="Alternativa a la cabecera, para etiquetas <img>"),
) -> None:
    recibida = cabecera or key or ""
    if not secrets.compare_digest(recibida.encode(), settings.api_key.encode()):
        raise HTTPException(status_code=401, detail="Clave de acceso no válida")


def usuario_actual(x_usuario: str | None = Header(default=None, max_length=80)) -> str:
    """Usuario que informa el front en la cabecera X-Usuario.

    Mientras el inicio de sesión no viva en el back, este dato no está verificado: sirve para
    dejar rastro en la bitácora, no para autorizar.
    """
    return (x_usuario or "").strip() or "sin identificar"


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
    tareas: BackgroundTasks,
    archivos: list[UploadFile] = File(description="Documentos del expediente: PDF, JPG o PNG"),
    origen: str | None = Form(default=None, max_length=20, description="Quién lo carga: 'arrendador' o '3b'"),
    cuenta: str | None = Form(default=None, max_length=80, description="Usuario que lo carga"),
    usuario: str = Depends(usuario_actual),
) -> Expediente:
    """Recibe los documentos y arranca el proceso. Consulta el avance con GET /expedientes/{id}."""
    limite = settings.max_pdf_mb * 1024 * 1024
    expediente = Expediente(id=storage.nuevo_id(), estado="en_cola", etapa="En cola", origen=origen, cuenta=cuenta)

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
    actor = cuenta or usuario
    storage.registrar("carga", actor, expediente.id, f"{len(expediente.documentos)} documentos")
    tareas.add_task(pipeline.procesar, expediente.id)
    return expediente


@app.get("/expedientes", response_model=list[ExpedienteResumen], dependencies=[Depends(autenticar)])
def listar_expedientes(
    cuenta: str | None = Query(default=None, description="Solo los cargados por este usuario"),
    origen: str | None = Query(default=None, description="Solo los de este origen: 'arrendador' o '3b'"),
    usuario: str = Depends(usuario_actual),
) -> list[ExpedienteResumen]:
    """Lista de expedientes, del más reciente al más antiguo, sin el detalle del dictamen."""
    storage.registrar("consulta_lista", usuario, sin_repetir_minutos=5)
    return storage.listar(cuenta=cuenta, origen=origen)


@app.get("/bitacora", response_model=list[EventoBitacora], dependencies=[Depends(autenticar)])
def consultar_bitacora(
    expediente_id: str | None = Query(default=None), actor: str | None = Query(default=None),
    limite: int = Query(default=200, ge=1, le=1000),
) -> list[EventoBitacora]:
    """Bitácora de acciones, de la más reciente a la más antigua. Es de solo lectura."""
    return storage.bitacora(expediente_id=expediente_id, actor=actor, limite=limite)


@app.get("/expedientes/{expediente_id}", response_model=Expediente, dependencies=[Depends(autenticar)])
def consultar_expediente(expediente_id: str, usuario: str = Depends(usuario_actual)) -> Expediente:
    expediente = _expediente(expediente_id)
    if expediente.estado == "listo":  # mientras se procesa, el front consulta cada pocos segundos
        storage.registrar("consulta", usuario, expediente_id, sin_repetir_minutos=5)
    return expediente


@app.post("/expedientes/{expediente_id}/decision", response_model=Decision, dependencies=[Depends(autenticar)])
def decidir_expediente(expediente_id: str, entrada: DecisionEntrada, usuario: str = Depends(usuario_actual)) -> Decision:
    """Registra la decisión humana (aprobado o rechazado). Requiere que el análisis haya terminado."""
    expediente = _expediente(expediente_id)
    if expediente.estado != "listo" or expediente.dictamen is None:
        raise HTTPException(status_code=409, detail="El expediente todavía no tiene dictamen")
    decision = storage.decidir(expediente_id, entrada.valor, usuario, entrada.comentario)
    storage.registrar("decision", usuario, expediente_id,
                      f"{entrada.valor} (recomendación del sistema: {expediente.dictamen.recomendacion})")
    return decision


@app.put(
    "/expedientes/{expediente_id}/documentos/{documento_id}/campos/{nombre}",
    response_model=Expediente,
    dependencies=[Depends(autenticar)],
)
def corregir_campo(expediente_id: str, documento_id: str, nombre: str, entrada: CorreccionEntrada,
                   usuario: str = Depends(usuario_actual)) -> Expediente:
    """Corrige a mano un dato extraído y recalcula el dictamen con el valor nuevo.

    Sirve también para capturar los datos de un documento que el sistema no pudo leer.
    """
    expediente = _expediente(expediente_id)
    if expediente.estado != "listo" or expediente.dictamen is None:
        raise HTTPException(status_code=409, detail="El expediente todavía no tiene dictamen")
    documento = _documento(expediente, documento_id)
    definidos = {n: etiqueta for n, etiqueta, _ in extraccion.CAMPOS.get(documento.tipo, [])}
    if nombre not in definidos:
        raise HTTPException(status_code=404, detail="Ese dato no existe para este tipo de documento")

    if not documento.campos:  # documento ilegible: se crea su ficha vacía para poder capturarla
        documento.campos = [Campo(nombre=n, etiqueta=e, valor=None, confianza=0.0) for n, e in definidos.items()]
    campo = next((c for c in documento.campos if c.nombre == nombre), None)
    if campo is None:
        campo = Campo(nombre=nombre, etiqueta=definidos[nombre], valor=None, confianza=0.0)
        documento.campos.append(campo)

    nuevo = (entrada.valor or "").strip() or None
    anterior = campo.valor
    if nuevo == anterior:
        return expediente
    if not campo.corregido:
        campo.valor_original = anterior
    campo.valor, campo.corregido, campo.sustentado, campo.confianza = nuevo, True, True, 1.0 if nuevo else 0.0

    expediente.dictamen = agentes.recalcular(expediente.documentos)
    storage.guardar(expediente)
    storage.anotar_correccion(expediente_id, documento_id, nombre, anterior, nuevo, usuario, entrada.motivo)
    # En la bitácora va qué dato se corrigió, no su valor: los valores quedan en el historial de correcciones.
    storage.registrar("correccion", usuario, expediente_id,
                      f"{definidos[nombre]} en {documento.archivo}; recomendación: {expediente.dictamen.recomendacion}")
    return _expediente(expediente_id)


@app.get("/expedientes/{expediente_id}/correcciones", response_model=list[Correccion], dependencies=[Depends(autenticar)])
def correcciones_del_expediente(expediente_id: str) -> list[Correccion]:
    _expediente(expediente_id)
    return storage.correcciones(expediente_id)


@app.delete("/expedientes/{expediente_id}", dependencies=[Depends(autenticar)])
def eliminar_expediente(expediente_id: str, usuario: str = Depends(usuario_actual)) -> dict:
    """Elimina el expediente con sus documentos y lecturas. No se puede deshacer."""
    expediente = _expediente(expediente_id)
    if expediente.estado in ("en_cola", "procesando"):
        raise HTTPException(status_code=409, detail="El expediente se está analizando; espera a que termine")
    borrado = storage.eliminar(expediente_id)
    storage.registrar("eliminacion", usuario, expediente_id,
                      f"{borrado['documentos']} documentos y {borrado['lecturas']} lecturas eliminados")
    return {"eliminado": True, **borrado}


@app.get("/expedientes/{expediente_id}/bitacora", response_model=list[EventoBitacora], dependencies=[Depends(autenticar)])
def bitacora_del_expediente(expediente_id: str) -> list[EventoBitacora]:
    if not storage.id_valido(expediente_id):
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    return storage.bitacora(expediente_id=expediente_id)  # también la de expedientes ya eliminados


@app.get(
    "/expedientes/{expediente_id}/documentos/{documento_id}/paginas/{numero}",
    response_class=FileResponse,
    dependencies=[Depends(autenticar)],
)
def imagen_de_pagina(expediente_id: str, documento_id: str, numero: int,
                     usuario: str = Depends(usuario_actual)) -> FileResponse:
    """Imagen JPEG de la página; las cajas de la evidencia están en sus píxeles."""
    documento = _documento(_expediente(expediente_id), documento_id)
    if documento.hash_ocr is None or not any(p.numero == numero for p in documento.paginas):
        raise HTTPException(status_code=404, detail="Página no disponible")
    ruta = ocr.ruta_imagen(documento.hash_ocr, numero)
    if not ruta.exists():
        raise HTTPException(status_code=404, detail="Página no disponible")
    storage.registrar("ver_documento", usuario, expediente_id, f"{documento.archivo}, página {numero}", sin_repetir_minutos=5)
    return FileResponse(ruta, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
