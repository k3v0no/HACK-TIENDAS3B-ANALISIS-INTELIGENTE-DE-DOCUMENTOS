"""Sistema visual y componentes compartidos.

Paleta de Tiendas 3B (revisada en el CSS de tiendas3b.com, tema Elementor «kit-8»):
  - Rojo 3B #FB0317: aparece en el sitio como fondo de sección. Se usa en superficies de marca
    y acentos grandes. Con texto blanco no llega a 4.5:1, así que los botones usan el rojo
    primario del tema del sitio, #D7121E (cumple WCAG AA con texto blanco).
  - Texto #04211F: color de titulares y secundario del tema del sitio.
  - Fondo #F7F7F7 y verde complementario #94FB03: no aparecen en el sitio; los pidió el equipo.
    El verde se usa solo como relleno con texto oscuro (estados «cargado» o «hecho»).
  - Tipografía: Montserrat, la del sitio de 3B, en títulos; Inter en el texto.
Estilo de componentes inspirado en Watermelon UI (shadcn): superficies blancas, bordes finos,
radios según jerarquía, botones tipo píldora e iconos en cada acción.
"""

from __future__ import annotations

from html import escape

import streamlit as st

from contrato import TIPOS_DOCUMENTO

C = {
    "rojo": "#FB0317",
    "rojo_accion": "#D7121E",
    "rojo_hover": "#B30E18",
    "rojo_suave": "#FFE8EA",
    "verde": "#94FB03",
    "verde_suave": "#EEFFD6",
    "verde_texto": "#2F5B00",
    "ambar_suave": "#FFF4D6",
    "ambar_texto": "#8A5300",
    "fondo": "#F7F7F7",
    "superficie": "#FFFFFF",
    "texto": "#04211F",
    "texto_suave": "#5C6B6A",
    "borde": "#E4E7E7",
}

# Icono (Material Symbols) y descripción de cada documento, en el orden del expediente.
DOC = {
    "Escrituras": ("history_edu", "Escritura pública del inmueble",
                   "Acredita quién es el propietario, dónde está el inmueble y su superficie."),
    "Predial": ("receipt_long", "Boleta o recibo de predial más reciente",
                "Muestra el contribuyente, la clave catastral y la superficie registrada."),
    "Alineamiento y Número Oficial": ("signpost", "Constancia expedida por el municipio",
                                      "Confirma el número oficial y si hay restricciones viales."),
    "Uso de Suelo": ("storefront", "Licencia o constancia de uso de suelo",
                     "Indica si en el inmueble se puede operar una tienda y con qué condiciones."),
}
CORTO = {"Escrituras": "Escrituras", "Predial": "Predial",
         "Alineamiento y Número Oficial": "Alineamiento", "Uso de Suelo": "Uso de suelo"}

ESTADO_RECOMENDACION = {"Cumple": "cumple", "Requiere revisión": "revisar", "No cumple": "no_cumple"}
ICONO_ESTADO = {"cumple": "check_circle", "revisar": "error", "no_cumple": "cancel",
                "pendiente": "hourglass_empty"}
ETIQUETA_RESULTADO = {"cumple": "Cumple", "revisar": "Revisar", "no_cumple": "No cumple"}
UMBRAL_CONFIANZA_BAJA = 0.7

_CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');

:root {{
  --rojo: {C['rojo']}; --rojo-accion: {C['rojo_accion']}; --rojo-hover: {C['rojo_hover']};
  --rojo-suave: {C['rojo_suave']}; --verde: {C['verde']}; --verde-suave: {C['verde_suave']};
  --verde-texto: {C['verde_texto']}; --ambar-suave: {C['ambar_suave']}; --ambar-texto: {C['ambar_texto']};
  --fondo: {C['fondo']}; --superficie: {C['superficie']}; --texto: {C['texto']};
  --texto-suave: {C['texto_suave']}; --borde: {C['borde']}; --radio: 12px;
  --sombra: 0 1px 2px rgba(4,33,31,.05), 0 1px 3px rgba(4,33,31,.04);
}}

html, body, .stApp, .stMarkdown, button, input, textarea, select, label, p, li {{
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}}
.stApp {{ background: var(--fondo); color: var(--texto); }}
.block-container {{ max-width: 1200px; padding-top: 2rem; padding-bottom: 4rem; }}
h1, h2, h3, .titular {{ font-family: 'Montserrat', 'Inter', sans-serif !important; color: var(--texto); }}
h1 {{ font-weight: 800 !important; letter-spacing: -0.025em; line-height: 1.1 !important; }}
h2, h3 {{ font-weight: 700 !important; letter-spacing: -0.015em; }}

.ms {{
  font-family: 'Material Symbols Rounded'; font-weight: normal; font-style: normal;
  font-size: 1.25em; line-height: 1; display: inline-block; vertical-align: -0.22em;
  font-feature-settings: 'liga'; -webkit-font-smoothing: antialiased; user-select: none;
}}
.texto-suave {{ color: var(--texto-suave); font-size: .92rem; line-height: 1.5; }}
.lead {{ font-size: 1.08rem; line-height: 1.6; color: var(--texto-suave); max-width: 62ch; }}

/* ---------- Controles con estilo shadcn ---------- */
.stButton > button, .stFormSubmitButton > button, .stDownloadButton > button {{
  border-radius: 999px; font-weight: 600; padding: .5rem 1.15rem; min-height: 2.6rem;
  border: 1px solid var(--borde); background: var(--superficie); color: var(--texto);
  box-shadow: var(--sombra); transition: background .15s, border-color .15s;
}}
.stButton > button:hover, .stFormSubmitButton > button:hover {{ border-color: #C9CFCF; background: #FAFAFA; color: var(--texto); }}
.stButton > button[kind="primary"], .stFormSubmitButton > button[kind="primary"],
.stButton > button[data-testid="stBaseButton-primary"], .stFormSubmitButton > button[data-testid="stBaseButton-primaryFormSubmit"] {{
  background: var(--rojo-accion); border-color: var(--rojo-accion); color: #fff;
}}
.stButton > button[kind="primary"]:hover, .stFormSubmitButton > button[kind="primary"]:hover,
.stButton > button[data-testid="stBaseButton-primary"]:hover {{ background: var(--rojo-hover); border-color: var(--rojo-hover); color: #fff; }}
.stButton > button:disabled {{ opacity: .45; box-shadow: none; }}
button:focus-visible, input:focus-visible, [tabindex]:focus-visible {{
  outline: 2px solid var(--texto) !important; outline-offset: 2px;
}}
.stTextInput input, .stSelectbox > div > div, .stTextArea textarea {{ border-radius: 10px !important; }}
[data-testid="stFileUploaderDropzone"] {{
  border: 1.5px dashed #C9CFCF; border-radius: var(--radio); background: var(--superficie);
}}
[data-testid="stVerticalBlockBorderWrapper"]:has(> div > [data-testid="stVerticalBlock"]) {{
  border-radius: var(--radio);
}}
div[data-testid="stVerticalBlockBorderWrapper"][class*="st-key-"],
[data-testid="stForm"] {{
  background: var(--superficie); border-color: var(--borde) !important; box-shadow: var(--sombra);
  border-radius: var(--radio) !important;
}}
.stTabs [data-baseweb="tab-list"] {{ gap: .35rem; }}
.stTabs [data-baseweb="tab"] {{ border-radius: 999px; padding: .35rem .9rem; font-weight: 600; }}
.stTabs [aria-selected="true"] {{ background: var(--superficie); box-shadow: var(--sombra); }}
section[data-testid="stSidebar"] {{ background: var(--superficie); border-right: 1px solid var(--borde); }}

/* ---------- Marca ---------- */
.marca3b {{ display: inline-flex; align-items: center; gap: .6rem; font-weight: 700; color: var(--texto); }}
.marca3b .logo {{
  width: 2.4rem; height: 2.4rem; border-radius: 10px; background: var(--rojo); color: #fff;
  display: grid; place-items: center; font-family: 'Montserrat', sans-serif; font-weight: 800;
  font-size: 1.05rem; letter-spacing: -0.04em;
}}
.marca3b small {{ display: block; font-weight: 500; color: var(--texto-suave); font-size: .78rem; }}

/* ---------- Portada ---------- */
.barra-sup {{
  display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;
  padding-bottom: 1rem; border-bottom: 1px solid var(--borde);
}}
.barra-sup .seguro {{ display: inline-flex; align-items: center; gap: .4rem; color: var(--texto-suave); font-size: .88rem; }}
.hero {{ text-align: center; max-width: 46rem; margin: 3.2rem auto 2.2rem; }}
.hero .sello {{
  display: inline-flex; align-items: center; gap: .45rem; padding: .3rem .85rem .3rem .4rem;
  border-radius: 999px; background: var(--superficie); border: 1px solid var(--borde);
  font-size: .86rem; font-weight: 500; color: var(--texto); box-shadow: var(--sombra);
}}
.hero .sello .ms {{
  background: var(--verde); color: var(--texto); border-radius: 50%; width: 1.5rem; height: 1.5rem;
  display: grid; place-items: center; font-size: 1rem;
}}
h1.hero-titulo {{
  font-family: 'Montserrat', sans-serif; font-weight: 800; color: var(--texto);
  font-size: clamp(2.1rem, 5vw, 3.6rem) !important; line-height: 1.06 !important;
  letter-spacing: -0.035em; margin: 1.3rem auto 1rem; padding: 0 !important; max-width: 18ch;
}}
.hero .lead {{ margin: 0 auto; }}
.ingresar-como {{
  text-align: center; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 1.15rem;
  margin: 0 0 1rem; color: var(--texto);
}}

/* Tarjetas clicables: un botón invisible cubre toda la tarjeta (acceso y pasos de carga). */
[class*="st-key-ingreso-"], [class*="st-key-tile-"] {{ position: relative; transition: border-color .15s, box-shadow .15s; }}
[class*="st-key-ingreso-"]:hover, [class*="st-key-tile-"]:hover {{
  border-color: var(--rojo-accion) !important; box-shadow: 0 6px 18px rgba(4,33,31,.08);
}}
[class*="st-key-ingreso-"]:focus-within, [class*="st-key-tile-"]:focus-within {{ outline: 2px solid var(--texto); outline-offset: 3px; }}
[class*="st-key-ingreso-"] [data-testid="stElementContainer"]:has(.stButton),
[class*="st-key-tile-"] [data-testid="stElementContainer"]:has(.stButton) {{
  position: absolute !important; inset: 0 !important; width: auto !important; height: auto !important;
  z-index: 2; margin: 0 !important;
}}
[class*="st-key-ingreso-"] .stButton, [class*="st-key-ingreso-"] .stButton > div,
[class*="st-key-ingreso-"] .stButton > button,
[class*="st-key-tile-"] .stButton, [class*="st-key-tile-"] .stButton > div,
[class*="st-key-tile-"] .stButton > button {{
  width: 100% !important; height: 100% !important;
}}
[class*="st-key-ingreso-"] .stButton > button, [class*="st-key-tile-"] .stButton > button {{
  opacity: 0; cursor: pointer; border-radius: var(--radio);
}}
[class*="st-key-ingreso-sel-"] {{
  border: 2px solid var(--rojo-accion) !important; box-shadow: 0 0 0 4px var(--rojo-suave) !important;
}}

.perfil {{ display: flex; flex-direction: column; gap: .9rem; padding: .4rem .2rem; min-height: 15rem; }}
.perfil .cabeza {{ display: flex; justify-content: space-between; align-items: flex-start; }}
.perfil .icono {{ width: 3.6rem; height: 3.6rem; border-radius: 16px; display: grid; place-items: center; font-size: 1.8rem; }}
.perfil .icono.rojo {{ background: var(--rojo); color: #fff; }}
.perfil .icono.verde {{ background: var(--verde); color: var(--texto); }}
.perfil .marca {{
  width: 1.6rem; height: 1.6rem; border-radius: 50%; border: 2px solid var(--borde);
  display: grid; place-items: center; color: transparent; font-size: 1.05rem;
}}
.perfil.sel .marca {{ background: var(--rojo-accion); border-color: var(--rojo-accion); color: #fff; }}
.perfil h3 {{ margin: 0 !important; padding: 0 !important; font-size: 1.3rem; }}
.perfil p {{ margin: 0; color: var(--texto-suave); font-size: .95rem; line-height: 1.5; }}
.perfil ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }}
.perfil li {{ display: flex; gap: .5rem; align-items: center; font-size: .9rem; color: var(--texto); }}
.perfil li .ms {{ color: var(--verde-texto); font-size: 1.1rem; }}

/* Secuencia del expediente en la portada */
.ruta {{ margin: 3.5rem auto 1rem; max-width: 60rem; text-align: center; }}
.ruta h2 {{ font-size: 1.35rem !important; margin: 0 0 .3rem !important; padding: 0 !important; }}
.ruta > p {{ color: var(--texto-suave); margin: 0 0 1.6rem; }}
.ruta ol {{
  list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(5, 1fr);
  gap: .6rem;
}}
.ruta li {{
  position: relative; display: flex; flex-direction: column; align-items: center; gap: .55rem;
  font-size: .9rem; font-weight: 600; color: var(--texto);
}}
.ruta li:not(:last-child)::after {{
  content: ""; position: absolute; top: 1.6rem; left: calc(50% + 2rem); right: calc(-50% + 2rem);
  border-top: 2px dashed #C9CFCF;
}}
.ruta .icono {{
  width: 3.2rem; height: 3.2rem; border-radius: 50%; display: grid; place-items: center; font-size: 1.45rem;
  background: var(--superficie); border: 1px solid var(--borde); box-shadow: var(--sombra); color: var(--rojo-accion);
}}
.ruta li small {{ display: block; font-weight: 500; color: var(--texto-suave); font-size: .8rem; }}
.ruta li.final .icono {{ background: var(--texto); color: #fff; border-color: var(--texto); }}
.ruta .salidas {{ display: flex; gap: .3rem; flex-wrap: wrap; justify-content: center; }}

/* ---------- Encabezado de página ---------- */
.encabezado {{ display: flex; gap: 1rem; align-items: center; margin: 0 0 1.4rem; }}
.encabezado .icono {{
  width: 3.2rem; height: 3.2rem; border-radius: 14px; display: grid; place-items: center; font-size: 1.6rem;
  background: var(--rojo); color: #fff; flex: none;
}}
.encabezado h1 {{ margin: 0 !important; padding: 0 !important; font-size: clamp(1.6rem, 3vw, 2.1rem) !important; }}
.encabezado p {{ margin: .2rem 0 0; color: var(--texto-suave); max-width: 70ch; }}

/* ---------- Tarjetas de documento en la carga ---------- */
.progreso {{ display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: .5rem; }}
.progreso b {{ font-family: 'Montserrat', sans-serif; }}
.progreso .barra {{ width: 12rem; margin: 0; }}
.progreso .barra i {{ background: var(--verde-texto); }}
.tile {{ display: flex; flex-direction: column; gap: .5rem; min-height: 7.4rem; }}
.tile .fila {{ display: flex; justify-content: space-between; align-items: center; }}
.tile .icono {{
  width: 2.5rem; height: 2.5rem; border-radius: 12px; display: grid; place-items: center; font-size: 1.3rem;
  background: #F1F3F3; color: var(--texto);
}}
.tile .num {{ font-size: .8rem; font-weight: 600; color: var(--texto-suave); }}
.tile b {{ font-size: .95rem; line-height: 1.25; }}
.tile.hecho .icono {{ background: var(--verde); }}
.tile.actual .icono {{ background: var(--rojo); color: #fff; }}
[class*="st-key-tile-"][class*="-actual"] {{
  border: 2px solid var(--rojo-accion) !important; box-shadow: 0 0 0 4px var(--rojo-suave) !important;
}}
.acceso {{ display: grid; grid-template-columns: 3.4rem 1fr 1.5rem; gap: 1rem; align-items: center; }}
.acceso .icono {{
  width: 3.4rem; height: 3.4rem; border-radius: 14px; display: grid; place-items: center; font-size: 1.5rem;
}}
.acceso .icono.rojo {{ background: var(--rojo-suave); color: var(--rojo-accion); }}
.acceso .icono.verde {{ background: var(--verde); color: var(--texto); }}
.acceso b {{ display: block; font-size: 1.05rem; }}
.acceso span.desc {{ color: var(--texto-suave); font-size: .9rem; }}
.acceso .flecha {{ color: var(--texto-suave); }}

/* ---------- Insignias de estado ---------- */
.badge {{
  display: inline-flex; align-items: center; gap: .3rem; padding: .18rem .6rem; border-radius: 999px;
  font-size: .82rem; font-weight: 600; white-space: nowrap;
}}
.badge.cumple {{ background: var(--verde-suave); color: var(--verde-texto); }}
.badge.revisar {{ background: var(--ambar-suave); color: var(--ambar-texto); }}
.badge.no_cumple {{ background: var(--rojo-suave); color: #B0000E; }}
.badge.pendiente, .badge.neutra {{ background: #EEF1F1; color: var(--texto-suave); }}

/* ---------- Resultado del dictamen ---------- */
.resultado {{
  display: flex; gap: 1rem; align-items: center; padding: 1rem 1.2rem; border-radius: var(--radio);
  border: 1px solid var(--borde); background: var(--superficie); box-shadow: var(--sombra);
}}
.resultado .ms {{ font-size: 2.3rem; }}
.resultado b {{ display: block; font-family: 'Montserrat', sans-serif; font-size: 1.25rem; }}
.resultado.cumple {{ border-left: 6px solid var(--verde); }} .resultado.cumple .ms {{ color: var(--verde-texto); }}
.resultado.revisar {{ border-left: 6px solid #F2A900; }} .resultado.revisar .ms {{ color: var(--ambar-texto); }}
.resultado.no_cumple {{ border-left: 6px solid var(--rojo); }} .resultado.no_cumple .ms {{ color: var(--rojo-accion); }}
.resultado.pendiente {{ border-left: 6px dashed #B8C0C0; }} .resultado.pendiente .ms {{ color: var(--texto-suave); }}
.barra {{ height: .4rem; background: #EEF1F1; border-radius: 99px; margin-top: .35rem; width: 10rem; overflow: hidden; }}
.barra i {{ display: block; height: 100%; background: var(--texto); border-radius: 99px; }}

/* ---------- Documentos del expediente (cuatro casillas con icono) ---------- */
.glifo {{ display: inline-flex; gap: 4px; vertical-align: middle; }}
.glifo span {{
  width: 1.9rem; height: 1.9rem; border-radius: 8px; display: grid; place-items: center; font-size: 1.05rem;
}}
.glifo span.si {{ background: var(--verde); color: var(--texto); }}
.glifo span.no {{ border: 1.5px dashed #B8C0C0; color: #9AA5A5; }}

/* ---------- Pasos de carga ---------- */
.pasos {{ display: flex; list-style: none; padding: 0; margin: .4rem 0 1.4rem; gap: .4rem; overflow-x: auto; }}
.pasos li {{ flex: 1; min-width: 7.5rem; display: flex; flex-direction: column; gap: .45rem; font-size: .86rem; color: var(--texto-suave); }}
.pasos .riel {{ height: .3rem; border-radius: 99px; background: var(--borde); }}
.pasos .nombre {{ display: flex; align-items: center; gap: .4rem; font-weight: 600; }}
.pasos .punto {{
  width: 1.7rem; height: 1.7rem; border-radius: 50%; display: grid; place-items: center; flex: none;
  border: 1.5px solid var(--borde); background: var(--superficie); font-size: 1rem;
}}
.pasos li.hecho .riel {{ background: var(--verde); }}
.pasos li.hecho .punto {{ background: var(--verde); border-color: var(--verde); color: var(--texto); }}
.pasos li.hecho {{ color: var(--texto); }}
.pasos li.actual .riel {{ background: var(--rojo-accion); }}
.pasos li.actual .punto {{ border-color: var(--rojo-accion); color: var(--rojo-accion); }}
.pasos li.actual {{ color: var(--texto); }}
.pasos li.omitido .punto {{ border-style: dashed; }}

.paso-cabeza {{ display: flex; gap: 1rem; align-items: flex-start; margin-bottom: .6rem; }}
.paso-cabeza .icono {{
  width: 3rem; height: 3rem; border-radius: 12px; background: var(--rojo-suave); color: var(--rojo-accion);
  display: grid; place-items: center; font-size: 1.5rem; flex: none;
}}
.paso-cabeza h3 {{ margin: 0 !important; padding: 0 !important; font-size: 1.3rem; }}
.paso-cabeza p {{ margin: .15rem 0 0; color: var(--texto-suave); }}

/* ---------- Lista de documentos con estado ---------- */
.lista-docs {{ list-style: none; padding: 0; margin: 0; }}
.lista-docs li {{
  display: grid; grid-template-columns: 2.4rem 1fr auto; gap: .8rem; align-items: center;
  padding: .7rem 0; border-bottom: 1px solid var(--borde);
}}
.lista-docs li:last-child {{ border-bottom: 0; }}
.lista-docs .icono {{
  width: 2.4rem; height: 2.4rem; border-radius: 10px; display: grid; place-items: center;
  background: #F1F3F3; color: var(--texto); font-size: 1.2rem;
}}
.lista-docs li.si .icono {{ background: var(--verde); }}
.lista-docs b {{ display: block; font-weight: 600; }}
.lista-docs small {{ color: var(--texto-suave); font-size: .84rem; overflow-wrap: anywhere; }}

/* ---------- Filas de la bandeja ---------- */
[class*="st-key-fila-"] {{ border-left-width: 5px !important; }}
[class*="st-key-fila-cumple-"] {{ border-left-color: var(--verde) !important; }}
[class*="st-key-fila-revisar-"] {{ border-left-color: #F2A900 !important; }}
[class*="st-key-fila-no_cumple-"] {{ border-left-color: var(--rojo) !important; }}
[class*="st-key-fila-pendiente-"] {{ border-left-color: #B8C0C0 !important; border-left-style: dashed !important; }}

/* ---------- Fragmento citado ---------- */
.fragmento {{
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: .85rem;
  background: #FBFBFB; border: 1px solid var(--borde); border-left: 4px solid var(--texto);
  padding: .5rem .7rem; border-radius: 8px; overflow-wrap: anywhere; color: var(--texto);
}}
.fragmento .origen {{ display: block; font-family: 'Inter', sans-serif; font-size: .76rem; color: var(--texto-suave); margin-bottom: .2rem; }}
.baja-confianza {{ border-left-color: #F2A900; }}
.oculto {{ color: var(--texto-suave); font-style: italic; }}

/* ---------- Usuario en la barra lateral ---------- */
.usuario {{ display: flex; gap: .7rem; align-items: center; margin-bottom: .6rem; }}
.usuario .avatar {{
  width: 2.5rem; height: 2.5rem; border-radius: 50%; background: var(--rojo-suave); color: var(--rojo-accion);
  display: grid; place-items: center; font-weight: 700;
}}
.usuario b {{ display: block; }} .usuario small {{ color: var(--texto-suave); }}

.sidebar-docs {{ font-size: .88rem; }}
.sidebar-docs p {{ margin: 0 0 .4rem; font-weight: 600; }}

@media (max-width: 900px) {{
  .ruta ol {{ grid-template-columns: 1fr; gap: 1rem; }}
  .ruta li {{ flex-direction: row; text-align: left; }}
  .ruta li:not(:last-child)::after {{ display: none; }}
  .perfil {{ min-height: 0; }}
}}
@media (max-width: 640px) {{
  .block-container {{ padding-left: 1rem; padding-right: 1rem; }}
  .hero {{ margin-top: 2rem; }}
  .acceso {{ grid-template-columns: 3rem 1fr; }} .acceso .flecha {{ display: none; }}
}}
@media (prefers-reduced-motion: reduce) {{ * {{ transition: none !important; animation: none !important; }} }}
</style>
"""


def estilos() -> None:
    st.markdown(_CSS, unsafe_allow_html=True)


def html(fragmento_html: str) -> None:
    st.markdown(fragmento_html, unsafe_allow_html=True)


def icono(nombre: str) -> str:
    return f'<span class="ms" aria-hidden="true">{nombre}</span>'


def pct(valor: float) -> str:
    return f"{round(valor * 100)} %"


def marca_3b(subtitulo: str = "Revisión de expedientes") -> str:
    return (f'<div class="marca3b"><span class="logo" aria-hidden="true">3B</span>'
            f'<span>Tiendas 3B<small>{escape(subtitulo)}</small></span></div>')


def encabezado(icono_nombre: str, titulo: str, descripcion: str = "") -> None:
    """Título de página con icono y una línea que dice para qué sirve la página."""
    desc = f"<p>{escape(descripcion)}</p>" if descripcion else ""
    html(f'<div class="encabezado"><span class="icono">{icono(icono_nombre)}</span>'
         f"<div><h1>{escape(titulo)}</h1>{desc}</div></div>")


def badge(texto: str, clase: str = "neutra", icono_nombre: str | None = None) -> str:
    ic = icono(icono_nombre) if icono_nombre else ""
    return f'<span class="badge {clase}">{ic}{escape(texto)}</span>'


def badge_recomendacion(recomendacion: str) -> str:
    clase = ESTADO_RECOMENDACION.get(recomendacion, "revisar")
    return badge(recomendacion, clase, ICONO_ESTADO[clase])


def badge_resultado(resultado: str) -> str:
    return badge(ETIQUETA_RESULTADO[resultado], resultado, ICONO_ESTADO[resultado])


def resultado(recomendacion: str | None, confianza: float | None) -> str:
    if recomendacion is None:
        return (f'<div class="resultado pendiente" role="status">{icono(ICONO_ESTADO["pendiente"])}'
                f'<div><b>Sin analizar</b><span class="texto-suave">Esperando el análisis '
                f"automático</span></div></div>")
    clase = ESTADO_RECOMENDACION.get(recomendacion, "revisar")
    return (f'<div class="resultado {clase}" role="status">{icono(ICONO_ESTADO[clase])}'
            f'<div><b>{escape(recomendacion)}</b><span class="texto-suave">Confianza '
            f'{pct(confianza or 0)}</span><div class="barra" aria-hidden="true">'
            f'<i style="width:{round((confianza or 0) * 100)}%"></i></div></div></div>')


def glifo(tipos_presentes: set[str]) -> str:
    casillas, faltan = [], []
    for tipo in TIPOS_DOCUMENTO:
        si = tipo in tipos_presentes
        if not si:
            faltan.append(CORTO[tipo].lower())
        casillas.append(f'<span class="{"si" if si else "no"}" title="{escape(tipo)}'
                        f'{"" if si else " (falta)"}">{icono(DOC[tipo][0])}</span>')
    etiqueta = f"{4 - len(faltan)} de 4 documentos"
    if faltan:
        etiqueta += ". Falta: " + ", ".join(faltan)
    return f'<span class="glifo" role="img" aria-label="{escape(etiqueta)}">{"".join(casillas)}</span>'


def lista_documentos(filas: list[tuple[str, str, str]]) -> str:
    """filas: (tipo, detalle, estado) con estado en si|no|revisar|''."""
    insignias = {"si": badge("Cargado", "cumple", "check"), "no": badge("Falta", "neutra", "remove"),
                 "revisar": badge("Vencido", "revisar", "schedule"), "": ""}
    items = []
    for tipo, detalle, estado in filas:
        ic = DOC.get(tipo, ("description",))[0]
        items.append(f'<li class="{estado}"><span class="icono">{icono(ic)}</span>'
                     f'<span><b>{escape(tipo)}</b><small>{escape(detalle)}</small></span>'
                     f"{insignias.get(estado, '')}</li>")
    return f'<ul class="lista-docs">{"".join(items)}</ul>'


def pasos(etapas: list[tuple[str, str, str]]) -> str:
    """etapas: (nombre, icono, estado) con estado en hecho|actual|omitido|''."""
    items = []
    for nombre, ic, estado in etapas:
        marca = icono("check") if estado == "hecho" else icono(ic)
        aria = ' aria-current="step"' if estado == "actual" else ""
        sufijo = {"hecho": " (cargado)", "omitido": " (sin archivo)"}.get(estado, "")
        items.append(f'<li class="{estado}"{aria}><span class="riel"></span>'
                     f'<span class="nombre"><span class="punto">{marca}</span>'
                     f'{escape(nombre)}<span class="sr-only" style="position:absolute;left:-9999px">'
                     f"{sufijo}</span></span></li>")
    return f'<ol class="pasos">{"".join(items)}</ol>'


def fragmento(ev: dict, nombre_doc: str) -> str:
    baja = ev.get("confianza", 1) < UMBRAL_CONFIANZA_BAJA
    aviso = f", lectura dudosa ({pct(ev['confianza'])})" if baja else ""
    return (f'<div class="fragmento{" baja-confianza" if baja else ""}">'
            f'<span class="origen">{escape(nombre_doc)}, página {ev["pagina"]}, '
            f'línea {escape(str(ev["linea"]))}{aviso}</span>'
            f"«{escape(ev['texto'])}»</div>")
