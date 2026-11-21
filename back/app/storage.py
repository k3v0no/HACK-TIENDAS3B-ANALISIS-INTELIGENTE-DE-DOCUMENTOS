"""Persistencia: los expedientes viven en una base de datos; los archivos, en disco.

Por defecto es SQLite en back/data/expedientes.db. Con DATABASE_URL se puede apuntar a otro
motor (p. ej. PostgreSQL) sin cambiar el código. En la base solo se guardan datos; los
documentos originales y las imágenes de página siguen en carpetas.
"""
import json
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Field, Session, SQLModel, create_engine, delete, select

from .config import settings
from .schemas import Correccion, Decision, EventoBitacora, Expediente, ExpedienteResumen

_ID = re.compile(r"^[0-9a-f]{12}$")
_lock = threading.Lock()


class ExpedienteDB(SQLModel, table=True):
    __tablename__ = "expedientes"

    id: str = Field(primary_key=True)
    estado: str = Field(index=True)
    etapa: str = ""
    error: str | None = None
    creado: datetime = Field(index=True)
    actualizado: datetime
    origen: str | None = Field(default=None, index=True)
    cuenta: str | None = Field(default=None, index=True)
    titulo: str = ""
    recomendacion: str | None = Field(default=None, index=True)
    confianza: float | None = None
    n_documentos: int = 0
    datos: str  # el expediente completo en JSON (documentos, campos y dictamen)


class DocumentoDB(SQLModel, table=True):
    __tablename__ = "documentos"

    id: str = Field(primary_key=True)
    expediente_id: str = Field(foreign_key="expedientes.id", index=True)
    archivo: str
    tipo: str = Field(index=True)
    legible: bool = True
    paginas: int = 0


class DecisionDB(SQLModel, table=True):
    __tablename__ = "decisiones"

    id: int | None = Field(default=None, primary_key=True)
    expediente_id: str = Field(foreign_key="expedientes.id", index=True)
    valor: str
    por: str
    comentario: str | None = None
    fecha: datetime = Field(index=True)


class CorreccionDB(SQLModel, table=True):
    """Historial de correcciones manuales: qué valor había y cuál puso la persona."""

    __tablename__ = "correcciones"

    id: int | None = Field(default=None, primary_key=True)
    expediente_id: str = Field(foreign_key="expedientes.id", index=True)
    documento_id: str
    campo: str
    valor_anterior: str | None = None
    valor_nuevo: str | None = None
    por: str
    motivo: str | None = None
    fecha: datetime


class BitacoraDB(SQLModel, table=True):
    """Registro de acciones. Solo se insertan filas: no hay código que las modifique o borre."""

    __tablename__ = "bitacora"

    id: int | None = Field(default=None, primary_key=True)
    fecha: datetime = Field(index=True)
    expediente_id: str | None = Field(default=None, index=True)
    actor: str = Field(index=True)
    accion: str = Field(index=True)
    detalle: str = ""


def _url() -> str:
    if settings.database_url:
        return settings.database_url
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{(settings.data_dir / 'expedientes.db').as_posix()}"


_motor = create_engine(_url(), connect_args={"check_same_thread": False} if _url().startswith("sqlite") else {})


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def nuevo_id() -> str:
    return uuid.uuid4().hex[:12]


def id_valido(valor: str) -> bool:
    return bool(_ID.match(valor))


def carpeta(expediente_id: str) -> Path:
    if not id_valido(expediente_id):
        raise ValueError("identificador no válido")
    return settings.dir_expedientes / expediente_id


def ruta_pdf(expediente_id: str, documento_id: str) -> Path:
    """Ruta del documento original (PDF o imagen; el tipo se detecta por su contenido)."""
    if not id_valido(documento_id):
        raise ValueError("identificador no válido")
    return carpeta(expediente_id) / "originales" / f"{documento_id}.pdf"


def _titulo(expediente: Expediente) -> str:
    """Dirección del inmueble, tomada de las escrituras o del primer documento que la traiga."""
    orden = sorted(expediente.documentos, key=lambda d: d.tipo != "escrituras")
    for documento in orden:
        valores = {c.nombre: c.valor for c in documento.campos if c.valor}
        if valores.get("calle"):
            numero = valores.get("numero_exterior")
            partes = [f"{valores['calle']} {numero}" if numero else valores["calle"],
                      valores.get("colonia"), valores.get("municipio")]
            return ", ".join(p for p in partes if p)
    return ""


def guardar(expediente: Expediente) -> None:
    ahora = _ahora()
    with _lock, Session(_motor) as sesion:
        fila = sesion.get(ExpedienteDB, expediente.id)
        if fila is None:
            fila = ExpedienteDB(id=expediente.id, estado=expediente.estado, creado=ahora, actualizado=ahora, datos="")
            expediente.creado = ahora.isoformat()
        fila.estado = expediente.estado
        fila.etapa = expediente.etapa
        fila.error = expediente.error
        fila.actualizado = ahora
        fila.origen = expediente.origen
        fila.cuenta = expediente.cuenta
        fila.titulo = _titulo(expediente)
        fila.recomendacion = expediente.dictamen.recomendacion if expediente.dictamen else None
        fila.confianza = expediente.dictamen.confianza if expediente.dictamen else None
        fila.n_documentos = len(expediente.documentos)
        fila.datos = expediente.model_dump_json(exclude={"decision"})  # la decisión vive en su tabla
        sesion.add(fila)

        sesion.exec(delete(DocumentoDB).where(DocumentoDB.expediente_id == expediente.id))
        for documento in expediente.documentos:
            sesion.add(DocumentoDB(id=documento.id, expediente_id=expediente.id, archivo=documento.archivo,
                                   tipo=documento.tipo, legible=documento.legible, paginas=len(documento.paginas)))
        sesion.commit()


def cargar(expediente_id: str) -> Expediente | None:
    if not id_valido(expediente_id):
        return None
    with Session(_motor) as sesion:
        fila = sesion.get(ExpedienteDB, expediente_id)
        if fila is None:
            return None
        expediente = Expediente.model_validate_json(fila.datos)
        ultima = sesion.exec(
            select(DecisionDB).where(DecisionDB.expediente_id == expediente_id).order_by(DecisionDB.id.desc())
        ).first()
        if ultima:
            expediente.decision = Decision(valor=ultima.valor, por=ultima.por, comentario=ultima.comentario,
                                           fecha=ultima.fecha.isoformat())
        return expediente


def listar(cuenta: str | None = None, origen: str | None = None, limite: int = 200) -> list[ExpedienteResumen]:
    """Expedientes del más reciente al más antiguo, sin el detalle del dictamen."""
    consulta = select(ExpedienteDB).order_by(ExpedienteDB.creado.desc()).limit(limite)
    if cuenta:
        consulta = consulta.where(ExpedienteDB.cuenta == cuenta)
    if origen:
        consulta = consulta.where(ExpedienteDB.origen == origen)
    with Session(_motor) as sesion:
        filas = sesion.exec(consulta).all()
        decisiones: dict[str, str] = {}
        for d in sesion.exec(select(DecisionDB).order_by(DecisionDB.id)):
            decisiones[d.expediente_id] = d.valor  # la última de cada expediente gana
        return [
            ExpedienteResumen(
                id=f.id, estado=f.estado, etapa=f.etapa, error=f.error, creado=f.creado.isoformat(),
                actualizado=f.actualizado.isoformat(), origen=f.origen, cuenta=f.cuenta, titulo=f.titulo,
                recomendacion=f.recomendacion, confianza=f.confianza, documentos=f.n_documentos,
                decision=decisiones.get(f.id),
            )
            for f in filas
        ]


def decidir(expediente_id: str, valor: str, por: str, comentario: str | None) -> Decision:
    """Registra una decisión. Las anteriores se conservan como historial."""
    ahora = _ahora()
    with _lock, Session(_motor) as sesion:
        sesion.add(DecisionDB(expediente_id=expediente_id, valor=valor, por=por, comentario=comentario, fecha=ahora))
        sesion.commit()
    return Decision(valor=valor, por=por, comentario=comentario, fecha=ahora.isoformat())


def anotar_correccion(expediente_id: str, documento_id: str, campo: str, valor_anterior: str | None,
                      valor_nuevo: str | None, por: str, motivo: str | None) -> None:
    with _lock, Session(_motor) as sesion:
        sesion.add(CorreccionDB(expediente_id=expediente_id, documento_id=documento_id, campo=campo,
                                valor_anterior=valor_anterior, valor_nuevo=valor_nuevo, por=por, motivo=motivo,
                                fecha=_ahora()))
        sesion.commit()


def correcciones(expediente_id: str) -> list[Correccion]:
    """Correcciones de un expediente, de la más reciente a la más antigua."""
    with Session(_motor) as sesion:
        filas = sesion.exec(
            select(CorreccionDB).where(CorreccionDB.expediente_id == expediente_id).order_by(CorreccionDB.id.desc()))
        return [
            Correccion(id=f.id, fecha=f.fecha.replace(tzinfo=timezone.utc).isoformat(), documento_id=f.documento_id,
                       campo=f.campo, valor_anterior=f.valor_anterior, valor_nuevo=f.valor_nuevo, por=f.por,
                       motivo=f.motivo)
            for f in filas
        ]


def eliminar(expediente_id: str) -> dict:
    """Borra un expediente: sus filas, sus documentos originales y el OCR que nadie más usa.

    La bitácora se conserva: debe quedar constancia de que el expediente existió y se eliminó.
    """
    from . import ocr  # aquí para no cargar el motor de OCR al importar el almacenamiento

    with _lock, Session(_motor) as sesion:
        fila = sesion.get(ExpedienteDB, expediente_id)
        if fila is None:
            return {"documentos": 0, "lecturas": 0}
        propios = {d.hash_ocr for d in Expediente.model_validate_json(fila.datos).documentos if d.hash_ocr}
        ajenos: set[str] = set()
        for otra in sesion.exec(select(ExpedienteDB).where(ExpedienteDB.id != expediente_id)):
            ajenos.update(d.hash_ocr for d in Expediente.model_validate_json(otra.datos).documentos if d.hash_ocr)
        n_documentos = fila.n_documentos
        for tabla in (DocumentoDB, DecisionDB, CorreccionDB):
            sesion.exec(delete(tabla).where(tabla.expediente_id == expediente_id))
        sesion.delete(fila)
        sesion.commit()

    shutil.rmtree(carpeta(expediente_id), ignore_errors=True)
    borrables = [h for h in propios - ajenos if re.fullmatch(r"[0-9a-f]{64}", h)]
    for hash_pdf in borrables:
        shutil.rmtree(ocr.carpeta_cache(hash_pdf), ignore_errors=True)
    return {"documentos": n_documentos, "lecturas": len(borrables)}


def registrar(accion: str, actor: str, expediente_id: str | None = None, detalle: str = "",
              sin_repetir_minutos: int = 0) -> None:
    """Añade un evento a la bitácora.

    Con `sin_repetir_minutos` se omite si el mismo actor hizo lo mismo sobre el mismo expediente
    hace poco: evita llenar la bitácora con las consultas automáticas del front.
    """
    ahora = _ahora()
    with _lock, Session(_motor) as sesion:
        if sin_repetir_minutos:
            previo = sesion.exec(
                select(BitacoraDB)
                .where(BitacoraDB.accion == accion, BitacoraDB.actor == actor,
                       BitacoraDB.expediente_id == expediente_id, BitacoraDB.detalle == detalle)
                .order_by(BitacoraDB.id.desc())
            ).first()
            if previo and (ahora - previo.fecha.replace(tzinfo=timezone.utc)).total_seconds() < sin_repetir_minutos * 60:
                return
        sesion.add(BitacoraDB(fecha=ahora, expediente_id=expediente_id, actor=actor, accion=accion, detalle=detalle[:500]))
        sesion.commit()


def bitacora(expediente_id: str | None = None, actor: str | None = None, limite: int = 200) -> list[EventoBitacora]:
    """Eventos del más reciente al más antiguo."""
    consulta = select(BitacoraDB).order_by(BitacoraDB.id.desc()).limit(limite)
    if expediente_id:
        consulta = consulta.where(BitacoraDB.expediente_id == expediente_id)
    if actor:
        consulta = consulta.where(BitacoraDB.actor == actor)
    with Session(_motor) as sesion:
        return [
            EventoBitacora(id=f.id, fecha=f.fecha.replace(tzinfo=timezone.utc).isoformat(),
                           expediente_id=f.expediente_id, actor=f.actor, accion=f.accion, detalle=f.detalle)
            for f in sesion.exec(consulta)
        ]


def marcar_interrumpidos() -> int:
    """Al arrancar: los expedientes que quedaron a medias por un reinicio pasan a error."""
    with _lock, Session(_motor) as sesion:
        filas = sesion.exec(select(ExpedienteDB).where(ExpedienteDB.estado.in_(["en_cola", "procesando"]))).all()
        for fila in filas:
            expediente = Expediente.model_validate_json(fila.datos)
            expediente.estado = "error"
            expediente.error = "El análisis se interrumpió porque el servicio se reinició; vuelve a enviarlo."
            fila.estado, fila.error, fila.datos = expediente.estado, expediente.error, expediente.model_dump_json()
            sesion.add(fila)
        sesion.commit()
        return len(filas)


def _importar_json_antiguos() -> None:
    """Pasa a la base los expedientes guardados como archivo por la versión anterior."""
    if not settings.dir_expedientes.exists():
        return
    for archivo in settings.dir_expedientes.glob("*/expediente.json"):
        try:
            expediente = Expediente.model_validate(json.loads(archivo.read_text(encoding="utf-8")))
            if cargar(expediente.id) is None:
                guardar(expediente)
            archivo.rename(archivo.with_suffix(".json.importado"))
        except Exception:
            continue  # un archivo dañado no debe impedir que el servicio arranque


SQLModel.metadata.create_all(_motor)
_importar_json_antiguos()
