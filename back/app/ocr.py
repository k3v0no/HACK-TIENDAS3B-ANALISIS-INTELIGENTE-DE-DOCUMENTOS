"""OCR de PDFs con caché en disco.

Cada PDF se identifica por el hash de su contenido. La primera vez se rasteriza
y se pasa por PaddleOCR; después se lee del caché. Por página se guarda la imagen
(ya enderezada, que es sobre la que valen las cajas) y sus líneas de texto.
"""
import hashlib
import json
import threading
from pathlib import Path

import pymupdf as fitz
import numpy as np

from .config import settings

VERSION_CACHE = 1
MIN_CARACTERES_CAPA_TEXTO = 80

_motor = None
_lock = threading.Lock()  # una sola inferencia a la vez: la GPU es de 4 GB


def _crear_motor():
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang=settings.ocr_lang,
        device=settings.ocr_device,
        use_doc_orientation_classify=True,
        use_doc_unwarping=settings.ocr_unwarp,
        use_textline_orientation=True,
    )


def _obtener_motor():
    global _motor
    if _motor is None:
        _motor = _crear_motor()
    return _motor


def hash_archivo(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def tipo_de_archivo(datos: bytes) -> str | None:
    """Tipo según los primeros bytes: 'pdf', 'jpeg', 'png' o None si no se admite."""
    if datos.startswith(b"%PDF"):
        return "pdf"
    if datos.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if datos.startswith(b"\x89PNG"):
        return "png"
    return None


def carpeta_cache(hash_pdf: str) -> Path:
    return settings.dir_ocr / hash_pdf


def ruta_imagen(hash_pdf: str, pagina: int) -> Path:
    return carpeta_cache(hash_pdf) / f"pagina_{pagina:04d}.jpg"


def _caja(poligono) -> list[float]:
    puntos = np.asarray(poligono, dtype=float).reshape(-1, 2)
    x0, y0 = puntos.min(axis=0)
    x1, y1 = puntos.max(axis=0)
    return [round(float(v), 1) for v in (x0, y0, x1, y1)]


def _lineas_capa_texto(pagina: fitz.Page, escala: float) -> list[dict]:
    """Líneas de la capa de texto del PDF, si la tiene (PDF digital, no escaneo)."""
    lineas = []
    for bloque in pagina.get_text("dict")["blocks"]:
        for linea in bloque.get("lines", []):
            texto = "".join(tramo["text"] for tramo in linea["spans"]).strip()
            if texto:
                lineas.append(
                    {
                        "texto": texto,
                        "confianza": 1.0,
                        "caja": [round(v * escala, 1) for v in linea["bbox"]],
                    }
                )
    return lineas


def _lineas_ocr(imagen_bgr: np.ndarray) -> tuple[list[dict], np.ndarray]:
    """Devuelve las líneas y la imagen sobre la que valen sus cajas."""
    with _lock:
        resultado = _obtener_motor().predict(imagen_bgr)[0]

    previo = resultado.get("doc_preprocessor_res")
    if previo is not None and previo.get("output_img") is not None:
        imagen_bgr = np.asarray(previo["output_img"])

    lineas = []
    for texto, confianza, poligono in zip(
        resultado["rec_texts"], resultado["rec_scores"], resultado["rec_polys"]
    ):
        if texto.strip():
            lineas.append(
                {"texto": texto.strip(), "confianza": round(float(confianza), 4), "caja": _caja(poligono)}
            )
    return lineas, imagen_bgr


def _procesar_pagina(pagina: fitz.Page, numero: int, destino: Path) -> dict:
    import cv2

    escala = settings.ocr_dpi / 72
    pix = pagina.get_pixmap(dpi=settings.ocr_dpi, colorspace=fitz.csRGB, alpha=False)
    rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    imagen = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    if len(pagina.get_text("text").strip()) >= MIN_CARACTERES_CAPA_TEXTO:
        origen = "capa_texto"
        lineas = _lineas_capa_texto(pagina, escala)
    else:
        origen = "ocr"
        lineas, imagen = _lineas_ocr(imagen)

    for i, linea in enumerate(lineas, start=1):
        linea["id"] = f"p{numero}-L{i}"

    ok, datos = cv2.imencode(".jpg", imagen, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise RuntimeError(f"no se pudo codificar la imagen de la página {numero}")
    (destino / f"pagina_{numero:04d}.jpg").write_bytes(datos.tobytes())

    confianzas = [linea["confianza"] for linea in lineas]
    return {
        "numero": numero,
        "ancho": int(imagen.shape[1]),
        "alto": int(imagen.shape[0]),
        "origen": origen,
        "confianza_ocr": round(sum(confianzas) / len(confianzas), 4) if confianzas else None,
        "lineas": lineas,
    }


def ocr_pdf(ruta: Path, al_avanzar=None) -> dict:
    """OCR de un PDF completo. Devuelve {hash, paginas: [{numero, ancho, alto, lineas, ...}]}.

    `al_avanzar(pagina, total)` se llama tras cada página, para informar el progreso.
    """
    hash_pdf = hash_archivo(ruta)
    destino = carpeta_cache(hash_pdf)
    indice = destino / "documento.json"

    if indice.exists():
        guardado = json.loads(indice.read_text(encoding="utf-8"))
        if guardado.get("version") == VERSION_CACHE and guardado.get("dpi") == settings.ocr_dpi:
            return guardado

    destino.mkdir(parents=True, exist_ok=True)
    paginas = []
    datos = ruta.read_bytes()
    tipo = tipo_de_archivo(datos)
    if tipo is None:
        raise ValueError("formato de archivo no admitido")
    with fitz.open(stream=datos, filetype=tipo) as pdf:
        total = pdf.page_count
        for numero, pagina in enumerate(pdf, start=1):
            paginas.append(_procesar_pagina(pagina, numero, destino))
            if al_avanzar:
                al_avanzar(numero, total)

    documento = {"version": VERSION_CACHE, "hash": hash_pdf, "dpi": settings.ocr_dpi, "paginas": paginas}
    temporal = destino / "documento.json.tmp"
    temporal.write_text(json.dumps(documento, ensure_ascii=False), encoding="utf-8")
    temporal.replace(indice)
    return documento


def texto_numerado(documento: dict, max_paginas: int | None = None) -> str:
    """Texto para el LLM: una línea por renglón, con su identificador delante."""
    partes = []
    for pagina in documento["paginas"][:max_paginas]:
        partes.append(f"=== Página {pagina['numero']} ===")
        partes.extend(f"[{linea['id']}] {linea['texto']}" for linea in pagina["lineas"])
    return "\n".join(partes)


def buscar_linea(documento: dict, linea_id: str) -> tuple[int, dict] | None:
    """Localiza una línea por su identificador. Devuelve (página, línea)."""
    for pagina in documento["paginas"]:
        for linea in pagina["lineas"]:
            if linea["id"] == linea_id:
                return pagina["numero"], linea
    return None
