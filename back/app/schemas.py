"""Contrato JSON entre el back y el front.

Las cajas van en píxeles de la imagen que sirve
GET /expedientes/{id}/documentos/{doc_id}/paginas/{n}; cada página informa su
ancho y alto para que el front pueda escalar el resaltado.
"""
from typing import Literal

from pydantic import BaseModel, Field

TipoDocumento = Literal[
    "escrituras", "predial", "alineamiento_numero_oficial", "uso_de_suelo", "desconocido"
]
Recomendacion = Literal["Cumple", "Requiere revisión", "No cumple"]
Estado = Literal["en_cola", "procesando", "listo", "error"]


class Evidencia(BaseModel):
    documento_id: str
    pagina: int = Field(description="Número de página, empezando en 1")
    linea_id: str = Field(description="Identificador de la línea de OCR, p. ej. p3-L17")
    texto: str
    caja: list[float] = Field(description="[x0, y0, x1, y1] en píxeles de la imagen de la página")


class Campo(BaseModel):
    nombre: str
    valor: str | None
    confianza: float = Field(ge=0, le=1)
    evidencia: list[Evidencia] = []


class PaginaInfo(BaseModel):
    numero: int
    ancho: int
    alto: int
    confianza_ocr: float | None = Field(description="Promedio de confianza de las líneas; None si no hay texto")


class Documento(BaseModel):
    id: str
    archivo: str
    tipo: TipoDocumento = "desconocido"
    hash_ocr: str | None = Field(default=None, description="Uso interno: clave del caché de OCR")
    paginas: list[PaginaInfo] = []
    campos: list[Campo] = []


class ValorComparado(BaseModel):
    documento_id: str
    valor: str | None
    evidencia: list[Evidencia] = []


class ValidacionCruzada(BaseModel):
    regla: str
    estado: Literal["ok", "discrepancia", "no_evaluable"]
    detalle: str
    valores: list[ValorComparado] = []


class Requisito(BaseModel):
    nombre: str
    cumple: bool | None = Field(description="None cuando no se pudo evaluar")
    detalle: str
    documento_id: str | None = None
    evidencia: list[Evidencia] = []


class Hallazgo(BaseModel):
    severidad: Literal["alta", "media", "baja"]
    titulo: str
    explicacion: str
    accion_sugerida: str | None = None
    evidencia: list[Evidencia] = []


class Dictamen(BaseModel):
    recomendacion: Recomendacion
    confianza: float = Field(ge=0, le=1)
    resumen: str
    faltantes: list[TipoDocumento] = []
    requisitos: list[Requisito] = []
    validaciones_cruzadas: list[ValidacionCruzada] = []
    hallazgos: list[Hallazgo] = []


class Expediente(BaseModel):
    id: str
    estado: Estado
    etapa: str = Field(default="", description="Texto corto para mostrar el avance")
    error: str | None = None
    documentos: list[Documento] = []
    dictamen: Dictamen | None = Field(default=None, description="Presente cuando el análisis terminó")
