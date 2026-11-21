"""Visor de evidencia: muestra la página del documento con el fragmento resaltado."""

from __future__ import annotations

from pathlib import Path

import pymupdf
import streamlit as st

import ui
from servicio import ruta_absoluta

RESALTADO = (1.0, 0.82, 0.2)
BORDE = (0.17, 0.3, 0.49)


@st.cache_data(show_spinner=False, max_entries=64)
def _render(ruta: str, mtime: float, pagina: int, texto: str, caja: tuple | None) -> tuple[bytes, bool]:
    """Devuelve (png, encontrado). `mtime` invalida la caché si el archivo cambia."""
    with pymupdf.open(ruta) as doc:
        page = doc[min(max(pagina, 1), doc.page_count) - 1]
        r = page.rect
        if caja:
            x0, y0, x1, y1 = caja
            rects = [pymupdf.Rect(r.x0 + x0 * r.width, r.y0 + y0 * r.height,
                                  r.x0 + x1 * r.width, r.y0 + y1 * r.height)]
        else:
            # Sin coordenadas: buscar el fragmento (o su inicio) en la capa de texto.
            rects = page.search_for(texto) or page.search_for(texto[:40])
        for rect in rects:
            page.draw_rect(rect + (-3, -3, 3, 3), color=BORDE, fill=RESALTADO,
                           fill_opacity=0.35, width=1.2, overlay=True)
        zoom = 1600 / max(r.width, 1)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(min(zoom, 3), min(zoom, 3)))
        return pix.tobytes("png"), bool(rects)


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

    ruta = ruta_absoluta(doc.get("ruta")) if doc else None
    if not ruta or not Path(ruta).exists():
        st.info(
            "El archivo original no está en esta máquina, así que solo se muestra el "
            "fragmento citado.",
            icon=":material/description:",
        )
        return
    try:
        png, encontrado = _render(str(ruta), Path(ruta).stat().st_mtime, ev["pagina"],
                                  ev["texto"], tuple(ev["caja"]) if ev.get("caja") else None)
    except Exception as e:  # PDF dañado o formato no soportado
        st.error(f"No se pudo abrir la página: {e}")
        return
    if not encontrado:
        st.caption("No se ubicó el fragmento exacto en la página; revísala completa.")
    st.image(png, caption=f"Página {ev['pagina']} de {doc['archivo']}", width="stretch")
