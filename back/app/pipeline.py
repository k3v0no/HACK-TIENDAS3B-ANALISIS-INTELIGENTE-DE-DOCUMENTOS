"""Proceso en segundo plano de un expediente: OCR de cada PDF y después análisis."""
import logging

from . import agentes, ocr, storage
from .schemas import PaginaInfo

log = logging.getLogger("expedientes")


def procesar(expediente_id: str) -> None:
    expediente = storage.cargar(expediente_id)
    if expediente is None:
        return
    try:
        expediente.estado = "procesando"
        ocr_por_documento: dict[str, dict] = {}
        total_docs = len(expediente.documentos)

        for i, documento in enumerate(expediente.documentos, start=1):

            def avance(pagina: int, total: int, i: int = i) -> None:
                expediente.etapa = f"Leyendo documento {i} de {total_docs} (página {pagina} de {total})"
                storage.guardar(expediente)

            expediente.etapa = f"Leyendo documento {i} de {total_docs}"
            storage.guardar(expediente)
            resultado = ocr.ocr_pdf(storage.ruta_pdf(expediente_id, documento.id), al_avanzar=avance)
            ocr_por_documento[documento.id] = resultado
            documento.hash_ocr = resultado["hash"]
            documento.paginas = [
                PaginaInfo(
                    numero=p["numero"], ancho=p["ancho"], alto=p["alto"], confianza_ocr=p["confianza_ocr"]
                )
                for p in resultado["paginas"]
            ]

        expediente.etapa = "Analizando el expediente"
        storage.guardar(expediente)
        expediente.dictamen = agentes.analizar(expediente.documentos, ocr_por_documento)

        expediente.estado = "listo"
        expediente.etapa = (
            "Análisis terminado" if expediente.dictamen else "Lectura terminada; análisis pendiente"
        )
        storage.guardar(expediente)
        resultado = expediente.dictamen.recomendacion if expediente.dictamen else "sin dictamen"
        storage.registrar("analisis_terminado", "sistema", expediente_id, f"Recomendación: {resultado}")
    except Exception as exc:
        # Se registra solo el tipo de error: el mensaje podría arrastrar texto de los documentos.
        log.error("Expediente %s falló: %s", expediente_id, type(exc).__name__)
        expediente.estado = "error"
        expediente.error = f"No se pudo procesar el expediente ({type(exc).__name__})"
        storage.guardar(expediente)
        storage.registrar("analisis_error", "sistema", expediente_id, type(exc).__name__)
