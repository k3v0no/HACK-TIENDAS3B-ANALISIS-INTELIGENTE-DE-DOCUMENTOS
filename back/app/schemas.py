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
    nombre: str = Field(description="Identificador del dato, p. ej. superficie_terreno_m2")
    etiqueta: str = Field(default="", description="Nombre legible del dato para mostrar")
    valor: str | None
    confianza: float = Field(ge=0, le=1)
    sustentado: bool = Field(default=True, description="False si el verificador no encontró el valor en el texto citado")
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
    legible: bool = True
    confianza_ocr: float | None = Field(default=None, description="Promedio de confianza de lectura del documento")
    observaciones: list[str] = Field(default=[], description="Notas del clasificador y del verificador")
    paginas: list[PaginaInfo] = []
    campos: list[Campo] = []


class ValorComparado(BaseModel):
    documento_id: str
    valor: str | None
    evidencia: list[Evidencia] = []


class ValidacionCruzada(BaseModel):
    regla_id: str = ""
    regla: str
    estado: Literal["ok", "discrepancia", "no_evaluable"]
    detalle: str
    valores: list[ValorComparado] = []


class Requisito(BaseModel):
    regla_id: str = Field(default="", description="Identificador de la regla, p. ej. U2")
    nombre: str
    cumple: bool | None = Field(description="None cuando no se pudo evaluar")
    efecto: str = Field(default="", description="Recomendación que provoca si no se cumple")
    detalle: str
    documento_id: str | None = None
    evidencia: list[Evidencia] = []


class Hallazgo(BaseModel):
    regla_id: str = ""
    severidad: Literal["alta", "media", "baja"]
    titulo: str
    explicacion: str
    accion_sugerida: str | None = None
    evidencia: list[Evidencia] = []


class Dictamen(BaseModel):
    recomendacion: Recomendacion
    confianza: float = Field(ge=0, le=1)
    nivel_confianza: Literal["alto", "medio", "bajo"] = "medio"
    fecha_referencia: str = Field(default="", description="Fecha contra la que se evaluaron las vigencias (AAAA-MM-DD)")
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
