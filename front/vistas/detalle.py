"""Detalle de un expediente analizado: resultado, hallazgos, datos, validaciones y evidencia.

Lo que se muestra depende de los permisos del área (cuentas.PERMISOS): un dato sin permiso
aparece oculto y el visor de documentos solo está disponible con «documentos.ver».
"""

from __future__ import annotations

from datetime import datetime
from html import escape

import streamlit as st

import cuentas
import ui
import visor
from contrato import TIPOS_DOCUMENTO

ORDEN_RESULTADO = {"no_cumple": 0, "revisar": 1, "cumple": 2}
OCULTO = "Oculto por permisos"


def _nombre_doc(exp: dict, doc_id: str) -> str:
    doc = next((d for d in exp["documentos"] if d["id"] == doc_id), None)
    return doc["tipo"] if doc else doc_id


def _ve(cuenta: dict, campo: str) -> bool:
    return cuentas.puede(cuenta, cuentas.permiso_de_campo(campo))


def _evidencias(exp: dict, cuenta: dict, evidencias: list[dict], prefijo: str,
                campo: str | None = None) -> None:
    if campo and not _ve(cuenta, campo):
        return
    for i, ev in enumerate(evidencias):
        ui.html(ui.fragmento(ev, _nombre_doc(exp, ev["documento"])))
        if cuentas.puede(cuenta, "documentos.ver"):
            if st.button("Ver en el documento", key=f"{prefijo}-{i}", icon=":material/plagiarism:",
                         help="Abre la página original con el fragmento resaltado"):
                st.session_state["evidencia_activa"] = {**ev, "_exp": exp["id"]}


def _encabezado(exp: dict) -> None:
    izq, der = st.columns([3, 1.4], vertical_alignment="center")
    with izq:
        st.title(exp.get("inmueble") or f"Expediente {exp['id']}")
        fecha = datetime.fromisoformat(exp["fecha_analisis"]).strftime("%d/%m/%Y %H:%M")
        ui.html(f'<p class="texto-suave">Folio {escape(exp["id"])}. Analizado el {fecha}.</p>')
    with der:
        ui.html(ui.resultado(exp["recomendacion"], exp["confianza"]))
    with st.container(border=True, key="resumen-dictamen"):
        recibidos = {d["tipo"] for d in exp["documentos"]}
        faltan = [ui.CORTO[t].lower() for t in TIPOS_DOCUMENTO if t not in recibidos]
        texto = "Expediente completo" if not faltan else "Falta " + ", ".join(faltan)
        ui.html(f'<p style="margin:0 0 .6rem">{ui.glifo(recibidos)} '
                f'<span class="texto-suave" style="margin-left:.5rem">{escape(texto)}</span></p>'
                f'<p class="lead" style="margin:0;color:var(--texto)">{escape(exp["resumen"])}</p>')


def _alertas_lectura(exp: dict) -> None:
    for a in exp.get("alertas_lectura", []):
        st.warning(f"**Lectura dudosa en {_nombre_doc(exp, a['documento'])}, página "
                   f"{a['pagina']}** (confianza {ui.pct(a['confianza'])}). {a['mensaje']}",
                   icon=":material/visibility:")


def _hallazgos(exp: dict, cuenta: dict) -> None:
    incs = exp["inconsistencias"]
    problemas = sorted((v for v in exp["validaciones"] if v["resultado"] != "cumple"),
                       key=lambda v: ORDEN_RESULTADO[v["resultado"]])
    if not incs and not problemas:
        st.success("No hay hallazgos: todas las validaciones se cumplieron.",
                   icon=":material/task_alt:")
        return
    if incs:
        st.subheader("Diferencias entre documentos")
        for inc in incs:
            visible = _ve(cuenta, inc["campo"])
            with st.container(border=True, key=f"inc-{inc['id']}"):
                extra = f" ({inc['diferencia_pct']} % de diferencia)" if "diferencia_pct" in inc else ""
                ui.html(f"{ui.icono('compare_arrows')} <b>{escape(inc['campo'])}</b>{extra}")
                st.markdown(inc["explicacion"])
                cols = st.columns(len(inc["valores"]))
                for col, val in zip(cols, inc["valores"]):
                    with col:
                        st.metric(_nombre_doc(exp, val["documento"]),
                                  val["valor"] if visible else OCULTO)
                        _evidencias(exp, cuenta, val["evidencia"],
                                    f"inc-{inc['id']}-{val['documento']}", inc["campo"])
                ui.html(f'{ui.icono("lightbulb")} <b>Qué hacer:</b> {escape(inc["accion_sugerida"])}')
    if problemas:
        st.subheader("Requisitos no cumplidos o por revisar")
        for v in problemas:
            with st.container(border=True, key=f"hal-{v['id']}"):
                ui.html(f"{ui.badge_resultado(v['resultado'])} <b>{escape(v['nombre'])}</b>")
                st.markdown(v["detalle"])
                _evidencias(exp, cuenta, v["evidencia"], f"hal-{v['id']}")


def _datos(exp: dict, cuenta: dict) -> None:
    for doc in exp["documentos"]:
        datos = exp["datos"].get(doc["id"], [])
        with st.expander(f"{doc['tipo']}: {doc['archivo']}",
                         icon=f":material/{ui.DOC.get(doc['tipo'], ('description',))[0]}:"):
            ui.html(f'<p class="texto-suave">{doc["paginas"]} página(s). Confianza de lectura '
                    f'{ui.pct(doc["confianza_ocr"])}.</p>')
            if not datos:
                st.caption("No se extrajeron datos de este documento.")
            for j, dato in enumerate(datos):
                c1, c2 = st.columns([1, 2])
                c1.markdown(f"**{dato['campo']}**")
                with c2:
                    if not _ve(cuenta, dato["campo"]):
                        ui.html(f'<span class="oculto">{ui.icono("lock")} {OCULTO}</span>')
                    elif dato["valor"] is None:
                        ui.html(ui.badge("No encontrado", "no_cumple", "cancel"))
                    else:
                        st.markdown(dato["valor"])
                        _evidencias(exp, cuenta, dato["evidencia"], f"dato-{doc['id']}-{j}")


def _validaciones(exp: dict, cuenta: dict) -> None:
    conteo = {r: sum(v["resultado"] == r for v in exp["validaciones"]) for r in ORDEN_RESULTADO}
    a, b, c = st.columns(3)
    a.metric("Cumplen", conteo["cumple"])
    b.metric("Por revisar", conteo["revisar"])
    c.metric("No cumplen", conteo["no_cumple"])
    for v in sorted(exp["validaciones"], key=lambda v: ORDEN_RESULTADO[v["resultado"]]):
        with st.container(border=True, key=f"val-{v['id']}"):
            ui.html(f"{ui.badge_resultado(v['resultado'])} <b>{escape(v['nombre'])}</b>")
            st.markdown(v["detalle"])
            if v["evidencia"]:
                with st.expander(f"Evidencia ({len(v['evidencia'])})"):
                    _evidencias(exp, cuenta, v["evidencia"], f"val-{v['id']}")


def mostrar(exp: dict, cuenta: dict) -> None:
    st.button("Volver a la bandeja", icon=":material/arrow_back:",
              on_click=lambda: st.session_state.pop("expediente_id", None))
    _encabezado(exp)
    _alertas_lectura(exp)

    puede_docs = cuentas.puede(cuenta, "documentos.ver")
    principal, panel = (st.columns([3, 2], gap="large") if puede_docs else (st.container(), None))
    with principal:
        n = len(exp["inconsistencias"]) + sum(v["resultado"] != "cumple" for v in exp["validaciones"])
        t1, t2, t3 = st.tabs([f":material/report: Hallazgos ({n})", ":material/dataset: Datos extraídos",
                              ":material/rule: Validaciones"])
        with t1:
            _hallazgos(exp, cuenta)
        with t2:
            _datos(exp, cuenta)
        with t3:
            _validaciones(exp, cuenta)
    if panel is not None:
        with panel:
            with st.container(border=True, key="panel-evidencia"):
                ui.html(f"<h3 style='margin-top:0'>{ui.icono('plagiarism')} Evidencia</h3>")
                visor.mostrar(exp)
    else:
        st.caption("Tu perfil no incluye ver los documentos originales; los fragmentos citados "
                   "sí se muestran.")

    if cuentas.puede(cuenta, "dictamen.decidir"):
        st.subheader("Tu decisión")
        c1, c2, _ = st.columns([1, 1, 2])
        if c1.button("Aprobar para continuar", type="primary", icon=":material/thumb_up:"):
            st.toast("Decisión registrada: aprobado para continuar", icon=":material/check_circle:")
        if c2.button("Rechazar expediente", icon=":material/thumb_down:"):
            st.toast("Decisión registrada: rechazado", icon=":material/cancel:")
        st.caption("Prototipo: la decisión no se guarda todavía.")
