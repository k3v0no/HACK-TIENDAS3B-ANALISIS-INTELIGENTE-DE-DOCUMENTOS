"""Puente entre el front y el back (API FastAPI en `back/app/main.py`).

Flujo:
  1. `recibir` guarda los archivos en local, en `modules/cargas/<id>/` (ignorado por git),
     con el tipo de documento que declaró quien los subió.
  2. `iniciar_analisis` los manda a `POST /expedientes` (las fotos se convierten a PDF,
     porque el back solo acepta PDF) y guarda el id del back en `recepcion.json`.
  3. `sincronizar` consulta `GET /expedientes/{id}`; cuando el back termina, traduce su
     dictamen (contrato de `back/app/schemas.py`) al del front (`contrato.Dictamen`) y lo
     guarda en `dictamen.json`.

Configuración por variables de entorno:
  - BACK_URL: dirección del back (por defecto http://127.0.0.1:8000).
  - BACK_API_KEY: la misma clave que `API_KEY` en `back/.env`. Si no está definida y el back
    corre en esta misma computadora, se lee de `back/.env`.
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from pathlib import Path
from statistics import mean

import pymupdf
import requests

from contrato import TIPOS_DOCUMENTO

RAIZ = Path(__file__).resolve().parents[1]
# Se puede cambiar con la variable de entorno EXPEDIENTES_DIR (p. ej. para pruebas).
CARGAS = Path(os.environ.get("EXPEDIENTES_DIR") or RAIZ / "modules" / "cargas")
BACK_URL = (os.environ.get("BACK_URL") or "http://127.0.0.1:8000").rstrip("/")
UMBRAL_LECTURA = 0.7

CARPETA_TIPO = {
    "Escrituras": "escrituras",
    "Predial": "predial",
    "Alineamiento y Número Oficial": "alineamiento",
    "Uso de Suelo": "uso_de_suelo",
}
# Tipo del back (schemas.TipoDocumento) -> tipo del front.
TIPO_BACK = {
    "escrituras": "Escrituras",
    "predial": "Predial",
    "alineamiento_numero_oficial": "Alineamiento y Número Oficial",
    "uso_de_suelo": "Uso de Suelo",
}
NOMBRE_CAMPO = {
    "propietario": "Propietario", "titular": "Titular", "contribuyente": "Contribuyente",
    "direccion": "Dirección", "direccion_oficial": "Dirección oficial",
    "superficie_m2": "Superficie (m²)", "superficie": "Superficie",
    "cuenta_predial": "Cuenta predial", "clave_catastral": "Clave catastral",
    "numero_oficial": "Número oficial", "identificador": "Identificador del inmueble",
    "alineamiento": "Alineamiento", "vigencia": "Vigencia", "fecha_emision": "Fecha de emisión",
    "autoridad_emisora": "Autoridad emisora", "uso_autorizado": "Uso autorizado",
    "compatibilidad_comercial": "Compatibilidad con uso comercial",
    "restricciones": "Restricciones",
}
SEVERIDAD_ORDEN = {"alta": 0, "media": 1, "baja": 2}
ESTADOS_EN_PROCESO = {"en_cola", "procesando"}


# ---------------------------------------------------------------- conexión con el back

def _api_key() -> str:
    clave = os.environ.get("BACK_API_KEY", "")
    if clave:
        return clave
    env = RAIZ / "back" / ".env"
    try:
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.strip().startswith("API_KEY="):
                return linea.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def _cabeceras() -> dict:
    return {"X-API-Key": _api_key()}


_salud = {"t": 0.0, "ok": False}


def back_disponible() -> bool:
    """True si el back responde y hay clave para usarlo. Se recuerda 10 segundos."""
    if time.monotonic() - _salud["t"] < 10:
        return _salud["ok"]
    try:
        ok = bool(_api_key()) and requests.get(f"{BACK_URL}/salud", timeout=1.5).ok
    except requests.RequestException:
        ok = False
    _salud.update(t=time.monotonic(), ok=ok)
    return ok


def imagen_pagina(back_id: str, doc_id: str, pagina: int) -> bytes | None:
    """JPEG de la página tal como la leyó el OCR (las cajas de la evidencia valen sobre ella)."""
    try:
        r = requests.get(f"{BACK_URL}/expedientes/{back_id}/documentos/{doc_id}/paginas/{pagina}",
                         headers=_cabeceras(), timeout=15)
    except requests.RequestException:
        return None
    return r.content if r.ok else None


# ---------------------------------------------------------------- almacenamiento local

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


def estado_back(item: dict) -> dict | None:
    """{"id", "estado", "etapa", "error"} si el expediente ya se mandó al back."""
    return item["recepcion"].get("back")


def en_proceso(item: dict) -> bool:
    b = estado_back(item)
    return bool(b) and b.get("estado") in ESTADOS_EN_PROCESO and not item["dictamen"]


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


# ---------------------------------------------------------------- análisis

def _como_pdf(ruta: Path) -> tuple[str, bytes]:
    """El back solo acepta PDF: las fotos (JPG, PNG) se convierten a un PDF de una página."""
    contenido = ruta.read_bytes()
    if contenido.startswith(b"%PDF"):
        return ruta.name, contenido
    with pymupdf.open(ruta) as img:
        return f"{ruta.stem}.pdf", img.convert_to_pdf()


def iniciar_analisis(exp_id: str) -> dict:
    """Manda los archivos al back y deja el expediente «en cola». Devuelve el estado del back."""
    item = obtener(exp_id)
    if item is None:
        raise FileNotFoundError(f"no existe el expediente {exp_id}")
    carpeta = CARGAS / exp_id
    rec = item["recepcion"]
    envio = [("archivos", (*_como_pdf(carpeta / a["ruta"]), "application/pdf"))
             for a in rec["archivos"]]
    try:
        r = requests.post(f"{BACK_URL}/expedientes", files=envio, headers=_cabeceras(), timeout=120)
    except requests.RequestException as e:
        raise RuntimeError(f"no se pudo conectar con el back en {BACK_URL}") from e
    if not r.ok:
        try:
            detalle = r.json().get("detail")
        except ValueError:
            detalle = None
        raise RuntimeError(detalle or f"el back respondió con error {r.status_code}")
    exp = r.json()
    # El back guarda los documentos en el orden en que se enviaron: así se recupera el tipo
    # declarado de cada uno.
    declarados = {d["id"]: a["tipo"] for d, a in zip(exp["documentos"], rec["archivos"])}
    locales = {d["id"]: str(carpeta / a["ruta"]) for d, a in zip(exp["documentos"], rec["archivos"])}
    rec["back"] = {"id": exp["id"], "estado": exp["estado"], "etapa": exp.get("etapa", ""),
                   "error": exp.get("error"), "declarados": declarados, "locales": locales,
                   "enviado": datetime.now().isoformat(timespec="seconds")}
    _escribir(carpeta / "recepcion.json", rec)
    (carpeta / "dictamen.json").unlink(missing_ok=True)
    return rec["back"]


def sincronizar(exp_id: str) -> dict | None:
    """Pregunta al back cómo va el expediente y guarda el dictamen cuando está listo.

    Si el back no responde, devuelve el expediente tal como estaba.
    """
    item = obtener(exp_id)
    if item is None or not estado_back(item) or item["dictamen"]:
        return item
    rec = item["recepcion"]
    try:
        r = requests.get(f"{BACK_URL}/expedientes/{rec['back']['id']}", headers=_cabeceras(),
                         timeout=10)
        r.raise_for_status()
        exp = r.json()
    except (requests.RequestException, ValueError):
        return item
    rec["back"].update(estado=exp["estado"], etapa=exp.get("etapa", ""), error=exp.get("error"))
    carpeta = CARGAS / exp_id
    _escribir(carpeta / "recepcion.json", rec)
    if exp["estado"] == "listo" and exp.get("dictamen"):
        _escribir(carpeta / "dictamen.json", traducir(exp, rec))
    return obtener(exp_id)


# ---------------------------------------------------------------- traducción de contratos

def _nombre_campo(nombre: str) -> str:
    return NOMBRE_CAMPO.get(nombre, nombre.replace("_", " ").capitalize())


def _numero(valor: str | None) -> float | None:
    try:
        return float(re.sub(r"[^\d.]", "", valor or ""))
    except ValueError:
        return None


def traducir(exp: dict, recepcion: dict) -> dict:
    """Expediente del back (schemas.Expediente) -> dictamen del front (contrato.Dictamen)."""
    back = recepcion.get("back", {})
    declarados = back.get("declarados", {})
    locales = back.get("locales", {})
    d = exp["dictamen"]

    paginas: dict[tuple[str, int], dict] = {}
    for doc in exp["documentos"]:
        for p in doc.get("paginas", []):
            paginas[(doc["id"], p["numero"])] = p

    def ev(e: dict) -> dict:
        p = paginas.get((e["documento_id"], e["pagina"]), {})
        salida = {"documento": e["documento_id"], "pagina": e["pagina"], "linea": e["linea_id"],
                  "texto": e["texto"], "confianza": p.get("confianza_ocr") or 1.0}
        ancho, alto = p.get("ancho"), p.get("alto")
        if ancho and alto and len(e.get("caja", [])) == 4:
            x0, y0, x1, y1 = e["caja"]
            salida["caja"] = [x0 / ancho, y0 / alto, x1 / ancho, y1 / alto]
        return salida

    documentos, datos, alertas, validaciones = [], {}, [], []
    for doc in exp["documentos"]:
        declarado = declarados.get(doc["id"])
        clasificado = TIPO_BACK.get(doc.get("tipo", "desconocido"))
        tipo = clasificado or declarado or "Desconocido"
        if clasificado and declarado and clasificado != declarado:
            validaciones.append({
                "id": f"tipo-{doc['id']}", "nombre": "Tipo de documento", "documento": doc["id"],
                "resultado": "revisar", "evidencia": [],
                "detalle": f"Se subió como {declarado.lower()}, pero el contenido parece de "
                           f"{clasificado.lower()}. Confirma que sea el documento correcto."})
        confs = [p["confianza_ocr"] for p in doc.get("paginas", []) if p.get("confianza_ocr") is not None]
        documentos.append({"id": doc["id"], "tipo": tipo, "archivo": doc["archivo"],
                           "ruta": locales.get(doc["id"]), "paginas": len(doc.get("paginas", [])),
                           "confianza_ocr": mean(confs) if confs else 0.0,
                           "imagen": {"expediente": exp["id"], "documento": doc["id"]}})
        datos[doc["id"]] = [{"campo": _nombre_campo(c["nombre"]), "valor": c.get("valor"),
                             "evidencia": [ev(e) for e in c.get("evidencia", [])]}
                            for c in doc.get("campos", [])]
        for p in doc.get("paginas", []):
            conf = p.get("confianza_ocr")
            if conf is None:
                alertas.append({"documento": doc["id"], "pagina": p["numero"], "confianza": 0.0,
                                "mensaje": "No se encontró texto en esta página. Revisa que la "
                                           "imagen sea legible."})
            elif conf < UMBRAL_LECTURA:
                alertas.append({"documento": doc["id"], "pagina": p["numero"], "confianza": conf,
                                "mensaje": "Revisa esta página en el documento original antes de "
                                           "confiar en los datos que salen de ella."})

    for i, req in enumerate(d.get("requisitos", [])):
        resultado = {True: "cumple", False: "no_cumple"}.get(req.get("cumple"), "revisar")
        validaciones.append({"id": f"req-{i}", "nombre": req["nombre"],
                             "documento": req.get("documento_id"), "resultado": resultado,
                             "detalle": req.get("detalle", ""),
                             "evidencia": [ev(e) for e in req.get("evidencia", [])]})

    inconsistencias = []
    for i, vc in enumerate(d.get("validaciones_cruzadas", [])):
        valores = vc.get("valores", [])
        evidencia = [ev(e) for v in valores for e in v.get("evidencia", [])]
        if vc["estado"] != "discrepancia":
            validaciones.append({"id": f"cruz-{i}", "nombre": vc["regla"], "documento": None,
                                 "resultado": "cumple" if vc["estado"] == "ok" else "revisar",
                                 "detalle": vc.get("detalle", ""), "evidencia": evidencia})
            continue
        campo = re.split(r"\s+coincide", vc["regla"], maxsplit=1)[0]
        inc = {"id": f"cruz-{i}", "campo": campo, "severidad": "media",
               "explicacion": vc.get("detalle", ""),
               "accion_sugerida": "Compara los documentos y pide la aclaración al arrendador.",
               "valores": [{"documento": v["documento_id"], "valor": v.get("valor") or "No encontrado",
                            "evidencia": [ev(e) for e in v.get("evidencia", [])]} for v in valores]}
        nums = [_numero(v.get("valor")) for v in valores]
        if "superficie" in campo.lower() and len(nums) >= 2 and all(nums) and max(nums):
            inc["diferencia_pct"] = round((max(nums) - min(nums)) / max(nums) * 100, 1)
        inconsistencias.append(inc)

    hallazgos = sorted(
        ({"id": f"hal-{i}", "severidad": h["severidad"], "titulo": h["titulo"],
          "explicacion": h["explicacion"], "accion_sugerida": h.get("accion_sugerida"),
          "evidencia": [ev(e) for e in h.get("evidencia", [])]}
         for i, h in enumerate(d.get("hallazgos", []))),
        key=lambda h: SEVERIDAD_ORDEN.get(h["severidad"], 9))

    inmueble = ""
    for doc in sorted(exp["documentos"], key=lambda x: x.get("tipo") != "escrituras"):
        valor = next((c.get("valor") for c in doc.get("campos", [])
                      if c["nombre"].startswith("direccion") and c.get("valor")), None)
        if valor:
            inmueble = valor
            break

    return {
        "id": recepcion["id"],
        "inmueble": inmueble,
        "fecha_analisis": datetime.now().isoformat(timespec="minutes"),
        "recomendacion": d["recomendacion"],
        "confianza": d["confianza"],
        "resumen": d["resumen"],
        "documentos": documentos,
        "faltantes": [TIPO_BACK.get(t, t) for t in d.get("faltantes", [])],
        "datos": datos,
        "validaciones": validaciones,
        "inconsistencias": inconsistencias,
        "alertas_lectura": alertas,
        "hallazgos": hallazgos,
    }
