"""Vistas del arrendador: envío de documentos por pasos y seguimiento de sus trámites.

Nunca muestra hallazgos internos ni el dictamen (sección 10 del plan): solo qué documentos
ya cargó, en qué paso va el trámite y lo que puede resolver (faltantes o vencidos).
"""

from __future__ import annotations

from datetime import datetime
from html import escape

import streamlit as st

import carga
import servicio
import ui
from contrato import TIPOS_DOCUMENTO

ETAPAS = [("Documentos enviados", "send"), ("Revisión de Tiendas 3B", "manage_search"),
          ("Respuesta", "mark_email_read")]


def _estado_documentos(item: dict) -> tuple[list[tuple[str, str, str]], list[str], int]:
    """(filas por documento, pendientes, etapa actual) sin exponer hallazgos internos."""
    rec, d = item["recepcion"], item["dictamen"]
    por_tipo: dict[str, list[str]] = {}
    for a in rec["archivos"]:
        por_tipo.setdefault(a["tipo"], []).append(a["nombre"])
    vencidos = set()
    if d:
        tipo_de = {doc["id"]: doc["tipo"] for doc in d["documentos"]}
        vencidos = {tipo_de.get(v["documento"]) for v in d["validaciones"]
                    if v["resultado"] == "no_cumple" and "vigen" in v["nombre"].lower()}
    filas, pendientes = [], []
    for tipo in TIPOS_DOCUMENTO:
        if tipo not in por_tipo:
            filas.append((tipo, "No enviado", "no"))
            pendientes.append(f"Enviar {tipo.lower()}: {ui.DOC[tipo][1].lower()}.")
        elif tipo in vencidos:
            filas.append((tipo, ", ".join(por_tipo[tipo]), "revisar"))
            pendientes.append(f"Renovar {tipo.lower()}: el documento que enviaste ya venció.")
        else:
            filas.append((tipo, ", ".join(por_tipo[tipo]), "si"))
    etapa = 2 if d and not pendientes else 1
    return filas, pendientes, etapa


def _etapas_html(actual: int) -> str:
    etapas = [(n, ic, "hecho" if i < actual else "actual" if i == actual else "")
              for i, (n, ic) in enumerate(ETAPAS)]
    return ui.pasos(etapas)


def enviar() -> None:
    cuenta = st.session_state["cuenta"]
    ui.encabezado("upload_file", "Enviar documentos",
                  "Sube los cuatro documentos de tu inmueble, uno por paso. Si aún no tienes "
                  "alguno, continúa y envíalo después.")

    folio = st.session_state.get("ultimo_envio")
    if folio:
        with st.container(border=True, key="envio-ok"):
            ui.html(f'<div class="paso-cabeza"><span class="icono" style="background:var(--verde);'
                    f'color:var(--texto)">{ui.icono("check")}</span><div><h3>Documentos '
                    f"enviados</h3><p>Folio {escape(folio)}. Tiendas 3B revisará tus documentos; "
                    "consulta el avance en «Mis trámites».</p></div></div>")
            c1, c2, _ = st.columns([1, 1, 2])
            if c1.button("Ver mis trámites", type="primary", icon=":material/folder_shared:"):
                st.session_state.pop("ultimo_envio", None)
                st.switch_page(st.session_state["pagina_tramites"])
            if c2.button("Enviar otro inmueble", icon=":material/add:"):
                st.session_state.pop("ultimo_envio", None)
                st.rerun()
        return

    docs = carga.asistente("arr", "Enviar documentos", ":material/send:")
    if docs:
        rec = servicio.recibir(docs, origen="arrendador", cuenta=cuenta["usuario"])
        carga.reiniciar("arr")
        # Si el back está encendido, el análisis arranca ya; si no, 3B lo lanza desde su bandeja.
        if servicio.back_disponible():
            try:
                servicio.iniciar_analisis(rec["id"])
            except Exception:
                pass
        st.session_state["ultimo_envio"] = rec["id"]
        st.rerun()


def tramites() -> None:
    cuenta = st.session_state["cuenta"]
    ui.encabezado("folder_shared", "Mis trámites",
                  "Qué documentos ya cargaste, en qué va la revisión y qué falta.")
    items = [servicio.sincronizar(i["recepcion"]["id"]) or i if servicio.en_proceso(i) else i
             for i in servicio.listar(cuenta=cuenta["usuario"])]
    if not items:
        with st.container(border=True, key="tramites-vacio"):
            ui.html(f'<div class="paso-cabeza"><span class="icono">{ui.icono("folder_open")}</span>'
                    "<div><h3>Todavía no has enviado documentos</h3><p>Cuando lo hagas, aquí verás "
                    "qué documentos ya cargaste y en qué paso va tu trámite.</p></div></div>")
            if st.button("Enviar documentos", type="primary", icon=":material/upload_file:"):
                st.switch_page(st.session_state["pagina_enviar"])
        return

    for item in items:
        rec = item["recepcion"]
        filas, pendientes, etapa = _estado_documentos(item)
        cargados = sum(1 for _, _, e in filas if e in ("si", "revisar"))
        fecha = datetime.fromisoformat(rec["fecha"]).strftime("%d/%m/%Y")
        with st.container(border=True, key=f"tramite-{rec['id']}"):
            izq, der = st.columns([3, 1.3], vertical_alignment="center")
            with izq:
                ui.html(f"<h3 style='margin:0'>{escape(servicio.titulo(item))}</h3>"
                        f'<p class="texto-suave" style="margin:.2rem 0 0">Enviado el {fecha}. '
                        f"Folio {escape(rec['id'])}.</p>")
            with der:
                ui.html(f'<div style="text-align:right">{ui.glifo(servicio.tipos_recibidos(rec))}'
                        f'<br><span class="texto-suave">{cargados} de 4 documentos cargados</span></div>')
            ui.html(_etapas_html(etapa))
            if pendientes:
                st.warning("**Para continuar necesitamos:**\n" +
                           "\n".join(f"- {p}" for p in pendientes),
                           icon=":material/assignment_late:")
            elif etapa == 2:
                st.success("Tus documentos están completos. Tiendas 3B te contactará con la "
                           "respuesta.", icon=":material/check_circle:")
            else:
                st.info("Recibimos tus documentos y los estamos revisando.",
                        icon=":material/manage_search:")
            ui.html(ui.lista_documentos(filas))
