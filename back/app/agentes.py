"""Análisis multiagente del expediente (pendiente de implementar con LangGraph).

Entrada: los documentos del expediente y el OCR de cada uno.
Salida: el dictamen; de paso, cada documento queda con su tipo y sus campos.
"""
from .schemas import Dictamen, Documento


def analizar(documentos: list[Documento], ocr_por_documento: dict[str, dict]) -> Dictamen | None:
    """Devuelve None mientras los agentes no estén implementados."""
    return None
