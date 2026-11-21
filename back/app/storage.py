"""Persistencia en disco: una carpeta por expediente con su estado en JSON."""
import json
import re
import threading
import uuid
from pathlib import Path

from .config import settings
from .schemas import Expediente

_ID = re.compile(r"^[0-9a-f]{12}$")
_lock = threading.Lock()


def nuevo_id() -> str:
    return uuid.uuid4().hex[:12]


def id_valido(valor: str) -> bool:
    return bool(_ID.match(valor))


def carpeta(expediente_id: str) -> Path:
    if not id_valido(expediente_id):
        raise ValueError("identificador no válido")
    return settings.dir_expedientes / expediente_id


def ruta_pdf(expediente_id: str, documento_id: str) -> Path:
    if not id_valido(documento_id):
        raise ValueError("identificador no válido")
    return carpeta(expediente_id) / "originales" / f"{documento_id}.pdf"


def guardar(expediente: Expediente) -> None:
    destino = carpeta(expediente.id)
    destino.mkdir(parents=True, exist_ok=True)
    temporal = destino / "expediente.json.tmp"
    with _lock:
        temporal.write_text(expediente.model_dump_json(indent=2), encoding="utf-8")
        temporal.replace(destino / "expediente.json")


def cargar(expediente_id: str) -> Expediente | None:
    archivo = carpeta(expediente_id) / "expediente.json"
    with _lock:
        if not archivo.exists():
            return None
        return Expediente.model_validate(json.loads(archivo.read_text(encoding="utf-8")))
