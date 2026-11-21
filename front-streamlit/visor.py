"""Visor de evidencia: muestra la página del documento con el fragmento resaltado.

Primero usa la imagen de página que sirve el back (ya enderezada por el OCR, que es sobre la
que valen las cajas). Si el back no responde, usa el archivo local y busca el texto.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
import streamlit as st

import servicio
import ui

RESALTADO = (1.0, 0.82, 0.2)
BORDE = (0.17, 0.3, 0.49)


def _resaltar(doc: pymupdf.Document, pagina: int, texto: str, caja: tuple | None) -> tuple[bytes, bool]:
    page = doc[min(max(pagina, 1), doc.page_count) - 1]
    r = page.rect
    if caja:
        x0, y0, x1, y1 = caja
        rects = [pymupdf.Rect(r.x0 + x0 * r.width, r.y0 + y0 * r.height,
                              r.x0 + x1 * r.width, r.y0 + y1 * r.height)]
    else:
        # Sin coordenadas: buscar el fragmento (o su inicio) en la capa de texto.
        rects = page.search_for(texto) or page.search_for(texto[:40])
    margen = max(r.width, r.height) / 400
    for rect in rects:
        page.draw_rect(rect + (-margen, -margen, margen, margen), color=BORDE, fill=RESALTADO,
                       fill_opacity=0.35, width=1.2, overlay=True)
    zoom = min(1600 / max(r.width, 1), 3)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
    return pix.tobytes("png"), bool(rects)


@st.cache_data(show_spinner=False, max_entries=64)
def _render_archivo(ruta: str, mtime: float, pagina: int, texto: str,
                    caja: tuple | None) -> tuple[bytes, bool]:
    """`mtime` invalida la caché si el archivo cambia."""
    with pymupdf.open(ruta) as doc:
        return _resaltar(doc, pagina, texto, caja)


@st.cache_data(show_spinner=False, max_entries=64, ttl=3600)
def _imagen_back(back_id: str, doc_id: str, pagina: int) -> bytes | None:
    return servicio.imagen_pagina(back_id, doc_id, pagina)


@st.cache_data(show_spinner=False, max_entries=64)
def _render_imagen(contenido: bytes, texto: str, caja: tuple | None) -> tuple[bytes, bool]:
    # PyMuPDF no dibuja sobre una imagen abierta tal cual: primero se convierte a PDF.
    with pymupdf.open(stream=contenido, filetype="jpeg") as img:
        pdf = img.convert_to_pdf()
    with pymupdf.open("pdf", pdf) as doc:
        return _resaltar(doc, 1, texto, caja)


def mostrar(exp: dict) -> None:
    """Panel del visor. Lee la evidencia activa de st.session_state."""
    ev = st.session_state.get("evidencia_activa")
    if not ev or ev.get("_exp") != exp["id"]:
        st.markdown(
            '<p class="texto-suave">Elige «Ver en el documento» en cualquier hallazgo o dato '
            "para ver aquí la página original con el fragmento resaltado.</p>",
            unsafe_allow_html=True,
        )
        return

    doc = next((d for d in exp["documentos"] if d["id"] == ev["documento"]), None)
    nombre = f"{doc['tipo']} ({doc['archivo']})" if doc else ev["documento"]
    st.markdown(f"**{nombre}**, página {ev['pagina']}")
    st.markdown(ui.fragmento(ev, "Fragmento citado"), unsafe_allow_html=True)
    caja = tuple(ev["caja"]) if ev.get("caja") else None

    try:
        png = None
        if doc and doc.get("imagen"):
            contenido = _imagen_back(doc["imagen"]["expediente"], doc["imagen"]["documento"],
                                     ev["pagina"])
            if contenido:
                png, encontrado = _render_imagen(contenido, ev["texto"], caja)
        if png is None:
            ruta = servicio.ruta_absoluta(doc.get("ruta")) if doc else None
            if not ruta or not Path(ruta).exists():
                st.info("No se pudo obtener la página original, así que solo se muestra el "
                        "fragmento citado.", icon=":material/description:")
                return
            # Las cajas del back valen sobre la página enderezada, no sobre el archivo original:
            # aquí se busca el texto.
            png, encontrado = _render_archivo(str(ruta), Path(ruta).stat().st_mtime, ev["pagina"],
                                              ev["texto"], None if doc.get("imagen") else caja)
    except Exception as e:  # PDF dañado o formato no soportado
        st.error(f"No se pudo abrir la página: {e}")
        return
    if not encontrado:
        st.caption("No se ubicó el fragmento exacto en la página; revísala completa.")
    st.image(png, caption=f"Página {ev['pagina']} de {doc['archivo']}", width="stretch")
