"""Usuarios: el superusuario da de alta trabajadores y elige su área.

Los permisos de cada área están en cuentas.PERMISOS. El superusuario administra cuentas,
pero no ve documentos ni datos de expedientes.
"""

from __future__ import annotations

from html import escape

import streamlit as st

import cuentas
import ui

ICONO_PERFIL = {
    "Superusuario": "admin_panel_settings", "Jurídico": "gavel", "Analista de expansión": "travel_explore",
    "Gestor de trámites": "assignment", "Fiscal": "account_balance", "Gerente": "insights",
    "Auditor": "policy",
}


def _alternar(usuario: str, activo: bool) -> None:
    cuentas.cambiar_estado(usuario, activo)


def usuarios() -> None:
    cuenta = st.session_state["cuenta"]
    ui.encabezado("group", "Usuarios",
                  "Da de alta a los trabajadores de 3B y elige su área. El área define qué "
                  "información del expediente pueden ver.")

    izq, _, der = st.columns([1, 0.08, 1.3])
    with izq:
        with st.container(border=True, key="alta"):
            ui.html(f'<div class="paso-cabeza"><span class="icono">{ui.icono("person_add")}</span>'
                    "<div><h3>Agregar trabajador</h3><p>Recibirá una contraseña temporal.</p>"
                    "</div></div>")
            with st.form("form_alta", clear_on_submit=True, border=False):
                nombre = st.text_input("Nombre completo", autocomplete="off")
                usuario = st.text_input("Usuario", placeholder="nombre.apellido", autocomplete="off")
                perfil = st.selectbox(
                    "Área", [p for p in cuentas.PERFILES_TRABAJADOR if p != "Superusuario"],
                    format_func=lambda p: f"{p}: {cuentas.DESCRIPCION_PERFIL[p]}")
                crear = st.form_submit_button("Agregar trabajador", type="primary",
                                              icon=":material/person_add:", width="stretch")
            if crear:
                if not nombre.strip() or not usuario.strip():
                    st.error("Escribe el nombre y el usuario para agregar al trabajador.")
                else:
                    try:
                        nueva, temporal = cuentas.crear_trabajador(usuario, nombre, perfil)
                        st.success(f"Se agregó a {nueva['nombre']} en {perfil.lower()}. "
                                   f"Contraseña temporal: **{temporal}**. Compártela por un medio "
                                   "seguro; no se volverá a mostrar.",
                                   icon=":material/check_circle:")
                    except ValueError as e:
                        st.error(f"No se pudo agregar: {e}.")

    with der:
        lista = cuentas.trabajadores()
        st.subheader(f"Trabajadores ({len(lista)})")
        for t in lista:
            with st.container(border=True, key=f"usr-{t['usuario']}"):
                c1, c2 = st.columns([3, 1.2], vertical_alignment="center")
                with c1:
                    estado = "" if t["activo"] else " " + ui.badge("Desactivado", "neutra", "block")
                    ui.html(f'<div class="acceso" style="grid-template-columns:2.6rem 1fr">'
                            f'<span class="icono rojo" style="width:2.6rem;height:2.6rem;font-size:1.2rem">'
                            f'{ui.icono(ICONO_PERFIL.get(t["perfil"], "person"))}</span>'
                            f'<span><b>{escape(t["nombre"])}{estado}</b>'
                            f'<span class="desc">{escape(t["perfil"])}, usuario '
                            f'{escape(t["usuario"])}</span></span></div>')
                with c2:
                    if t["usuario"] != cuenta["usuario"]:
                        if t["activo"]:
                            st.button("Desactivar", key=f"off-{t['usuario']}", icon=":material/block:",
                                      on_click=_alternar, args=(t["usuario"], False), width="stretch",
                                      help=f"Quitar el acceso a {t['nombre']}")
                        else:
                            st.button("Activar", key=f"on-{t['usuario']}", icon=":material/check:",
                                      on_click=_alternar, args=(t["usuario"], True), width="stretch")
                    else:
                        ui.html(ui.badge("Tu cuenta", "neutra", "person"))
