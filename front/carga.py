"""Asistente de carga por pasos: Escrituras → Predial → Alineamiento → Uso de suelo → Enviar.

Cada paso pide un solo tipo de documento, así quien sube no tiene que adivinar qué falta y
el back recibe el tipo declarado de cada archivo. Se puede avanzar sin un documento (el
análisis lo marcará como faltante), regresar a cualquier paso y quitar archivos.
"""

from __future__ import annotations

from html import escape

import streamlit as st

import ui
from contrato import TIPOS_DOCUMENTO

TIPOS_ARCHIVO = ["pdf", "jpg", "jpeg", "png"]
N = len(TIPOS_DOCUMENTO)


def _k(prefijo: str, nombre: str) -> str:
    return f"{prefijo}_{nombre}"


def _estado(prefijo: str):
    ss = st.session_state
    ss.setdefault(_k(prefijo, "paso"), 0)
    ss.setdefault(_k(prefijo, "docs"), {t: [] for t in TIPOS_DOCUMENTO})
    ss.setdefault(_k(prefijo, "omitidos"), set())
    ss.setdefault(_k(prefijo, "n"), 0)
    return ss[_k(prefijo, "docs")], ss[_k(prefijo, "omitidos")]


def reiniciar(prefijo: str) -> None:
    for nombre in ("paso", "docs", "omitidos"):
        st.session_state.pop(_k(prefijo, nombre), None)
    st.session_state[_k(prefijo, "n")] = st.session_state.get(_k(prefijo, "n"), 0) + 1


def _ir(prefijo: str, paso: int) -> None:
    st.session_state[_k(prefijo, "paso")] = max(0, min(paso, N))


def _agregar(prefijo: str, tipo: str, clave: str) -> None:
    docs, omitidos = _estado(prefijo)
    existentes = {nombre for nombre, _ in docs[tipo]}
    for archivo in st.session_state.get(clave) or []:
        if archivo.name not in existentes:
            docs[tipo].append((archivo.name, archivo.getvalue()))
    omitidos.discard(tipo)
    st.session_state[_k(prefijo, "n")] += 1  # limpia el selector de archivos


def _quitar(prefijo: str, tipo: str, indice: int) -> None:
    docs, _ = _estado(prefijo)
    docs[tipo].pop(indice)


def _continuar(prefijo: str, tipo: str, sin_archivo: bool) -> None:
    _, omitidos = _estado(prefijo)
    if sin_archivo:
        omitidos.add(tipo)
    _ir(prefijo, st.session_state[_k(prefijo, "paso")] + 1)


def _tamano(contenido: bytes) -> str:
    kb = len(contenido) / 1024
    return f"{kb / 1024:.1f} MB" if kb >= 1024 else f"{max(kb, 1):.0f} KB"


def _encabezado(prefijo: str, docs: dict, omitidos: set) -> None:
    """Una tarjeta por documento: indica si ya está cargado y lleva a su paso al hacer clic."""
    paso = st.session_state[_k(prefijo, "paso")]
    cargados = sum(1 for t in TIPOS_DOCUMENTO if docs[t])
    ui.html(f'<div class="progreso"><span><b>{cargados} de {N} documentos cargados</b> '
            f'<span class="texto-suave">Elige una tarjeta para ir a ese documento.</span></span>'
            f'<span class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="{N}" '
            f'aria-valuenow="{cargados}"><i style="width:{round(cargados / N * 100)}%"></i></span></div>')
    cols = st.columns(N + 1, gap="small")
    for i, col in enumerate(cols):
        if i < N:
            tipo = TIPOS_DOCUMENTO[i]
            n = len(docs[tipo])
            if n:
                estado, insignia = "hecho", ui.badge(f"{n} archivo{'s' if n > 1 else ''}", "cumple", "check")
            elif tipo in omitidos:
                estado, insignia = "omitido", ui.badge("Después", "revisar", "schedule")
            else:
                estado, insignia = "", ui.badge("Pendiente", "neutra")
            nombre, ic, num, accion = ui.CORTO[tipo], ui.DOC[tipo][0], f"Paso {i + 1}", f"Ir a {tipo}"
        else:
            listo = cargados > 0
            estado = ""
            insignia = ui.badge("Listo", "cumple", "check") if listo else ui.badge("Sin archivos", "neutra")
            nombre, ic, num, accion = "Revisar y enviar", "send", "Final", "Ir a revisar y enviar"
        if i == paso:
            estado = (estado + " actual").strip()
        with col, st.container(border=True, key=f"tile-{prefijo}-{i}-{estado.replace(' ', '-') or 'pend'}"):
            ui.html(f'<div class="tile {estado}"><div class="fila"><span class="icono">{ui.icono(ic)}'
                    f'</span><span class="num">{num}</span></div><b>{escape(nombre)}</b>'
                    f"<span>{insignia}</span></div>")
            st.button(accion, key=f"{prefijo}-ir-{i}", on_click=_ir, args=(prefijo, i))


def asistente(prefijo: str, etiqueta_envio: str, icono_envio: str) -> dict | None:
    """Dibuja el asistente. Devuelve {tipo: [(nombre, bytes)]} cuando se confirma el envío."""
    docs, omitidos = _estado(prefijo)
    paso = st.session_state[_k(prefijo, "paso")]
    _encabezado(prefijo, docs, omitidos)

    if paso < N:
        tipo = TIPOS_DOCUMENTO[paso]
        ic, que, para_que = ui.DOC[tipo]
        with st.container(border=True, key=f"paso-{prefijo}"):
            ui.html(f'<div class="paso-cabeza"><span class="icono">{ui.icono(ic)}</span>'
                    f"<div><h3>Paso {paso + 1} de {N}: {tipo}</h3>"
                    f"<p>{que}. {para_que}</p></div></div>")
            clave = f"{prefijo}-up-{paso}-{st.session_state[_k(prefijo, 'n')]}"
            st.file_uploader(
                f"Archivos de {tipo.lower()}", type=TIPOS_ARCHIVO, accept_multiple_files=True,
                key=clave, on_change=_agregar, args=(prefijo, tipo, clave),
                help="PDF o fotos legibles (JPG, PNG). Incluye todas las páginas.")
            for i, (nombre, contenido) in enumerate(docs[tipo]):
                c1, c2 = st.columns([5, 1.3], vertical_alignment="center")
                with c1:
                    ui.html(f'<span class="ms" aria-hidden="true" style="color:#2F5B00">'
                            f"check_circle</span> <b>{escape(nombre)}</b> "
                            f'<span class="texto-suave">{_tamano(contenido)}</span>')
                c2.button("Quitar", key=f"{prefijo}-quitar-{paso}-{i}", icon=":material/delete:",
                          on_click=_quitar, args=(prefijo, tipo, i), width="stretch",
                          help=f"Quitar {nombre}")

            izq, _, der = st.columns([1, 0.5, 1.6])
            with izq:
                if paso > 0:
                    st.button("Anterior", key=f"{prefijo}-ant", icon=":material/arrow_back:",
                              on_click=_ir, args=(prefijo, paso - 1))
            with der:
                if docs[tipo]:
                    siguiente = "Revisar y enviar" if paso == N - 1 else \
                        f"Continuar con {ui.CORTO[TIPOS_DOCUMENTO[paso + 1]].lower()}"
                    st.button(siguiente, key=f"{prefijo}-sig", type="primary", width="stretch",
                              icon=":material/arrow_forward:", on_click=_continuar,
                              args=(prefijo, tipo, False))
                else:
                    st.button("No lo tengo, continuar", key=f"{prefijo}-omitir", width="stretch",
                              icon=":material/skip_next:", on_click=_continuar,
                              args=(prefijo, tipo, True),
                              help="Podrás enviarlo después; el análisis lo marcará como faltante")
        return None

    # Paso final: revisar y enviar.
    with st.container(border=True, key=f"paso-{prefijo}"):
        ui.html(f'<div class="paso-cabeza"><span class="icono">{ui.icono("fact_check")}</span>'
                "<div><h3>Revisa antes de enviar</h3><p>Puedes regresar a cualquier documento "
                "para agregar o quitar archivos.</p></div></div>")
        faltan = [t for t in TIPOS_DOCUMENTO if not docs[t]]
        filas = []
        for tipo in TIPOS_DOCUMENTO:
            nombres = ", ".join(n for n, _ in docs[tipo])
            filas.append((tipo, nombres or "Sin archivo", "si" if docs[tipo] else "no"))
        ui.html(ui.lista_documentos(filas))
        cols = st.columns(N)
        for i, (col, tipo) in enumerate(zip(cols, TIPOS_DOCUMENTO)):
            col.button(f"Editar {ui.CORTO[tipo].lower()}", key=f"{prefijo}-editar-{i}",
                       icon=":material/edit:", on_click=_ir, args=(prefijo, i), width="stretch")
        if len(faltan) == N:
            st.error("Agrega al menos un documento para poder enviar el expediente.",
                     icon=":material/block:")
        elif faltan:
            st.warning(f"Falta {', '.join(ui.CORTO[t].lower() for t in faltan)}. Puedes enviar "
                       "así, pero el expediente quedará incompleto hasta que lo agregues.",
                       icon=":material/info:")
        enviar = st.button(etiqueta_envio, key=f"{prefijo}-enviar", type="primary",
                           icon=icono_envio, disabled=len(faltan) == N)
    if enviar:
        return {t: list(docs[t]) for t in TIPOS_DOCUMENTO if docs[t]}
    return None
