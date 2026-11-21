"""Puente entre el front y el back.

El back debe exponer, en `back/pipeline.py`:

    def analizar_expediente(archivos: list[tuple[pathlib.Path, str]]) -> dict

`archivos` trae la ruta de cada archivo y el tipo de documento que declaró quien lo subió
(uno de contrato.TIPOS_DOCUMENTO). El clasificador del back debe confirmarlo, no asumirlo.
Devuelve un dict con la forma de `contrato.Dictamen`, incluida la dirección del inmueble
(`inmueble`), que se obtiene de los documentos. No hay que tocar nada más del front.

Todo se guarda solo en local, en `modules/cargas/<id>/` (ignorado por git):
  - los archivos subidos, en una subcarpeta por tipo de documento,
  - `recepcion.json`: quién y cuándo subió qué,
  - `dictamen.json`: el resultado del análisis, cuando existe.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from contrato import TIPOS_DOCUMENTO

RAIZ = Path(__file__).resolve().parents[1]
# Se puede cambiar con la variable de entorno EXPEDIENTES_DIR (p. ej. para pruebas).
CARGAS = Path(os.environ.get("EXPEDIENTES_DIR") or RAIZ / "modules" / "cargas")

if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

CARPETA_TIPO = {
    "Escrituras": "escrituras",
    "Predial": "predial",
    "Alineamiento y Número Oficial": "alineamiento",
    "Uso de Suelo": "uso_de_suelo",
}


def _pipeline():
    """Devuelve la función del back, o None si todavía no existe."""
    try:
        from back.pipeline import analizar_expediente  # type: ignore[import-not-found]
    except ImportError:
        return None
    return analizar_expediente


def back_disponible() -> bool:
    return _pipeline() is not None


def _leer(ruta: Path) -> dict | None:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _escribir(ruta: Path, datos: dict) -> None:
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")


def _nuevo_id() -> str:
    base = "EXP-" + datetime.now().strftime("%y%m%d-%H%M%S")
    exp_id, n = base, 1
    while (CARGAS / exp_id).exists():
        n += 1
        exp_id = f"{base}-{n}"
    return exp_id


def listar(cuenta: str | None = None) -> list[dict]:
    """Expedientes guardados, del más reciente al más antiguo.

    Cada elemento: {"recepcion": dict, "dictamen": dict | None}. Con `cuenta`, solo los de
    esa cuenta (alcance «propios» del arrendador).
    """
    if not CARGAS.exists():
        return []
    items = []
    for carpeta in CARGAS.iterdir():
        recepcion = _leer(carpeta / "recepcion.json")
        if not recepcion or (cuenta and recepcion.get("cuenta") != cuenta):
            continue
        items.append({"recepcion": recepcion, "dictamen": _leer(carpeta / "dictamen.json")})
    items.sort(key=lambda i: i["recepcion"]["fecha"], reverse=True)
    return items


def obtener(exp_id: str) -> dict | None:
    if not re.fullmatch(r"[A-Za-z0-9-]+", exp_id or ""):
        return None
    carpeta = CARGAS / exp_id
    recepcion = _leer(carpeta / "recepcion.json")
    if not recepcion:
        return None
    return {"recepcion": recepcion, "dictamen": _leer(carpeta / "dictamen.json")}


def ruta_absoluta(ruta: str | None) -> Path | None:
    if not ruta:
        return None
    p = Path(ruta)
    return p if p.is_absolute() else RAIZ / p


def tipos_recibidos(recepcion: dict) -> set[str]:
    return {a["tipo"] for a in recepcion["archivos"]}


def titulo(item: dict) -> str:
    """Dirección del inmueble si ya se leyó de los documentos; si no, el folio."""
    d = item["dictamen"]
    if d and d.get("inmueble"):
        return d["inmueble"]
    return f"Expediente {item['recepcion']['id']}"


def recibir(documentos: dict[str, list[tuple[str, bytes]]], origen: str, cuenta: str) -> dict:
    """Guarda los archivos por tipo de documento y registra la recepción. No analiza.

    documentos: {tipo: [(nombre_archivo, contenido), ...]}
    """
    exp_id = _nuevo_id()
    carpeta = CARGAS / exp_id
    carpeta.mkdir(parents=True)
    archivos = []
    for tipo in TIPOS_DOCUMENTO:
        for nombre, contenido in documentos.get(tipo, []):
            sub = carpeta / CARPETA_TIPO[tipo]
            sub.mkdir(exist_ok=True)
            nombre = Path(nombre).name
            (sub / nombre).write_bytes(contenido)
            archivos.append({"tipo": tipo, "nombre": nombre,
                             "ruta": f"{CARPETA_TIPO[tipo]}/{nombre}"})
    recepcion = {
        "id": exp_id,
        "origen": origen,
        "cuenta": cuenta,
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "archivos": archivos,
    }
    _escribir(carpeta / "recepcion.json", recepcion)
    return recepcion


def analizar(exp_id: str) -> dict:
    """Corre el back sobre un expediente recibido y guarda el dictamen."""
    pipeline = _pipeline()
    if pipeline is None:
        raise RuntimeError("el análisis automático todavía no está conectado")
    item = obtener(exp_id)
    if item is None:
        raise FileNotFoundError(f"no existe el expediente {exp_id}")
    carpeta = CARGAS / exp_id
    archivos = [(carpeta / a["ruta"], a["tipo"]) for a in item["recepcion"]["archivos"]]
    dictamen = pipeline(archivos)
    dictamen["id"] = exp_id
    dictamen.setdefault("fecha_analisis", datetime.now().isoformat(timespec="minutes"))
    _escribir(carpeta / "dictamen.json", dictamen)
    return dictamen
