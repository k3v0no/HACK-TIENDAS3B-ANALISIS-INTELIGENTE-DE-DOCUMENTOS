"""Sistema multiagente del expediente, orquestado con LangGraph.

    clasificador -> extractores -> verificador -> validador por documento
                                                          |
                 dictaminador <- validador cruzado <------+

Los agentes que leen (clasificador, extractores, revisor de uso de suelo, redactor) usan el
LLM. Los que deciden (verificador, validadores, dictaminador) son código con reglas explícitas.
"""
from datetime import date
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from . import extraccion, llm, validacion
from .config import settings
from .reglas import a_fecha, simple
from .schemas import Dictamen, Documento


class Estado(TypedDict, total=False):
    documentos: list[Documento]
    ocr: dict[str, dict]
    hoy: date
    extracciones: dict[str, Any]
    opiniones: dict[str, Any]
    registros: dict[str, validacion.Registro]
    resultados: list[validacion.Resultado]
    dictamen: Dictamen


def _clasificador(estado: Estado) -> Estado:
    for documento in estado["documentos"]:
        lectura = estado["ocr"][documento.id]
        documento.legible = extraccion.es_legible(lectura)
        documento.confianza_ocr = extraccion.confianza_documento(lectura)
        documento.tipo, razon, documento.tipo_detectado = extraccion.clasificar(lectura, documento.archivo)
        documento.observaciones = [razon]
    return {"documentos": estado["documentos"]}


def _extractores(estado: Estado) -> Estado:
    pendientes = [d for d in estado["documentos"] if d.legible and d.tipo in extraccion.TIPOS]
    de_uso = [d for d in pendientes if d.tipo == "uso_de_suelo"]
    lecturas = estado["ocr"]
    # Los extractores y el revisor de uso de suelo trabajan a la vez y sin verse entre sí.
    salidas = extraccion.en_paralelo(
        [lambda d=d: extraccion.extraer(d.tipo, lecturas[d.id]) for d in pendientes]
        + [lambda d=d: extraccion.segunda_opinion_uso(lecturas[d.id]) for d in de_uso]
    )
    extracciones = {}
    for documento, salida in zip(pendientes, salidas):
        if salida is None:
            documento.observaciones.append("El agente extractor no pudo procesar el documento.")
        else:
            extracciones[documento.id] = salida
    opiniones = {d.id: o for d, o in zip(de_uso, salidas[len(pendientes):])}
    return {"extracciones": extracciones, "opiniones": opiniones}


def _verificador(estado: Estado) -> Estado:
    for documento in estado["documentos"]:
        salida = estado["extracciones"].get(documento.id)
        if salida is None:
            continue
        lectura = estado["ocr"][documento.id]
        documento.campos, notas = extraccion.verificar(documento.tipo, salida, lectura, documento.id)
        documento.observaciones.extend(notas)

        if documento.tipo == "uso_de_suelo":
            _contrastar_uso_de_suelo(documento, estado["opiniones"].get(documento.id))
    return {"documentos": estado["documentos"]}


def _contrastar_uso_de_suelo(documento: Documento, opinion) -> None:
    """El revisor da una segunda opinión; si no coincide con el extractor, el dato queda en duda."""
    campo = next((c for c in documento.campos if c.nombre == "compatibilidad_comercial"), None)
    if campo is None:
        return
    if opinion is None:
        documento.observaciones.append("El agente revisor de uso de suelo no respondió; la conclusión no fue contrastada.")
        return
    primera = simple(campo.valor).replace(" ", "_")
    if primera == opinion.compatibilidad:
        documento.observaciones.append(
            f"Extractor y revisor coinciden: uso comercial «{opinion.compatibilidad}». {opinion.razon}")
        return
    documento.observaciones.append(
        f"Extractor («{campo.valor}») y revisor («{opinion.compatibilidad}») no coinciden sobre el uso comercial; "
        f"se deja como no determinable. Revisor: {opinion.razon}")
    campo.valor = "no_determinable"
    campo.confianza = round(campo.confianza * 0.5, 3)
    razon = next((c for c in documento.campos if c.nombre == "razon_compatibilidad"), None)
    if razon is not None:
        razon.valor = (f"Los agentes no coinciden: uno concluye «{primera or 'sin dato'}» y el otro "
                       f"«{opinion.compatibilidad}» ({opinion.razon}).")


def _validador_documentos(estado: Estado) -> Estado:
    registros = validacion.consolidar(estado["documentos"])
    resultados = validacion.validar_documentos(estado["documentos"], registros, estado["hoy"])
    return {"registros": registros, "resultados": resultados}


def _validador_cruzado(estado: Estado) -> Estado:
    cruzados = validacion.validar_cruzado(estado["documentos"], estado["registros"])
    return {"resultados": estado["resultados"] + cruzados}


class _Resumen(BaseModel):
    resumen: str = Field(description="Máximo 3 frases y 70 palabras, en español claro, para el equipo legal")


def _dictaminador(estado: Estado) -> Estado:
    dictamen = validacion.dictaminar(estado["documentos"], estado["resultados"], estado["hoy"])
    if dictamen.hallazgos:
        try:
            puntos = "\n".join(f"- [{h.severidad}] {h.titulo}: {h.explicacion}" for h in dictamen.hallazgos)
            redaccion = llm.con_esquema(_Resumen).invoke(
                "Redacta el resumen de un dictamen de revisión inicial del expediente de un inmueble para una "
                "tienda. La recomendación ya está decidida y no puedes cambiarla. Explica en máximo 3 frases (70 palabras) por "
                "qué se llegó a ella: primero lo más grave y después, agrupado en una frase, lo que queda por "
                "revisar. Debe entenderse sin abrir el expediente. "
                "No añadas hechos que no estén en la lista.\n\n"
                f"Recomendación: {dictamen.recomendacion}\nHallazgos:\n{puntos}"
            )
            if redaccion.resumen.strip():
                dictamen.resumen = redaccion.resumen.strip()
        except Exception:
            pass  # se conserva el resumen armado con reglas
    return {"dictamen": dictamen}


def _construir():
    grafo = StateGraph(Estado)
    grafo.add_node("clasificador", _clasificador)
    grafo.add_node("extractores", _extractores)
    grafo.add_node("verificador", _verificador)
    grafo.add_node("validador_documentos", _validador_documentos)
    grafo.add_node("validador_cruzado", _validador_cruzado)
    grafo.add_node("dictaminador", _dictaminador)
    grafo.add_edge(START, "clasificador")
    grafo.add_edge("clasificador", "extractores")
    grafo.add_edge("extractores", "verificador")
    grafo.add_edge("verificador", "validador_documentos")
    grafo.add_edge("validador_documentos", "validador_cruzado")
    grafo.add_edge("validador_cruzado", "dictaminador")
    grafo.add_edge("dictaminador", END)
    return grafo.compile()


GRAFO = _construir()


def fecha_de_referencia() -> date:
    return a_fecha(settings.fecha_referencia) or date.today()


def recalcular(documentos: list[Documento]) -> Dictamen:
    """Vuelve a validar y dictaminar con los datos actuales (p. ej. tras una corrección manual).

    No relee ni vuelve a extraer: solo corren los validadores y el dictaminador.
    """
    estado: Estado = {"documentos": documentos, "hoy": fecha_de_referencia()}
    estado.update(_validador_documentos(estado))
    estado.update(_validador_cruzado(estado))
    return _dictaminador(estado)["dictamen"]


def analizar(documentos: list[Documento], ocr_por_documento: dict[str, dict]) -> Dictamen:
    """Ejecuta el grafo. Los documentos quedan enriquecidos con su tipo y sus campos."""
    final = GRAFO.invoke({"documentos": documentos, "ocr": ocr_por_documento, "hoy": fecha_de_referencia()})
    return final["dictamen"]
