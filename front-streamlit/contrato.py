"""Forma del dictamen con la que trabajan las vistas del front.

El back tiene su propio contrato (`back/app/schemas.py`). `servicio.traducir` convierte la
respuesta del back a esta forma; si el back cambia un campo, solo hay que ajustar esa función.

Coordenadas de `caja`: normalizadas de 0 a 1 respecto al ancho y alto de la imagen de la
página ([x0, y0, x1, y1], origen arriba a la izquierda). El back las da en píxeles y
`servicio.traducir` las divide entre el ancho y alto de cada página.
Si no viene `caja`, el visor busca el texto del fragmento en la página.
"""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict

Recomendacion = Literal["Cumple", "Requiere revisión", "No cumple"]
ResultadoValidacion = Literal["cumple", "no_cumple", "revisar"]

TIPOS_DOCUMENTO: list[str] = [
    "Escrituras",
    "Predial",
    "Alineamiento y Número Oficial",
    "Uso de Suelo",
]
RECOMENDACIONES: list[str] = ["Cumple", "Requiere revisión", "No cumple"]


class Evidencia(TypedDict):
    documento: str  # id del documento (Documento.id)
    pagina: int  # empieza en 1
    linea: str  # id de línea del OCR, p. ej. "p3-L17"
    texto: str  # fragmento literal tal como lo leyó el OCR
    confianza: float  # confianza del OCR en esa línea, de 0 a 1
    caja: NotRequired[list[float]]  # [x0, y0, x1, y1] normalizada de 0 a 1


class Documento(TypedDict):
    id: str
    tipo: str  # uno de TIPOS_DOCUMENTO, o "Desconocido"
    archivo: str  # nombre original del archivo
    ruta: NotRequired[str | None]  # ruta local al archivo (relativa a la raíz del repo o absoluta)
    # Imagen de página en el back, sobre la que valen las cajas: {"expediente", "documento"}.
    imagen: NotRequired[dict]
    paginas: int
    confianza_ocr: float  # promedio del documento, de 0 a 1


class Dato(TypedDict):
    campo: str
    valor: str | None  # None = no se encontró
    evidencia: list[Evidencia]


class Validacion(TypedDict):
    id: str
    nombre: str
    documento: str | None  # id del documento, o None si es una regla del expediente
    resultado: ResultadoValidacion
    detalle: str
    evidencia: list[Evidencia]


class ValorEncontrado(TypedDict):
    documento: str
    valor: str
    evidencia: list[Evidencia]


class Inconsistencia(TypedDict):
    id: str
    campo: str
    severidad: Literal["alta", "media", "baja"]
    explicacion: str  # en lenguaje claro: por qué es un problema
    accion_sugerida: str  # qué pedir o revisar para resolverlo
    valores: list[ValorEncontrado]  # qué dice cada documento
    diferencia_pct: NotRequired[float]  # para superficies


class Hallazgo(TypedDict):
    id: str
    severidad: Literal["alta", "media", "baja"]
    titulo: str
    explicacion: str
    accion_sugerida: str | None
    evidencia: list[Evidencia]


class AlertaLectura(TypedDict):
    documento: str
    pagina: int
    confianza: float
    mensaje: str


class Dictamen(TypedDict):
    id: str
    inmueble: str
    region: NotRequired[str]
    fecha_analisis: str  # ISO 8601
    recomendacion: Recomendacion
    confianza: float  # de 0 a 1
    resumen: str  # explicación breve de la recomendación
    documentos: list[Documento]
    faltantes: list[str]  # tipos de documento que no llegaron
    datos: dict[str, list[Dato]]  # por id de documento
    validaciones: list[Validacion]
    inconsistencias: list[Inconsistencia]
    alertas_lectura: list[AlertaLectura]
    hallazgos: NotRequired[list[Hallazgo]]  # resumen redactado por el back, de mayor a menor severidad
    modo_demo: NotRequired[bool]  # True si el resultado son datos de ejemplo


CAMPOS_OBLIGATORIOS = [
    "id", "inmueble", "fecha_analisis", "recomendacion", "confianza", "resumen",
    "documentos", "faltantes", "datos", "validaciones", "inconsistencias", "alertas_lectura",
]


def problemas_de_contrato(d: dict) -> list[str]:
    """Revisión ligera de que el dict del back respeta el contrato. Devuelve los problemas."""
    problemas: list[str] = []
    for campo in CAMPOS_OBLIGATORIOS:
        if campo not in d:
            problemas.append(f"Falta el campo «{campo}».")
    if d.get("recomendacion") not in RECOMENDACIONES:
        problemas.append(f"Recomendación no válida: {d.get('recomendacion')!r}.")
    ids = {doc.get("id") for doc in d.get("documentos", [])}
    for v in d.get("validaciones", []):
        for ev in v.get("evidencia", []):
            if ev.get("documento") not in ids:
                problemas.append(f"La validación {v.get('id')} cita un documento inexistente.")
    return problemas
