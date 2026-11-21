"""Agentes de clasificación, extracción y verificación.

- Clasificador: palabras clave; si hay duda, pregunta al LLM.
- Extractores: uno por tipo de documento; cada dato cita las líneas de OCR donde aparece.
- Verificador: comprueba en código que cada valor esté en las líneas citadas.
- Revisor de uso de suelo: segunda opinión independiente sobre la compatibilidad comercial.
"""
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from pydantic import BaseModel, Field, create_model
from rapidfuzz import fuzz

from . import llm, ocr
from .config import settings
from .reglas import CONFIANZA_MINIMA_LEGIBLE, normalizar
from .schemas import Campo, Evidencia

TIPOS = ["escrituras", "predial", "alineamiento_numero_oficial", "uso_de_suelo"]
NOMBRE_TIPO = {
    "escrituras": "Escrituras",
    "predial": "Predial",
    "alineamiento_numero_oficial": "Alineamiento y Número Oficial",
    "uso_de_suelo": "Uso de Suelo",
    "desconocido": "Documento no identificado",
}

# ------------------------------------------------------------------ clasificador

_CLAVES = {
    "escrituras": ["notario", "notaria", "instrumento", "escritura", "compraventa", "doy fe",
                   "comparec", "clausulas", "testimonio", "otorgante", "titulo de propiedad",
                   "usucapion", "adjudicacion"],
    "predial": ["predial", "tesoreria", "recibo oficial", "valor catastral", "bimestre",
                "contribuyente", "linea de captura", "total pagado"],
    "alineamiento_numero_oficial": ["alineamiento", "numero oficial", "lineamiento"],
    "uso_de_suelo": ["uso de suelo", "uso del suelo", "usos de suelo", "usos del suelo",
                     "giro autorizado", "zonificacion", "licencia de uso"],
}
_PISTAS_NOMBRE = {
    "escrituras": ["escritura"],
    "predial": ["predial"],
    "alineamiento_numero_oficial": ["alineamiento", "alineamianto", "numero oficial"],
    "uso_de_suelo": ["uso de suelo", "uso del suelo"],
}


class _Clasificacion(BaseModel):
    tipo: Literal["escrituras", "predial", "alineamiento_numero_oficial", "uso_de_suelo", "desconocido"]
    razon: str = Field(description="Una frase que explique la decisión")
    que_es: str = Field(description="Qué documento es, en pocas palabras y sin datos personales, p. ej. "
                                    "'constancia de estudios' o 'recibo de luz'")


def _texto_plano(documento_ocr: dict, max_paginas: int = 3) -> tuple[str, str]:
    """Devuelve (encabezado, cuerpo) normalizados: el encabezado pesa más al clasificar."""
    lineas = [l["texto"] for p in documento_ocr["paginas"][:max_paginas] for l in p["lineas"]]
    return normalizar(" ".join(lineas[:15])), normalizar(" ".join(lineas))


def confianza_documento(documento_ocr: dict) -> float | None:
    valores = [l["confianza"] for p in documento_ocr["paginas"] for l in p["lineas"]]
    return round(sum(valores) / len(valores), 4) if valores else None


def es_legible(documento_ocr: dict) -> bool:
    """Ilegible si casi no hay texto o si se leyó con muy poca confianza."""
    caracteres = sum(len(l["texto"]) for p in documento_ocr["paginas"] for l in p["lineas"])
    confianza = confianza_documento(documento_ocr)
    return caracteres >= 150 and confianza is not None and confianza >= CONFIANZA_MINIMA_LEGIBLE


def clasificar(documento_ocr: dict, nombre_archivo: str) -> tuple[str, str, str | None]:
    """Devuelve (tipo, explicación, qué documento parece ser si no es de los esperados)."""
    encabezado, cuerpo = _texto_plano(documento_ocr)
    puntos = {
        tipo: sum(3 * encabezado.count(c) + min(cuerpo.count(c), 5) for c in claves)
        for tipo, claves in _CLAVES.items()
    }
    orden = sorted(puntos.items(), key=lambda par: par[1], reverse=True)
    (mejor, p1), (_, p2) = orden[0], orden[1]

    if p1 >= 4 and p1 >= 2 * max(p2, 1):
        return mejor, "Identificado por los términos del propio documento.", None

    if es_legible(documento_ocr):
        try:
            respuesta = llm.con_esquema(_Clasificacion).invoke(
                "Clasifica este documento de un expediente inmobiliario mexicano en uno de estos tipos: "
                "escrituras (título de propiedad del inmueble: instrumento notarial, o bien sentencia, resolución "
                "judicial o administrativa que adjudica o reconoce la propiedad), predial (recibo, boleta o certificación del "
                "impuesto predial), alineamiento_numero_oficial (constancia de alineamiento y/o de número "
                "oficial), uso_de_suelo (licencia, constancia o dictamen de uso de suelo). Si no es ninguno, "
                "responde desconocido.\n\n" + ocr.texto_numerado(documento_ocr, max_paginas=3)[:12000]
            )
            if respuesta.tipo != "desconocido":
                return respuesta.tipo, f"Clasificado por el agente de lectura: {respuesta.razon}", None
            # Se leyó bien y no es ninguno de los cuatro: el nombre del archivo no puede contradecirlo.
            que_es = respuesta.que_es.strip().rstrip(".") or "otro tipo de documento"
            return "desconocido", f"No es un documento del expediente: {respuesta.razon}", que_es
        except Exception:
            pass

    nombre = normalizar(nombre_archivo)
    for tipo, pistas in _PISTAS_NOMBRE.items():
        if any(p in nombre for p in pistas):
            return tipo, "El contenido no permite identificarlo; se tomó el tipo del nombre del archivo.", None
    return "desconocido", "No se pudo identificar el tipo de documento.", None


# ------------------------------------------------------------------- extractores

_UBICACION = [
    ("calle", "Calle", "Nombre de la calle o vialidad del inmueble, sin el número"),
    ("numero_exterior", "Número exterior", "Número exterior del inmueble tal como aparece en su dirección; 'S/N' si dice sin número"),
    ("colonia", "Colonia", "Colonia, barrio o fraccionamiento del inmueble"),
    ("municipio", "Municipio", "Municipio o alcaldía donde está el inmueble"),
    ("estado", "Estado", "Entidad federativa del inmueble"),
    ("lote_manzana", "Lote y manzana", "Lote y manzana si se indican"),
    ("clave_catastral", "Clave catastral o cuenta predial", "Clave catastral o cuenta predial del inmueble, tal como aparece"),
]
_VIGENCIA = [
    ("fecha_emision", "Fecha de emisión", "Fecha de expedición del documento en formato AAAA-MM-DD"),
    ("vigencia_hasta", "Vigente hasta", "Fecha de vencimiento expresa en formato AAAA-MM-DD; null si el documento no da una fecha concreta"),
    ("vigencia_plazo_meses", "Plazo de vigencia (meses)", "Si la vigencia se expresa como plazo ('un año a partir de su expedición'), el número de meses, p. ej. 12; null si no"),
    ("autoridad_emisora", "Autoridad emisora", "Dependencia y municipio que emiten el documento"),
    ("folio", "Folio", "Folio o número de oficio del documento"),
    ("firma_o_sello", "Firma o sello", "'si' si aparece el nombre o cargo del funcionario que firma, o un sello de la autoridad; 'no' en caso contrario"),
]

CAMPOS: dict[str, list[tuple[str, str, str]]] = {
    "escrituras": [
        ("titular", "Propietario o titular", "Nombre completo de quien ADQUIERE el inmueble (comprador, donatario, adjudicatario). Nunca el vendedor. Si son varios, sepáralos con ';'"),
        ("transmitente", "Quien transmite", "Nombre de quien vende o transmite el inmueble"),
        ("tipo_acto", "Tipo de acto", "Acto jurídico: compraventa, donación, adjudicación, etc."),
        ("numero_instrumento", "Número de escritura", "Número de instrumento o escritura"),
        ("fecha_instrumento", "Fecha de la escritura", "Fecha de otorgamiento en formato AAAA-MM-DD"),
        ("notario", "Notario", "Nombre del notario y número de notaría"),
        *_UBICACION,
        ("superficie_terreno_m2", "Superficie del terreno (m²)", "Superficie del terreno en metros cuadrados, solo el número"),
        ("superficie_construccion_m2", "Superficie de construcción (m²)", "Superficie de construcción en metros cuadrados, solo el número; null si no se indica"),
        ("inscripcion_registral", "Inscripción en el Registro Público", "Folio real, partida u otros datos de inscripción en el Registro Público de la Propiedad o Instituto de la Función Registral"),
        ("gravamenes", "Gravámenes", "Gravámenes o limitaciones de dominio que pesen sobre el inmueble (hipoteca, usufructo, embargo, reserva de dominio). Escribe 'libre' si el documento declara que está libre de gravámenes; null si no dice nada"),
    ],
    "predial": [
        ("contribuyente", "Propietario o contribuyente", "Nombre del propietario, poseedor o contribuyente"),
        *_UBICACION,
        ("superficie_terreno_m2", "Superficie del terreno (m²)", "Superficie de terreno registrada, solo el número; null si no aparece"),
        ("superficie_construccion_m2", "Superficie de construcción (m²)", "Superficie de construcción registrada, solo el número; null si no aparece"),
        ("uso_predio", "Uso del predio", "Uso o tipo de predio registrado (habitacional, comercial, baldío...)"),
        ("ejercicio_fiscal", "Ejercicio fiscal pagado", "Año más reciente que el documento acredita como pagado, con cuatro dígitos"),
        ("fecha_pago", "Fecha de pago o emisión", "Fecha de pago o de emisión en formato AAAA-MM-DD"),
        ("adeudos", "Adeudos", "'si' si el documento señala adeudos, ejercicios pendientes de pago o recargos sin cubrir; 'no' si indica que está pagado o sin adeudos; null si no se puede saber. Cita la línea que lo sustenta"),
        ("autoridad_emisora", "Autoridad emisora", "Tesorería o dependencia y municipio que emiten el documento"),
    ],
    "alineamiento_numero_oficial": [
        ("solicitante", "Solicitante o propietario", "Persona a cuyo nombre se expide la constancia"),
        *_UBICACION,
        ("numero_oficial", "Número oficial asignado", "Número oficial que la autoridad asigna al predio, tal como aparece (puede ser 'S/N')"),
        ("alineamiento", "Alineamiento", "Alineamiento determinado: frente, vialidad, sección, colindancias"),
        ("afectaciones", "Afectaciones o restricciones", "Afectaciones o restricciones que reduzcan o limiten el predio (ampliación de vialidad, derecho de vía, franja donde no se permite construir, superficie afectada). Escribe 'ninguna' si no se señala ninguna o la restricción es de 0 metros"),
        ("superficie_terreno_m2", "Superficie del predio (m²)", "Superficie del predio, solo el número; null si no aparece"),
        *_VIGENCIA,
    ],
    "uso_de_suelo": [
        ("solicitante", "Solicitante o propietario", "Persona a cuyo nombre se expide el documento"),
        *_UBICACION,
        ("tipo_documento", "Tipo de documento", "Licencia, constancia, dictamen, cédula informativa, etc."),
        ("zona", "Zonificación", "Clave y nombre de la zona según el plan de desarrollo urbano"),
        ("uso_autorizado", "Uso de suelo autorizado", "Uso de suelo que el documento autoriza o reconoce (habitacional, comercial, mixto...)"),
        ("giro_autorizado", "Giro autorizado", "Giro o clasificación específica autorizada (minisúper, tienda de autoservicio, vivienda...)"),
        ("compatibilidad_comercial", "Compatibilidad con uso comercial", "Una de: 'permitido' (autoriza comercio al por menor del tipo minisúper, tienda de autoservicio, abarrotes o tienda de conveniencia), 'condicionado' (lo autoriza solo si se cumplen condiciones previas), 'prohibido' (el uso autorizado es otro, p. ej. habitacional, o se prohíben expresamente los usos comerciales), 'no_determinable'. Cita las líneas que lo sustentan"),
        ("razon_compatibilidad", "Razón de la compatibilidad", "Una frase que explique la conclusión anterior con las palabras del documento"),
        ("condicionantes", "Condicionantes o restricciones", "Condicionantes o restricciones específicas al uso (límite de superficie como 'hasta 120 m²', estudios, horarios, prohibiciones). No incluyas los parámetros urbanísticos habituales (COS, CUS, niveles, altura, área libre, cajones) ni los avisos legales genéricos (que el documento no constituye autorización de construcción o de funcionamiento, o que quedará sin efectos si cambian las condiciones). Escribe 'ninguna' si no hay"),
        ("superficie_aplicable_m2", "Superficie aplicable al uso (m²)", "Superficie máxima autorizada para el giro, solo el número; null si no se limita"),
        ("superficie_terreno_m2", "Superficie del predio (m²)", "Superficie del predio, solo el número; null si no aparece"),
        *_VIGENCIA,
    ],
}

# Datos cuyo valor es una conclusión y no texto literal: solo se exige que las líneas citadas existan.
_INTERPRETADOS = {
    "tipo_acto", "gravamenes", "adeudos", "afectaciones", "alineamiento", "firma_o_sello",
    "vigencia_plazo_meses", "compatibilidad_comercial", "razon_compatibilidad", "condicionantes",
    "tipo_documento", "autoridad_emisora", "ejercicio_fiscal", "superficie_aplicable_m2",
}
_FECHAS = {"fecha_instrumento", "fecha_pago", "fecha_emision", "vigencia_hasta"}


class Dato(BaseModel):
    # Sin valores por defecto: así el modelo está obligado a pronunciarse sobre cada dato.
    valor: str | None = Field(description="Valor encontrado; null si no aparece en el documento")
    lineas: list[str] = Field(description="Identificadores de las líneas donde aparece, p. ej. ['p1-L12']; [] si no aparece")


def _modelo(tipo: str) -> type[BaseModel]:
    campos = {
        nombre: (Dato, Field(description=descripcion))
        for nombre, _, descripcion in CAMPOS[tipo]
    }
    return create_model(f"Extraccion_{tipo}", **campos)


MODELOS = {tipo: _modelo(tipo) for tipo in TIPOS}

_INSTRUCCIONES = (
    "Eres un agente que extrae datos de un documento de un expediente inmobiliario mexicano ({nombre}). "
    "El texto viene de un OCR: cada línea empieza con su identificador entre corchetes y puede tener "
    "errores de lectura.\n"
    "Reglas:\n"
    "- Debes responder TODOS los datos del esquema, uno por uno.\n"
    "- Usa solo lo que dice el documento. Si un dato no aparece, deja valor en null y lineas vacío. No inventes.\n"
    "- En 'lineas' pon los identificadores exactos de las líneas donde está el dato (máximo 4).\n"
    "- Copia nombres, direcciones y claves tal como aparecen, corrigiendo solo errores evidentes de lectura.\n"
    "- Fechas en formato AAAA-MM-DD. Superficies: solo el número.\n"
    "- Los datos son del inmueble objeto del documento, no del domicilio de las personas ni de la notaría "
    "o dependencia.\n\nDOCUMENTO:\n{texto}"
)


def extraer(tipo: str, documento_ocr: dict) -> BaseModel | None:
    """Agente extractor del tipo indicado. Devuelve None si el LLM falla."""
    try:
        return llm.con_esquema(MODELOS[tipo]).invoke(
            _INSTRUCCIONES.format(nombre=NOMBRE_TIPO[tipo], texto=ocr.texto_numerado(documento_ocr))
        )
    except Exception:
        return None


def en_paralelo(tareas: list):
    """Ejecuta funciones sin argumentos a la vez y devuelve sus resultados en el mismo orden."""
    if not tareas:
        return []
    with ThreadPoolExecutor(max_workers=min(len(tareas), settings.llm_concurrencia)) as grupo:
        return list(grupo.map(lambda tarea: tarea(), tareas))


# -------------------------------------------------------------------- verificador

def _sustentado(nombre: str, valor: str, texto_citado: str) -> bool:
    """¿El valor aparece realmente en las líneas citadas?"""
    if nombre in _INTERPRETADOS or nombre in _FECHAS:
        return True
    citado = normalizar(texto_citado)
    if nombre.endswith("_m2"):
        digitos = "".join(c for c in valor.split(".")[0] if c.isdigit())
        return bool(digitos) and digitos in "".join(c for c in texto_citado if c.isdigit())
    palabras = [p for p in normalizar(valor).split() if len(p) > 1]
    if not palabras:
        return True
    compacto = citado.replace(" ", "")
    presentes = sum(
        1 for p in palabras
        if p in citado or p in compacto or (len(p) >= 5 and fuzz.partial_ratio(p, citado) >= 80)
    )
    return presentes / len(palabras) >= 0.6


def _con_vecinas(documento_ocr: dict, evidencia: list[Evidencia]) -> str:
    """Texto de las líneas citadas más la anterior y la siguiente de cada una."""
    partes = []
    for e in evidencia:
        lineas = next(p["lineas"] for p in documento_ocr["paginas"] if p["numero"] == e.pagina)
        i = next(k for k, l in enumerate(lineas) if l["id"] == e.linea_id)
        partes.extend(l["texto"] for l in lineas[max(0, i - 1): i + 2])
    return " ".join(partes)


def verificar(tipo: str, extraccion: BaseModel, documento_ocr: dict, documento_id: str) -> tuple[list[Campo], list[str]]:
    """Convierte la extracción en campos con evidencia y marca los que no están sustentados."""
    campos: list[Campo] = []
    observaciones: list[str] = []
    for nombre, etiqueta, _ in CAMPOS[tipo]:
        dato: Dato = getattr(extraccion, nombre)
        valor = (dato.valor or "").strip() or None
        if valor and valor.lower() in {"null", "none", "n/a", "no aplica", "no se indica"}:
            valor = None

        evidencia: list[Evidencia] = []
        confianza_lineas: list[float] = []
        for linea_id in dato.lineas[:4]:
            encontrada = ocr.buscar_linea(documento_ocr, linea_id.strip("[] "))
            if encontrada:
                pagina, linea = encontrada
                confianza_lineas.append(linea["confianza"])
                evidencia.append(
                    Evidencia(documento_id=documento_id, pagina=pagina, linea_id=linea["id"],
                              texto=linea["texto"], caja=linea["caja"])
                )

        if valor is None:
            campos.append(Campo(nombre=nombre, etiqueta=etiqueta, valor=None, confianza=0.0, evidencia=[]))
            continue

        if nombre in _INTERPRETADOS:
            # Conclusiones del agente ("ninguna", "si", "permitido"): pueden no tener una línea literal.
            sustentado = True
            confianza = (sum(confianza_lineas) / len(confianza_lineas)) if confianza_lineas else 0.7
        else:
            sustentado = bool(evidencia) and _sustentado(nombre, valor, _con_vecinas(documento_ocr, evidencia))
            confianza = (sum(confianza_lineas) / len(confianza_lineas)) if confianza_lineas else 0.4
        if not sustentado:
            confianza *= 0.5
            observaciones.append(f"El verificador no encontró «{etiqueta}» ({valor}) en el texto citado.")
        campos.append(
            Campo(nombre=nombre, etiqueta=etiqueta, valor=valor, confianza=round(confianza, 3),
                  sustentado=sustentado, evidencia=evidencia)
        )
    return campos, observaciones


# ------------------------------------------------- segunda opinión: uso de suelo

class _OpinionUso(BaseModel):
    compatibilidad: Literal["permitido", "condicionado", "prohibido", "no_determinable"]
    razon: str = Field(description="Una frase con el fundamento, citando el documento")


def segunda_opinion_uso(documento_ocr: dict) -> _OpinionUso | None:
    """Agente revisor: decide por su cuenta si el documento autoriza un minisúper."""
    try:
        return llm.con_esquema(_OpinionUso).invoke(
            "Eres un revisor legal. Con base ÚNICAMENTE en este documento de uso de suelo, decide si el "
            "predio puede operar como minisúper o tienda de autoservicio (comercio al por menor).\n"
            "- permitido: el uso o giro autorizado es comercial compatible con minisúper.\n"
            "- condicionado: se autoriza solo si antes se cumplen condiciones.\n"
            "- prohibido: el uso autorizado es otro (p. ej. habitacional) o se prohíben los usos comerciales.\n"
            "- no_determinable: el documento no permite concluir.\n"
            "No consideres la vigencia del documento (se evalúa aparte) ni los avisos legales genéricos "
            "(que no constituye autorización de construcción o de funcionamiento, o que requiere otras "
            "licencias): no son condiciones. Un límite de superficie tampoco lo vuelve condicionado.\n\n"
            + ocr.texto_numerado(documento_ocr)
        )
    except Exception:
        return None
