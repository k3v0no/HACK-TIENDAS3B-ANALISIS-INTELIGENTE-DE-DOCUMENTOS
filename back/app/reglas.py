"""Catálogo de reglas y utilidades de comparación.

El efecto de cada regla (qué recomendación provoca al incumplirse) está aquí, en un
solo lugar, para ajustarlo sin tocar el resto del código.
"""
import re
import unicodedata
from dataclasses import dataclass
from datetime import date

from rapidfuzz import fuzz

NC = "No cumple"
RR = "Requiere revisión"
INF = "Informativo"


@dataclass(frozen=True)
class Regla:
    id: str
    nombre: str
    efecto: str  # NC, RR o INF cuando la regla no se cumple
    efecto_no_evaluable: str = RR  # cuando falta el dato para evaluarla
    severidad: str | None = None  # si se indica, sustituye a la severidad que corresponde al efecto


_R = [
    # Generales
    Regla("G1", "El documento se identifica como uno de los cuatro tipos esperados", RR),
    Regla("G2", "El documento es legible", RR),
    Regla("G5", "Los datos extraídos están sustentados en el texto del documento", RR),
    # Escrituras
    Regla("E1", "Escrituras: constan titular, dirección, identificación del inmueble y superficie", RR),
    Regla("E2", "Escrituras: el acto transmite la propiedad", RR),
    Regla("E4", "Escrituras: constan número de instrumento, fecha y notario", RR),
    Regla("E5", "Escrituras: consta la inscripción en el Registro Público de la Propiedad", RR),
    Regla("E6", "Escrituras: el inmueble está libre de gravámenes y limitaciones", RR),
    # Predial
    Regla("P1", "Predial: constan contribuyente, dirección y cuenta o clave catastral", RR),
    Regla("P2", "Predial: corresponde al ejercicio fiscal en curso", NC),
    Regla("P3", "Predial: no presenta adeudos", RR),
    # Alineamiento y número oficial
    Regla("A1", "Alineamiento: constan dirección oficial, número oficial, identificación del predio y autoridad", RR),
    Regla("A2", "Alineamiento y número oficial: está vigente", NC),
    Regla("A3", "Alineamiento: constan folio y firma o sello de la autoridad", RR),
    Regla("A4", "Alineamiento: el predio no tiene afectaciones ni restricciones", RR),
    # Uso de suelo
    Regla("U1", "Uso de suelo: constan dirección, uso autorizado y autoridad emisora", RR),
    Regla("U2", "Uso de suelo: autoriza el uso comercial requerido (minisúper o tienda de autoservicio)", NC),
    Regla("U3", "Uso de suelo: está vigente", NC),
    Regla("U4", "Uso de suelo: no impone condicionantes ni restricciones", RR),
    Regla("U6", "Uso de suelo: constan folio y firma o sello de la autoridad", RR),
    # Cruzadas
    Regla("X1", "La dirección coincide entre los documentos", RR),
    Regla("X2", "El propietario o titular coincide entre los documentos", RR),
    Regla("X3", "La superficie del terreno coincide entre los documentos", RR),
    Regla("X4", "El número oficial coincide con la dirección de los demás documentos", RR),
    Regla("X5", "La clave catastral o cuenta predial coincide entre los documentos", RR),
    # Es un defecto del documento entregado, no del inmueble: lo revisa una persona, pero destacado.
    Regla("X6", "Los documentos corresponden al mismo inmueble", RR, severidad="alta"),
    Regla("X7", "El expediente incluye los cuatro tipos de documento", RR),
    Regla("X8", "El municipio de las autoridades emisoras coincide con el del inmueble", RR),
]
REGLAS: dict[str, Regla] = {r.id: r for r in _R}

# Tolerancias de superficie (fracción de diferencia respecto al valor mayor).
TOLERANCIA_SUPERFICIE = 0.02
# Confianza de OCR por debajo de la cual un documento se considera ilegible.
CONFIANZA_MINIMA_LEGIBLE = 0.75
# Antigüedad máxima (en meses) de un documento sin vigencia expresa antes de pedir revisión.
MESES_SIN_VIGENCIA_EXPRESA = 12


# ---------------------------------------------------------------- normalización

_ABREVIATURAS = {
    "av": "avenida", "avda": "avenida", "ave": "avenida",
    "c": "calle", "cll": "calle",
    "col": "colonia", "fracc": "fraccionamiento", "frac": "fraccionamiento",
    "blvd": "boulevard", "blv": "boulevard", "bulevar": "boulevard",
    "carr": "carretera", "km": "kilometro",
    "no": "", "num": "", "numero": "", "nro": "",
    "mza": "manzana", "mz": "manzana", "lt": "lote", "lte": "lote",
    "edo": "estado", "mpio": "municipio", "sta": "santa", "sto": "santo",
    "pte": "poniente", "ote": "oriente", "nte": "norte",
    "ma": "maria",
}
_PALABRAS_VACIAS = {"de", "del", "la", "las", "los", "el", "y", "en", "c", "sr", "sra", "lic", "ing"}


def sin_acentos(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")


def normalizar(texto: str | None) -> str:
    """Minúsculas, sin acentos ni puntuación, con abreviaturas expandidas."""
    if not texto:
        return ""
    limpio = re.sub(r"[^a-z0-9 ]+", " ", sin_acentos(texto.lower()))
    palabras = [_ABREVIATURAS.get(p, p) for p in limpio.split()]
    return " ".join(p for p in palabras if p)


def simple(texto: str | None) -> str:
    """Minúsculas y sin acentos ni puntuación, sin tocar las palabras (para 'si', 'no', 'ninguna'...)."""
    return " ".join(re.sub(r"[^a-z0-9_ ]+", " ", sin_acentos((texto or "").lower())).split())


def es_negacion(texto: str | None) -> bool:
    """True si el valor expresa ausencia: vacío, 'no', 'ninguna', 'sin ...', 'libre'."""
    t = simple(texto)
    return not t or t in {"no", "na"} or t.startswith(("ningun", "sin ", "no ", "libre"))


def solo_alfanumerico(texto: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", sin_acentos((texto or "").upper()))


def similitud(a: str | None, b: str | None) -> float:
    """Parecido entre dos textos de 0 a 1, sin importar el orden de las palabras."""
    na, nb = normalizar(a), normalizar(b)
    if not na or not nb:
        return 0.0
    return fuzz.token_set_ratio(na, nb) / 100


def mismo_nombre(a: str | None, b: str | None) -> bool:
    """Nombres de persona o razón social: tolera orden distinto y un apellido o nombre ausente."""
    pa = {p for p in normalizar(a).split() if p not in _PALABRAS_VACIAS}
    pb = {p for p in normalizar(b).split() if p not in _PALABRAS_VACIAS}
    if not pa or not pb:
        return False
    comunes = sum(1 for p in pa if any(fuzz.ratio(p, q) >= 85 for q in pb))
    menor = min(len(pa), len(pb))
    # Con nombres largos se tolera una palabra distinta (segundo nombre ausente o error de lectura).
    return comunes >= (menor if menor <= 3 else menor - 1)


def numero_exterior(texto: str | None) -> str:
    """Número exterior normalizado: '28', '123A' o 'SN' para sin número."""
    limpio = solo_alfanumerico(texto)
    limpio = re.sub(r"^(NUMERO|NUM|NO|N)(?=\d)", "", limpio)
    if not limpio or limpio in {"SN", "SINNUMERO", "SNUMERO"} or limpio.startswith("SN"):
        return "SN"
    return limpio


def a_numero(texto: str | None) -> float | None:
    """Convierte '1,245.50 m2' en 1245.5. Devuelve None si no hay número."""
    if not texto:
        return None
    encontrado = re.search(r"\d[\d,]*(?:\.\d+)?", texto.replace(" ", ""))
    if not encontrado:
        return None
    try:
        return float(encontrado.group().replace(",", ""))
    except ValueError:
        return None


def a_fecha(texto: str | None) -> date | None:
    """Fecha en formato ISO (AAAA-MM-DD), que es como la entregan los extractores."""
    if not texto:
        return None
    encontrado = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", texto)
    if not encontrado:
        return None
    try:
        return date(*(int(g) for g in encontrado.groups()))
    except ValueError:
        return None


def sumar_meses(fecha: date, meses: int) -> date:
    total = fecha.month - 1 + meses
    anio, mes = fecha.year + total // 12, total % 12 + 1
    dia = min(fecha.day, [31, 29 if anio % 4 == 0 and (anio % 100 != 0 or anio % 400 == 0) else 28,
                          31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1])
    return date(anio, mes, dia)


def meses_entre(desde: date, hasta: date) -> int:
    return (hasta.year - desde.year) * 12 + hasta.month - desde.month - (1 if hasta.day < desde.day else 0)


def fecha_legible(fecha: date) -> str:
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]
    return f"{fecha.day} de {meses[fecha.month - 1]} de {fecha.year}"
