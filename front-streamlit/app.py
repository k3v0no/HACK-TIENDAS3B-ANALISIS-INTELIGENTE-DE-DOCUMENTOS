"""Prototipo de revisión de expedientes, Hackatón Tiendas 3B.

Correr desde la carpeta front/:   streamlit run app.py
"""

from __future__ import annotations

from html import escape

import streamlit as st

import cuentas
import servicio
import ui
from contrato import TIPOS_DOCUMENTO
from vistas import arrendador, superusuario, trabajador

st.set_page_config(page_title="Tiendas 3B | Revisión de expedientes",
                   page_icon=":material/folder_open:", layout="wide")
ui.estilos()

# (icono, color, qué hace, qué puede hacer) por tipo de acceso.
ACCESOS = {
    cuentas.TIPO_TRABAJADOR: ("badge", "rojo", "Para el equipo de Tiendas 3B.",
                              ["Revisa expedientes y hallazgos", "Consulta la evidencia en el documento",
                               "Ve solo lo que permite tu área"]),
    cuentas.TIPO_ARRENDADOR: ("real_estate_agent", "verde", "Para quien ofrece un inmueble en renta.",
                              ["Sube tus cuatro documentos por pasos", "Ve cuáles ya cargaste",
                               "Consulta en qué va tu trámite"]),
}
CLAVE_ACCESO = {cuentas.TIPO_TRABAJADOR: "trabajador", cuentas.TIPO_ARRENDADOR: "arrendador"}


def _elegir(tipo: str | None) -> None:
    st.session_state["acceso"] = tipo
    st.session_state.pop("error_acceso", None)


def _ingresar(tipo: str) -> None:
    usuario = st.session_state.get("login_usuario", "")
    clave = st.session_state.get("login_clave", "")
    cuenta = cuentas.autenticar(usuario, clave, tipo)
    if cuenta:
        st.session_state["cuenta"] = cuenta
        st.session_state.pop("error_acceso", None)
    else:
        st.session_state["error_acceso"] = ("Usuario o contraseña incorrectos. Revisa los datos "
                                            "e inténtalo de nuevo.")


def _tarjetas_acceso(elegido: str | None) -> None:
    ui.html('<p class="ingresar-como">Ingresar como</p>')
    _, centro, _ = st.columns([0.6, 4, 0.6])
    with centro:
        cols = st.columns(2, gap="medium")
        for col, (tipo, (ic, color, desc, puntos)) in zip(cols, ACCESOS.items()):
            sel = tipo == elegido
            clave = ("ingreso-sel-" if sel else "ingreso-") + CLAVE_ACCESO[tipo]
            lista = "".join(f"<li>{ui.icono('check_circle')}{escape(p)}</li>" for p in puntos)
            with col, st.container(border=True, key=clave):
                ui.html(f'<div class="perfil{" sel" if sel else ""}"><div class="cabeza">'
                        f'<span class="icono {color}">{ui.icono(ic)}</span>'
                        f'<span class="marca">{ui.icono("check")}</span></div>'
                        f"<div><h3>{tipo}</h3><p>{desc}</p></div><ul>{lista}</ul></div>")
                st.button(f"Ingresar como {tipo}", key=f"btn-{clave}", on_click=_elegir,
                          args=(tipo,))


def _formulario(tipo: str) -> None:
    ic, color, _, _ = ACCESOS[tipo]
    with st.container(border=True, key="login-caja"):
        ui.html(f'<div class="acceso" style="grid-template-columns:3.4rem 1fr">'
                f'<span class="icono {color}">{ui.icono(ic)}</span>'
                f"<span><b>Ingresar como {tipo}</b>"
                f'<span class="desc">Escribe tu usuario y contraseña.</span></span></div>')
        es_arrendador = tipo == cuentas.TIPO_ARRENDADOR
        pestanas = st.tabs(["Ingresar", "Crear cuenta"]) if es_arrendador else [st.container()]
        with pestanas[0]:
            with st.form("form_login", border=False):
                st.text_input("Usuario", key="login_usuario", autocomplete="username")
                st.text_input("Contraseña", type="password", key="login_clave",
                              autocomplete="current-password")
                st.form_submit_button("Ingresar", type="primary", icon=":material/login:",
                                      on_click=_ingresar, args=(tipo,), width="stretch")
            if st.session_state.get("error_acceso"):
                st.error(st.session_state["error_acceso"], icon=":material/lock:")
        if es_arrendador:
            with pestanas[1]:
                with st.form("form_registro", border=False):
                    nombre = st.text_input("Nombre completo", autocomplete="name")
                    usuario = st.text_input("Usuario", help="Con él ingresarás después",
                                            autocomplete="username")
                    clave = st.text_input("Contraseña", type="password",
                                          help="Al menos 6 caracteres",
                                          autocomplete="new-password")
                    crear = st.form_submit_button("Crear cuenta", type="primary",
                                                  icon=":material/person_add:", width="stretch")
                if crear:
                    if not nombre.strip() or not usuario.strip() or len(clave) < 6:
                        st.error("Completa tu nombre y usuario, y usa una contraseña de al "
                                 "menos 6 caracteres.")
                    else:
                        try:
                            st.session_state["cuenta"] = cuentas.registrar_arrendador(
                                usuario, nombre, clave)
                            st.rerun()
                        except ValueError as e:
                            st.error(f"No se pudo crear la cuenta: {e}.")


def _ruta() -> str:
    pasos = "".join(
        f'<li><span class="icono">{ui.icono(ui.DOC[t][0])}</span>'
        f"<span>{escape(t)}<small>Paso {i}</small></span></li>"
        for i, t in enumerate(TIPOS_DOCUMENTO, start=1))
    salidas = "".join(ui.badge_recomendacion(r) for r in ("Cumple", "Requiere revisión", "No cumple"))
    final = (f'<li class="final"><span class="icono">{ui.icono("gavel")}</span>'
             f'<span>Dictamen<small class="salidas">{salidas}</small></span></li>')
    return (f'<section class="ruta" aria-labelledby="ruta-t"><h2 id="ruta-t">Así se revisa un '
            f"expediente</h2><p>Cada documento se lee en orden y sus datos se comparan entre sí. "
            f"Cada observación cita el documento y el fragmento de donde sale.</p>"
            f"<ol>{pasos}{final}</ol></section>")


def portada() -> None:
    ui.html(f'<div class="barra-sup">{ui.marca_3b()}<span class="seguro">{ui.icono("lock")}'
            "Los documentos se quedan en esta computadora</span></div>")
    ui.html(f'<div class="hero"><span class="sello">{ui.icono("bolt")}Revisión asistida por '
            'agentes de IA</span><h1 class="hero-titulo">Revisión de expedientes de inmuebles'
            '</h1><p class="lead">Sube las escrituras, el predial, el alineamiento y el uso de '
            "suelo. El sistema lee los documentos, compara sus datos y propone si el inmueble "
            "puede continuar, con la evidencia de cada observación.</p></div>")
    tipo = st.session_state.get("acceso")
    _tarjetas_acceso(tipo)
    if tipo:
        _, centro, _ = st.columns([1.3, 2, 1.3])
        with centro:
            _formulario(tipo)
    ui.html(_ruta())


def cerrar_sesion() -> None:
    for clave in list(st.session_state):
        del st.session_state[clave]


cuenta = st.session_state.get("cuenta")

if cuenta is None:
    pagina = st.navigation([st.Page(portada, title="Ingresar", icon=":material/login:")],
                           position="hidden")
else:
    paginas = []
    if cuenta["tipo"] == cuentas.TIPO_ARRENDADOR:
        paginas = [
            st.Page(arrendador.enviar, title="Enviar documentos", icon=":material/upload_file:",
                    url_path="enviar", default=True),
            st.Page(arrendador.tramites, title="Mis trámites", icon=":material/folder_shared:",
                    url_path="tramites"),
        ]
        st.session_state["pagina_enviar"] = paginas[0]
        st.session_state["pagina_tramites"] = paginas[1]
    else:
        if cuentas.puede(cuenta, "expedientes.ver"):
            p = st.Page(trabajador.bandeja, title="Bandeja", icon=":material/inbox:",
                        url_path="bandeja", default=True)
            st.session_state["pagina_bandeja"] = p
            paginas.append(p)
        if cuentas.puede(cuenta, "expedientes.cargar"):
            p = st.Page(trabajador.cargar, title="Cargar expediente",
                        icon=":material/upload_file:", url_path="cargar")
            st.session_state["pagina_cargar"] = p
            paginas.append(p)
        if cuentas.puede(cuenta, "usuarios.admin"):
            paginas.append(st.Page(superusuario.usuarios, title="Usuarios",
                                   icon=":material/group:", url_path="usuarios",
                                   default=not paginas))
    pagina = st.navigation(paginas)
    with st.sidebar:
        ui.html(ui.marca_3b())
        st.divider()
        iniciales = "".join(p[0] for p in cuenta["nombre"].split()[:2]).upper()
        ui.html(f'<div class="usuario"><span class="avatar" aria-hidden="true">{escape(iniciales)}'
                f'</span><span><b>{escape(cuenta["nombre"])}</b>'
                f'<small>{escape(cuenta["perfil"])}</small></span></div>')
        if cuenta["tipo"] == cuentas.TIPO_TRABAJADOR:
            st.caption(cuentas.DESCRIPCION_PERFIL.get(cuenta["perfil"], ""))
        else:
            envios = servicio.listar(cuenta=cuenta["usuario"])
            if envios:
                recibidos = servicio.tipos_recibidos(envios[0]["recepcion"])
                ui.html(f'<div class="sidebar-docs"><p>Tu último envío</p>{ui.glifo(recibidos)} '
                        f'<span class="texto-suave">{len(recibidos)} de 4 cargados</span></div>')
            else:
                st.caption("Aún no has enviado documentos.")
        st.divider()
        st.button("Cerrar sesión", on_click=cerrar_sesion, icon=":material/logout:",
                  width="stretch")

pagina.run()
