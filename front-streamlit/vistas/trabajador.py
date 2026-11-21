"""Vistas del trabajador 3B: bandeja de expedientes y carga de un expediente nuevo."""

from __future__ import annotations

from datetime import datetime
from html import escape

import streamlit as st

import carga
import cuentas
import servicio
import ui
from vistas import detalle

# Revisión por excepción: primero lo que necesita a una persona.
ORDEN = {"Sin analizar": 0, "Requiere revisión": 1, "No cumple": 2, "Analizando": 3, "Cumple": 4}
FILTROS = ["Sin analizar", "Analizando", "Requiere revisión", "No cumple", "Cumple"]


def _fecha(iso: str) -> str:
    return datetime.fromisoformat(iso).strftime("%d/%m/%Y %H:%M")


def _estado(item: dict) -> str:
    d = item["dictamen"]
    if d:
        return d["recomendacion"]
    return "Analizando" if servicio.en_proceso(item) else "Sin analizar"


def _abrir(exp_id: str) -> None:
    st.session_state["expediente_id"] = exp_id
    st.session_state.pop("evidencia_activa", None)


def _fila(item: dict) -> None:
    rec, d = item["recepcion"], item["dictamen"]
    clase = ui.ESTADO_RECOMENDACION.get(d["recomendacion"], "revisar") if d else "pendiente"
    with st.container(border=True, key=f"fila-{clase}-{rec['id']}"):
        c1, c2, c3, c4 = st.columns([3.4, 1.7, 2.1, 1.1], vertical_alignment="center")
        with c1:
            origen = "Enviado por el arrendador" if rec["origen"] == "arrendador" else "Cargado por 3B"
            ui.html(f"<b>{escape(servicio.titulo(item))}</b><br>"
                    f'<span class="texto-suave">{origen}, {_fecha(rec["fecha"])}</span>')
        with c2:
            ui.html(ui.glifo(servicio.tipos_recibidos(rec)))
        with c3:
            if d:
                n = detalle.contar_hallazgos(d)
                ui.html(f'{ui.badge_recomendacion(d["recomendacion"])}<br>'
                        f'<span class="texto-suave">{n} hallazgo{"s" if n != 1 else ""}, '
                        f'confianza {ui.pct(d["confianza"])}</span>')
            elif servicio.en_proceso(item):
                etapa = servicio.estado_back(item).get("etapa") or "En cola"
                ui.html(f'{ui.badge("Analizando", "pendiente", "progress_activity")}<br>'
                        f'<span class="texto-suave">{escape(etapa)}</span>')
            else:
                ui.html(ui.badge("Sin analizar", "pendiente", "hourglass_empty"))
        with c4:
            st.button("Abrir", key=f"abrir-{rec['id']}", on_click=_abrir, args=(rec["id"],),
                      width="stretch", icon=":material/open_in_new:",
                      help=f"Abrir {servicio.titulo(item)}")


def _iniciar(exp_id: str) -> bool:
    """Manda el expediente al back. Devuelve False (y muestra el motivo) si no se pudo."""
    try:
        servicio.iniciar_analisis(exp_id)
    except Exception as e:
        st.error(f"No se pudo enviar a análisis: {e}. Revisa que el back esté encendido e "
                 "inténtalo de nuevo.", icon=":material/cloud_off:")
        return False
    return True


@st.fragment(run_every=3)
def _avance(exp_id: str) -> None:
    """Se actualiza cada 3 segundos hasta que el back termina."""
    item = servicio.sincronizar(exp_id)
    if item is None or not servicio.en_proceso(item):
        st.rerun()
    b = servicio.estado_back(item)
    with st.container(border=True, key="avance"):
        ui.html(f'<div class="paso-cabeza"><span class="icono">{ui.icono("progress_activity")}</span>'
                f"<div><h3>Analizando el expediente</h3><p>{escape(b.get('etapa') or 'En cola')}. "
                "Puedes salir de esta página; el análisis sigue en segundo plano.</p></div></div>")


def _sin_analizar(item: dict, cuenta: dict) -> None:
    rec = item["recepcion"]
    b = servicio.estado_back(item)
    st.button("Volver a la bandeja", icon=":material/arrow_back:",
              on_click=lambda: st.session_state.pop("expediente_id", None))
    izq, der = st.columns([3, 1.4], vertical_alignment="center")
    with izq:
        st.title(servicio.titulo(item))
        ui.html(f'<p class="texto-suave">Recibido el {_fecha(rec["fecha"])}. La dirección del '
                "inmueble se tomará de los documentos al analizarlo.</p>")
    with der:
        ui.html(ui.resultado(None, None))

    if servicio.en_proceso(item):
        _avance(rec["id"])
    elif b and b.get("estado") == "error":
        st.error(f"{b.get('error') or 'El análisis no terminó'}. Revisa que los archivos se abran "
                 "correctamente y vuelve a intentarlo.", icon=":material/error:")
    elif b and b.get("estado") == "listo":
        st.info("Los documentos ya se leyeron, pero el back todavía no entregó un dictamen "
                "(el análisis con agentes aún no está conectado).", icon=":material/info:")

    st.subheader("Documentos recibidos")
    por_tipo: dict[str, list[str]] = {}
    for a in rec["archivos"]:
        por_tipo.setdefault(a["tipo"], []).append(a["nombre"])
    filas = [(t, ", ".join(por_tipo[t]) if t in por_tipo else "No se envió",
              "si" if t in por_tipo else "no") for t in ui.DOC]
    with st.container(border=True, key="docs-recibidos"):
        ui.html(ui.lista_documentos(filas))

    if servicio.en_proceso(item) or not cuentas.puede(cuenta, "expedientes.cargar"):
        return
    disponible = servicio.back_disponible()
    etiqueta = "Volver a analizar" if b else "Analizar expediente"
    if st.button(etiqueta, type="primary", icon=":material/play_arrow:", disabled=not disponible):
        if _iniciar(rec["id"]):
            st.rerun()
    if not disponible:
        st.caption(f"No hay conexión con el back ({servicio.BACK_URL}). Enciéndelo y revisa "
                   "BACK_API_KEY; este botón se activa solo.")


def bandeja() -> None:
    cuenta = st.session_state["cuenta"]
    exp_id = st.session_state.get("expediente_id")
    if exp_id:
        item = servicio.obtener(exp_id)
        if item and item["dictamen"]:
            detalle.mostrar(item["dictamen"], cuenta)
            return
        if item:
            _sin_analizar(item, cuenta)
            return
        st.session_state.pop("expediente_id")

    ui.encabezado("inbox", "Bandeja de expedientes",
                  "Primero aparecen los que necesitan a una persona.")
    items = [servicio.sincronizar(i["recepcion"]["id"]) or i if servicio.en_proceso(i) else i
             for i in servicio.listar()]
    if not items:
        with st.container(border=True, key="bandeja-vacia"):
            ui.html(f'<div class="paso-cabeza"><span class="icono">{ui.icono("inbox")}</span>'
                    "<div><h3>Aún no hay expedientes</h3><p>Aparecerán aquí cuando un arrendador "
                    "envíe sus documentos o cuando cargues uno.</p></div></div>")
            if cuentas.puede(cuenta, "expedientes.cargar"):
                if st.button("Cargar un expediente", type="primary", icon=":material/upload_file:"):
                    st.switch_page(st.session_state["pagina_cargar"])
        return

    conteo = {f: sum(_estado(i) == f for i in items) for f in FILTROS}
    c1, c2 = st.columns([3, 2], vertical_alignment="bottom")
    with c1:
        filtro = st.pills("Filtrar por estado", [f for f in FILTROS if conteo[f]],
                          selection_mode="single", key="filtro_bandeja",
                          format_func=lambda f: f"{f} ({conteo[f]})")
    with c2:
        busqueda = st.text_input("Buscar", placeholder="Dirección o folio",
                                 key="busqueda_bandeja", icon=":material/search:")
    q = busqueda.strip().lower()
    visibles = [i for i in items if (not filtro or _estado(i) == filtro)
                and (not q or q in servicio.titulo(i).lower() or q in i["recepcion"]["id"].lower())]
    visibles.sort(key=lambda i: ORDEN.get(_estado(i), 9))
    if not visibles:
        st.info("Ningún expediente coincide. Quita el filtro o cambia la búsqueda.",
                icon=":material/search_off:")
        return
    pie, boton = st.columns([4, 1], vertical_alignment="center")
    pie.caption(f"{len(visibles)} de {len(items)} expedientes.")
    if any(servicio.en_proceso(i) for i in items):
        boton.button("Actualizar", icon=":material/refresh:", width="stretch",
                     help="Consulta de nuevo el avance de los expedientes en análisis")
    for item in visibles:
        _fila(item)


def cargar() -> None:
    cuenta = st.session_state["cuenta"]
    ui.encabezado("upload_file", "Cargar expediente",
                  "Sube los documentos de un mismo inmueble, uno por paso. La dirección se toma "
                  "de los propios documentos.")
    disponible = servicio.back_disponible()
    docs = carga.asistente("carga3b", "Enviar a análisis" if disponible else "Guardar expediente",
                           ":material/play_arrow:" if disponible else ":material/save:")
    if docs:
        rec = servicio.recibir(docs, origen="3b", cuenta=cuenta["usuario"])
        carga.reiniciar("carga3b")
        enviado = disponible and _iniciar(rec["id"])
        st.toast("Expediente enviado a análisis" if enviado else "Expediente guardado en la bandeja",
                 icon=":material/check_circle:")
        _abrir(rec["id"])
        st.switch_page(st.session_state["pagina_bandeja"])
    if not disponible:
        st.caption(f"No hay conexión con el back ({servicio.BACK_URL}): el expediente se guarda "
                   "y queda en la bandeja como «Sin analizar».")
