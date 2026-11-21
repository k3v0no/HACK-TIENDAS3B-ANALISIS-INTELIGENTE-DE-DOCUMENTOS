"""Agentes de validación y dictamen. Todo aquí es código determinista: sin LLM.

- Validador por documento: reglas E, P, A y U.
- Validador cruzado: reglas X.
- Dictaminador: recomendación, confianza y hallazgos con su evidencia.
"""
from datetime import date

from .extraccion import NOMBRE_TIPO, TIPOS
from .reglas import (
    INF, MESES_SIN_VIGENCIA_EXPRESA, NC, REGLAS, RR, TOLERANCIA_SUPERFICIE, a_fecha, a_numero,
    es_negacion, fecha_legible, meses_entre, mismo_nombre, normalizar, numero_exterior, simple, similitud,
    solo_alfanumerico, sumar_meses,
)
from .schemas import (
    Campo, Dictamen, Documento, Evidencia, Hallazgo, Requisito, ValidacionCruzada, ValorComparado,
)

Registro = dict[str, Campo]  # datos consolidados de un tipo de documento

_ACCIONES = {
    "G1": "Confirmar qué documento es y, si no corresponde al expediente, retirarlo.",
    "G2": "Solicitar una copia legible del documento (escaneo plano, sin sombras ni desenfoque).",
    "G5": "Revisar manualmente el dato señalado en el documento original.",
    "E1": "Revisar la escritura y, si el dato no consta, solicitar el documento completo.",
    "E2": "Solicitar la escritura que acredite la propiedad del inmueble.",
    "E4": "Solicitar la escritura completa, con sus datos de otorgamiento.",
    "E5": "Solicitar la constancia de inscripción en el Registro Público de la Propiedad.",
    "E6": "Solicitar un certificado de libertad de gravamen actualizado.",
    "P1": "Solicitar la boleta predial completa del inmueble.",
    "P2": "Solicitar el comprobante de pago del predial del ejercicio en curso.",
    "P3": "Solicitar la regularización de los adeudos y su comprobante de pago.",
    "A1": "Solicitar la constancia de alineamiento y número oficial completa.",
    "A2": "Solicitar la renovación de la constancia de alineamiento y número oficial.",
    "A3": "Solicitar la constancia con folio y firma o sello de la autoridad.",
    "A4": "Evaluar con el área técnica el impacto de la afectación en la superficie aprovechable.",
    "U1": "Solicitar el documento de uso de suelo completo.",
    "U2": "Descartar el inmueble o solicitar un cambio de uso de suelo que autorice el giro comercial.",
    "U3": "Solicitar la renovación de la licencia de uso de suelo.",
    "U4": "Verificar que el proyecto de tienda cumpla las condicionantes señaladas.",
    "U6": "Solicitar el documento con folio y firma o sello de la autoridad.",
    "X1": "Aclarar cuál es la dirección correcta del inmueble.",
    "X2": "Solicitar el documento que explique la diferencia de titular (p. ej. traslado de dominio).",
    "X3": "Solicitar aclaración o un levantamiento que confirme la superficie.",
    "X4": "Aclarar el número oficial vigente del inmueble.",
    "X5": "Confirmar la clave catastral correcta del inmueble.",
    "X6": "Solicitar el documento que corresponda al inmueble del expediente.",
    "X7": "Solicitar al propietario los documentos faltantes.",
    "X8": "Confirmar que el documento fue emitido por la autoridad del municipio del inmueble.",
}


class Resultado:
    """Resultado de aplicar una regla."""

    def __init__(self, regla_id: str, estado: str, detalle: str, evidencia: list[Evidencia] | None = None,
                 documento_id: str | None = None, valores: list[ValorComparado] | None = None,
                 titulo: str | None = None):
        self.regla = REGLAS[regla_id]
        self.estado = estado  # "cumple", "no_cumple" o "no_evaluable"
        self.detalle = detalle
        self.evidencia = evidencia or []
        self.documento_id = documento_id
        self.valores = valores or []
        self.titulo = titulo

    @property
    def efecto(self) -> str | None:
        if self.estado == "no_cumple":
            return self.regla.efecto
        if self.estado == "no_evaluable":
            return self.regla.efecto_no_evaluable
        return None


def consolidar(documentos: list[Documento]) -> dict[str, Registro]:
    """Un registro por tipo: para cada dato, el primer documento de ese tipo que lo trae."""
    registros: dict[str, Registro] = {}
    for documento in documentos:
        if documento.tipo not in TIPOS:
            continue
        registro = registros.setdefault(documento.tipo, {})
        for campo in documento.campos:
            if campo.nombre not in registro or (registro[campo.nombre].valor is None and campo.valor is not None):
                registro[campo.nombre] = campo
    return registros


def _v(registro: Registro, nombre: str) -> str | None:
    campo = registro.get(nombre)
    return campo.valor if campo else None


def _ev(registro: Registro, *nombres: str) -> list[Evidencia]:
    return [e for n in nombres if (c := registro.get(n)) for e in c.evidencia]


def _doc(documentos: list[Documento], tipo: str) -> str | None:
    return next((d.id for d in documentos if d.tipo == tipo), None)


def _faltantes(registro: Registro, nombres: list[str]) -> list[str]:
    return [registro[n].etiqueta if n in registro else n for n in nombres if not _v(registro, n)]


def _obligatorios(regla_id: str, registro: Registro, nombres: list[str], doc_id: str | None, tipo: str) -> Resultado:
    faltan = _faltantes(registro, nombres)
    if faltan:
        return Resultado(regla_id, "no_cumple",
                         f"En {NOMBRE_TIPO[tipo]} no se encontró: {', '.join(faltan)}.", documento_id=doc_id,
                         titulo=f"{NOMBRE_TIPO[tipo]}: faltan datos obligatorios")
    return Resultado(regla_id, "cumple", "Constan todos los datos obligatorios.",
                     _ev(registro, *nombres[:3]), doc_id)


def _vigencia(regla_id: str, registro: Registro, hoy: date, doc_id: str | None, tipo: str) -> Resultado:
    nombre = NOMBRE_TIPO[tipo]
    emision = a_fecha(_v(registro, "fecha_emision"))
    hasta = a_fecha(_v(registro, "vigencia_hasta"))
    plazo = a_numero(_v(registro, "vigencia_plazo_meses"))
    evidencia = _ev(registro, "vigencia_hasta", "vigencia_plazo_meses", "fecha_emision")

    if emision and emision > hoy:
        return Resultado(regla_id, "no_evaluable",
                         f"{nombre}: la fecha de emisión ({fecha_legible(emision)}) es posterior a la fecha de análisis.",
                         evidencia, doc_id, titulo=f"{nombre}: fecha de emisión incoherente")
    vence, origen = None, ""
    if hasta:
        vence, origen = hasta, "según la fecha de vigencia que indica el documento"
    elif emision and plazo:
        vence = sumar_meses(emision, int(plazo))
        origen = f"({int(plazo)} meses a partir de su expedición el {fecha_legible(emision)})"
    if vence:
        if vence >= hoy:
            return Resultado(regla_id, "cumple", f"{nombre} vigente hasta el {fecha_legible(vence)}.", evidencia, doc_id)
        return Resultado(regla_id, "no_cumple",
                         f"{nombre} vencido: su vigencia terminó el {fecha_legible(vence)} {origen}; "
                         f"se evaluó al {fecha_legible(hoy)}.", evidencia, doc_id, titulo=f"{nombre} vencido")
    if emision:
        antiguedad = meses_entre(emision, hoy)
        if antiguedad <= MESES_SIN_VIGENCIA_EXPRESA:
            return Resultado(regla_id, "cumple",
                             f"{nombre} sin vigencia expresa; se emitió hace {antiguedad} meses.", evidencia, doc_id)
        return Resultado(regla_id, "no_evaluable",
                         f"{nombre} no indica vigencia y se emitió el {fecha_legible(emision)} (hace {antiguedad} "
                         f"meses); conviene confirmar que sigue vigente.", evidencia, doc_id,
                         titulo=f"{nombre}: vigencia no indicada")
    return Resultado(regla_id, "no_evaluable", f"{nombre}: no se encontró fecha de emisión ni de vigencia.",
                     documento_id=doc_id, titulo=f"{nombre}: sin fechas legibles")


def _firma(regla_id: str, registro: Registro, doc_id: str | None, tipo: str) -> Resultado:
    falta = []
    if not _v(registro, "folio"):
        falta.append("folio")
    if simple(_v(registro, "firma_o_sello")) != "si":
        falta.append("firma o sello de la autoridad")
    if falta:
        return Resultado(regla_id, "no_cumple", f"{NOMBRE_TIPO[tipo]}: no se identificó {' ni '.join(falta)}.",
                         documento_id=doc_id, titulo=f"{NOMBRE_TIPO[tipo]}: sin {falta[0]}")
    return Resultado(regla_id, "cumple", "Constan folio y firma o sello.", _ev(registro, "folio", "firma_o_sello"), doc_id)


# ------------------------------------------------------- validador por documento

def validar_documentos(documentos: list[Documento], registros: dict[str, Registro], hoy: date) -> list[Resultado]:
    r: list[Resultado] = []

    for documento in documentos:
        if documento.tipo == "desconocido":
            if documento.tipo_detectado:
                detalle = (f"«{documento.archivo}» parece ser {documento.tipo_detectado}, que no forma parte del expediente. "
                           f"Se esperan escrituras, predial, alineamiento y número oficial, y uso de suelo.")
                titulo = f"Documento que no corresponde: {documento.tipo_detectado}"
            else:
                detalle = f"«{documento.archivo}» no se identificó como ninguno de los cuatro tipos esperados."
                titulo = "Documento no identificado"
            r.append(Resultado("G1", "no_cumple", detalle, documento_id=documento.id, titulo=titulo))
        if not documento.legible:
            confianza = "sin texto reconocible" if documento.confianza_ocr is None else f"confianza de lectura de {documento.confianza_ocr:.0%}"
            r.append(Resultado("G2", "no_cumple",
                               f"«{documento.archivo}» ({NOMBRE_TIPO[documento.tipo]}) no es legible: {confianza}. "
                               f"No se pudieron extraer sus datos.", documento_id=documento.id,
                               titulo=f"{NOMBRE_TIPO[documento.tipo]} ilegible"))
        no_sustentados = [c for c in documento.campos if c.valor and not c.sustentado]
        if no_sustentados:
            r.append(Resultado("G5", "no_cumple",
                               f"En «{documento.archivo}» el verificador no pudo confirmar en el texto: "
                               + ", ".join(f"{c.etiqueta} ({c.valor})" for c in no_sustentados) + ".",
                               [e for c in no_sustentados for e in c.evidencia], documento.id,
                               titulo=f"{NOMBRE_TIPO[documento.tipo]}: datos sin confirmar"))

    legibles = {d.tipo for d in documentos if d.legible}

    if "escrituras" in registros and "escrituras" in legibles:
        e, doc = registros["escrituras"], _doc(documentos, "escrituras")
        r.append(_obligatorios("E1", e, ["titular", "calle", "municipio", "superficie_terreno_m2"], doc, "escrituras"))
        acto = normalizar(_v(e, "tipo_acto"))
        transmite = any(p in acto for p in ["compraventa", "compra venta", "donacion", "adjudicacion", "permuta",
                                             "herencia", "sucesion", "fusion", "aportacion", "dacion", "transmision",
                                             "fideicomiso", "relotificacion", "lotificacion", "subdivision",
                                             "protocolizacion", "division", "inmatriculacion", "informacion de dominio",
                                             "usucapion", "prescripcion", "sentencia", "titulo de propiedad"])
        if not acto:
            r.append(Resultado("E2", "no_evaluable", "No se identificó el tipo de acto de la escritura.", documento_id=doc,
                               titulo="Escrituras: acto no identificado"))
        elif transmite:
            r.append(Resultado("E2", "cumple", f"Acto: {_v(e, 'tipo_acto')}.", _ev(e, "tipo_acto"), doc))
        else:
            r.append(Resultado("E2", "no_cumple",
                               f"El acto de la escritura es «{_v(e, 'tipo_acto')}», que no acredita por sí mismo la propiedad.",
                               _ev(e, "tipo_acto"), doc, titulo="Escrituras: el acto no transmite la propiedad"))
        r.append(_obligatorios("E4", e, ["numero_instrumento", "fecha_instrumento", "notario"], doc, "escrituras"))
        if _v(e, "inscripcion_registral"):
            r.append(Resultado("E5", "cumple", f"Inscripción: {_v(e, 'inscripcion_registral')}.", _ev(e, "inscripcion_registral"), doc))
        else:
            r.append(Resultado("E5", "no_cumple", "La escritura no muestra datos de inscripción en el Registro Público de la Propiedad.",
                               documento_id=doc, titulo="Escrituras sin datos de inscripción registral"))
        gravamen = simple(_v(e, "gravamenes"))
        if not gravamen:
            r.append(Resultado("E6", "cumple", "La escritura no menciona gravámenes.", documento_id=doc))
        elif es_negacion(gravamen):
            r.append(Resultado("E6", "cumple", "La escritura declara el inmueble libre de gravámenes.", _ev(e, "gravamenes"), doc))
        else:
            r.append(Resultado("E6", "no_cumple", f"La escritura menciona gravámenes o limitaciones: {_v(e, 'gravamenes')}.",
                               _ev(e, "gravamenes"), doc, titulo="Escrituras: inmueble con gravámenes"))

    if "predial" in registros and "predial" in legibles:
        p, doc = registros["predial"], _doc(documentos, "predial")
        r.append(_obligatorios("P1", p, ["contribuyente", "calle", "clave_catastral"], doc, "predial"))
        ejercicio = a_numero(_v(p, "ejercicio_fiscal"))
        if ejercicio is None:
            r.append(Resultado("P2", "no_evaluable", "No se identificó el ejercicio fiscal que ampara el predial.",
                               documento_id=doc, titulo="Predial: ejercicio no identificado"))
        elif int(ejercicio) >= hoy.year:
            r.append(Resultado("P2", "cumple", f"Predial del ejercicio {int(ejercicio)}.", _ev(p, "ejercicio_fiscal"), doc))
        else:
            r.append(Resultado("P2", "no_cumple",
                               f"El predial acredita el pago del ejercicio {int(ejercicio)}, no el del ejercicio en curso "
                               f"({hoy.year}).", _ev(p, "ejercicio_fiscal", "fecha_pago"), doc,
                               titulo=f"Predial no actualizado (ejercicio {int(ejercicio)})"))
        adeudos = simple(_v(p, "adeudos"))
        if adeudos == "si":
            r.append(Resultado("P3", "no_cumple", "El predial señala adeudos o ejercicios pendientes de pago.",
                               _ev(p, "adeudos"), doc, titulo="Predial con adeudos"))
        elif adeudos == "no":
            r.append(Resultado("P3", "cumple", "El predial no presenta adeudos.", _ev(p, "adeudos"), doc))
        else:
            r.append(Resultado("P3", "no_evaluable", "El documento no permite saber si hay adeudos de predial.",
                               documento_id=doc, titulo="Predial: adeudos no determinables"))

    if "alineamiento_numero_oficial" in registros and "alineamiento_numero_oficial" in legibles:
        a, doc = registros["alineamiento_numero_oficial"], _doc(documentos, "alineamiento_numero_oficial")
        r.append(_obligatorios("A1", a, ["calle", "numero_oficial", "municipio", "autoridad_emisora"], doc,
                               "alineamiento_numero_oficial"))
        r.append(_vigencia("A2", a, hoy, doc, "alineamiento_numero_oficial"))
        r.append(_firma("A3", a, doc, "alineamiento_numero_oficial"))
        if es_negacion(_v(a, "afectaciones")):
            r.append(Resultado("A4", "cumple", "No se señalan afectaciones sobre el predio.", _ev(a, "afectaciones"), doc))
        else:
            r.append(Resultado("A4", "no_cumple", f"El alineamiento señala una afectación: {_v(a, 'afectaciones')}.",
                               _ev(a, "afectaciones"), doc, titulo="Predio con afectación en el alineamiento"))

    if "uso_de_suelo" in registros and "uso_de_suelo" in legibles:
        u, doc = registros["uso_de_suelo"], _doc(documentos, "uso_de_suelo")
        r.append(_obligatorios("U1", u, ["calle", "uso_autorizado", "autoridad_emisora"], doc, "uso_de_suelo"))
        compat = simple(_v(u, "compatibilidad_comercial")).replace(" ", "_")
        razon = _v(u, "razon_compatibilidad") or ""
        uso = " · ".join(x for x in [_v(u, "uso_autorizado"), _v(u, "giro_autorizado")] if x)
        evidencia = _ev(u, "compatibilidad_comercial", "uso_autorizado", "giro_autorizado")
        if compat == "permitido":
            r.append(Resultado("U2", "cumple", f"El uso de suelo autoriza el giro comercial requerido ({uso}). {razon}", evidencia, doc))
        elif compat == "prohibido":
            r.append(Resultado("U2", "no_cumple",
                               f"El uso de suelo no autoriza operar un minisúper o tienda de autoservicio. Uso autorizado: {uso}. {razon}",
                               evidencia, doc, titulo="El uso de suelo no permite el giro comercial"))
        elif compat == "condicionado":
            resultado = Resultado("U2", "no_evaluable", f"El uso comercial está condicionado ({uso}). {razon}", evidencia, doc,
                                  titulo="Uso comercial condicionado")
            r.append(resultado)
        else:
            r.append(Resultado("U2", "no_evaluable",
                               f"No se pudo determinar si el uso de suelo autoriza el giro comercial. {razon}", evidencia, doc,
                               titulo="Compatibilidad comercial no determinable"))
        r.append(_vigencia("U3", u, hoy, doc, "uso_de_suelo"))
        if es_negacion(_v(u, "condicionantes")):
            r.append(Resultado("U4", "cumple", "No se señalan condicionantes ni restricciones al uso.", _ev(u, "condicionantes"), doc))
        else:
            r.append(Resultado("U4", "no_cumple", f"El uso de suelo impone condicionantes o restricciones: {_v(u, 'condicionantes')}.",
                               _ev(u, "condicionantes", "superficie_aplicable_m2"), doc, titulo="Uso de suelo con condicionantes"))
        r.append(_firma("U6", u, doc, "uso_de_suelo"))

    return r


# ------------------------------------------------------------- validador cruzado

_TITULAR = {"escrituras": "titular", "predial": "contribuyente",
            "alineamiento_numero_oficial": "solicitante", "uso_de_suelo": "solicitante"}


def _pares(registros: dict[str, Registro], campo_por_tipo, documentos: list[Documento]):
    """Valores de un mismo dato en cada tipo de documento que lo trae."""
    salida = []
    for tipo in TIPOS:
        registro = registros.get(tipo)
        nombre = campo_por_tipo(tipo) if callable(campo_por_tipo) else campo_por_tipo
        if registro and nombre and _v(registro, nombre):
            salida.append((tipo, _v(registro, nombre), _ev(registro, nombre), _doc(documentos, tipo)))
    return salida


def _comparar(regla_id: str, pares, iguales, descripcion: str, formato=lambda v: v) -> Resultado:
    valores = [ValorComparado(documento_id=d or "", valor=v, evidencia=ev) for _, v, ev, d in pares]
    if len(pares) < 2:
        return Resultado(regla_id, "no_evaluable",
                         f"No hay suficientes documentos con {descripcion} para compararla.", valores=valores,
                         titulo=f"No se pudo comparar: {descripcion}")
    _, referencia, _, _ = pares[0]
    distintos = [(t, v) for t, v, _, _ in pares[1:] if not iguales(referencia, v)]
    listado = "; ".join(f"{NOMBRE_TIPO[t]}: «{formato(v)}»" for t, v, _, _ in pares)
    evidencia = [e for _, _, ev, _ in pares for e in ev]
    if distintos:
        return Resultado(regla_id, "no_cumple", f"No coincide {descripcion}. {listado}.", evidencia, valores=valores,
                         titulo=f"No coincide {descripcion}")
    return Resultado(regla_id, "cumple", f"Coincide {descripcion}. {listado}.", evidencia, valores=valores)


def _misma_calle(a: str, b: str) -> bool:
    return similitud(a, b) >= 0.8


def _misma_clave(a: str, b: str) -> bool:
    return solo_alfanumerico(a).rstrip("0") == solo_alfanumerico(b).rstrip("0")


def _mismo_titular(a: str, b: str) -> bool:
    return any(mismo_nombre(x, y) for x in a.split(";") for y in b.split(";"))


def _misma_superficie(a: str, b: str) -> bool:
    x, y = a_numero(a), a_numero(b)
    if x is None or y is None:
        return True
    return abs(x - y) <= TOLERANCIA_SUPERFICIE * max(x, y)


def validar_cruzado(documentos: list[Documento], registros: dict[str, Registro]) -> list[Resultado]:
    r: list[Resultado] = []
    presentes = [t for t in TIPOS if t in registros or any(d.tipo == t for d in documentos)]
    faltan = [t for t in TIPOS if t not in presentes]
    if faltan:
        r.append(Resultado("X7", "no_cumple", "Faltan en el expediente: " + ", ".join(NOMBRE_TIPO[t] for t in faltan) + ".",
                           titulo="Documentos faltantes"))
    else:
        r.append(Resultado("X7", "cumple", "El expediente incluye los cuatro tipos de documento."))

    # X1 dirección: calle, colonia y número exterior
    calle = _comparar("X1", _pares(registros, "calle", documentos), _misma_calle, "la calle del inmueble")
    colonia = _comparar("X1", _pares(registros, "colonia", documentos), lambda a, b: similitud(a, b) >= 0.75, "la colonia")
    numero = _comparar("X1", _pares(registros, "numero_exterior", documentos),
                       lambda a, b: numero_exterior(a) == numero_exterior(b), "el número exterior")
    r.extend(x for x in (calle, colonia, numero) if x.estado != "no_evaluable")
    if all(x.estado == "no_evaluable" for x in (calle, colonia, numero)):
        r.append(calle)

    titular = _comparar("X2", _pares(registros, lambda t: _TITULAR[t], documentos), _mismo_titular, "el propietario o titular")
    superficie = _comparar("X3", _pares(registros, "superficie_terreno_m2", documentos), _misma_superficie,
                           "la superficie del terreno", lambda v: f"{v} m²")
    clave = _comparar("X5", _pares(registros, "clave_catastral", documentos), _misma_clave,
                      "la clave catastral o cuenta predial")
    r.extend([titular, superficie, clave])

    # X4 número oficial asignado contra el número exterior de los demás documentos
    alineamiento = registros.get("alineamiento_numero_oficial")
    oficial = _v(alineamiento, "numero_oficial") if alineamiento else None
    if oficial:
        otros = [(t, v, ev, d) for t, v, ev, d in _pares(registros, "numero_exterior", documentos)]
        pares = [("alineamiento_numero_oficial", oficial, _ev(alineamiento, "numero_oficial"),
                  _doc(documentos, "alineamiento_numero_oficial"))] + otros
        resultado = _comparar("X4", pares, lambda a, b: numero_exterior(a) == numero_exterior(b),
                              "el número oficial con el número de la dirección")
        if resultado.estado == "no_cumple":
            resultado.detalle = (f"El número oficial asignado es «{oficial}», pero la dirección en los documentos indica: "
                                 + "; ".join(f"{NOMBRE_TIPO[t]}: «{v}»" for t, v, _, _ in otros) + ".")
        r.append(resultado)
    else:
        r.append(Resultado("X4", "no_evaluable", "No se cuenta con el número oficial asignado para compararlo.",
                           titulo="Número oficial no disponible"))

    # X6 documento que parece de otro inmueble: difiere a la vez en clave, titular y dirección o superficie
    referencia = next((t for t in TIPOS if t in registros), None)
    ajenos = []
    for tipo in TIPOS:
        if tipo == referencia or tipo not in registros or referencia is None:
            continue
        a, b = registros[referencia], registros[tipo]
        diferencias = []
        if _v(a, "clave_catastral") and _v(b, "clave_catastral") and not _misma_clave(_v(a, "clave_catastral"), _v(b, "clave_catastral")):
            diferencias.append("clave catastral")
        ta, tb = _v(a, _TITULAR[referencia]), _v(b, _TITULAR[tipo])
        if ta and tb and not _mismo_titular(ta, tb):
            diferencias.append("titular")
        if _v(a, "calle") and _v(b, "calle") and not _misma_calle(_v(a, "calle"), _v(b, "calle")):
            diferencias.append("calle")
        elif _v(a, "numero_exterior") and _v(b, "numero_exterior") and numero_exterior(_v(a, "numero_exterior")) != numero_exterior(_v(b, "numero_exterior")):
            diferencias.append("número exterior")
        if _v(a, "superficie_terreno_m2") and _v(b, "superficie_terreno_m2") and not _misma_superficie(_v(a, "superficie_terreno_m2"), _v(b, "superficie_terreno_m2")):
            diferencias.append("superficie")
        if len(diferencias) >= 3:
            ajenos.append((tipo, diferencias, _ev(b, "clave_catastral", _TITULAR[tipo], "calle", "numero_exterior")))
    if ajenos:
        detalle = " ".join(
            f"{NOMBRE_TIPO[t]} difiere de {NOMBRE_TIPO[referencia]} en {', '.join(dif)}: probablemente corresponde a otro inmueble."
            for t, dif, _ in ajenos)
        r.append(Resultado("X6", "no_cumple", detalle, [e for _, _, ev in ajenos for e in ev],
                           documento_id=_doc(documentos, ajenos[0][0]),
                           titulo=f"{NOMBRE_TIPO[ajenos[0][0]]} parece ser de otro inmueble"))
    elif referencia and len(registros) >= 2:
        r.append(Resultado("X6", "cumple", "Los documentos comparten los identificadores del mismo inmueble."))

    municipio = _comparar("X8", _pares(registros, "municipio", documentos), lambda a, b: similitud(a, b) >= 0.8,
                          "el municipio del inmueble")
    if municipio.estado != "no_evaluable":
        r.append(municipio)
    return r


# ----------------------------------------------------------------- dictaminador

def dictaminar(documentos: list[Documento], resultados: list[Resultado], hoy: date) -> Dictamen:
    efectos = [x.efecto for x in resultados if x.efecto]
    if NC in efectos:
        recomendacion = NC
    elif RR in efectos:
        recomendacion = RR
    else:
        recomendacion = "Cumple"

    confianzas = [c.confianza for d in documentos for c in d.campos if c.valor]
    base = sum(confianzas) / len(confianzas) if confianzas else 0.3
    evaluables = sum(1 for x in resultados if x.estado != "no_evaluable") / max(len(resultados), 1)
    legibles = sum(1 for d in documentos if d.legible) / max(len(documentos), 1)
    confianza = round(max(0.05, min(0.99, base * (0.4 + 0.6 * evaluables) * (0.5 + 0.5 * legibles))), 2)
    nivel = "alto" if confianza >= 0.85 else "medio" if confianza >= 0.65 else "bajo"

    requisitos = [
        Requisito(regla_id=x.regla.id, nombre=x.regla.nombre,
                  cumple=True if x.estado == "cumple" else False if x.estado == "no_cumple" else None,
                  efecto=x.efecto or "", detalle=x.detalle, documento_id=x.documento_id, evidencia=x.evidencia)
        for x in resultados if not x.regla.id.startswith("X")
    ]
    cruzadas = [
        ValidacionCruzada(regla_id=x.regla.id, regla=x.regla.nombre,
                          estado={"cumple": "ok", "no_cumple": "discrepancia"}.get(x.estado, "no_evaluable"),
                          detalle=x.detalle, valores=x.valores)
        for x in resultados if x.regla.id.startswith("X")
    ]
    severidad = {NC: "alta", RR: "media", INF: "baja"}
    sin_comparar = [x for x in resultados if x.regla.id.startswith("X") and x.estado == "no_evaluable"]
    hallazgos = [
        Hallazgo(regla_id=x.regla.id, severidad=x.regla.severidad or severidad[x.efecto],
                 titulo=x.titulo or x.regla.nombre, explicacion=x.detalle,
                 accion_sugerida=_ACCIONES.get(x.regla.id), evidencia=x.evidencia)
        for x in resultados if x.efecto and x not in sin_comparar
    ]
    if sin_comparar:
        hallazgos.append(Hallazgo(
            regla_id="X", severidad="media", titulo="Validaciones cruzadas que no se pudieron realizar",
            explicacion="Faltan datos legibles en uno o más documentos para comparar: "
                        + "; ".join(x.regla.nombre.lower() for x in sin_comparar) + ".",
            accion_sugerida="Completar o sustituir los documentos ilegibles o faltantes y repetir el análisis.",
        ))
    hallazgos.sort(key=lambda h: ["alta", "media", "baja"].index(h.severidad))

    presentes = {d.tipo for d in documentos}
    return Dictamen(
        recomendacion=recomendacion, confianza=confianza, nivel_confianza=nivel,
        fecha_referencia=hoy.isoformat(), resumen=resumen_base(recomendacion, hallazgos),
        faltantes=[t for t in TIPOS if t not in presentes],
        requisitos=requisitos, validaciones_cruzadas=cruzadas, hallazgos=hallazgos,
    )


def resumen_base(recomendacion: str, hallazgos: list[Hallazgo]) -> str:
    """Resumen sin LLM; el dictaminador lo sustituye por uno redactado si el LLM responde."""
    if not hallazgos:
        return "El expediente está completo, los documentos son coherentes entre sí y no se detectaron incumplimientos."
    graves = [h.titulo for h in hallazgos if h.severidad == "alta"]
    otros = [h.titulo for h in hallazgos if h.severidad != "alta"]
    partes = []
    if graves:
        partes.append("Incumplimientos: " + "; ".join(graves) + ".")
    if otros:
        partes.append("Puntos por revisar: " + "; ".join(otros) + ".")
    return f"{recomendacion}. " + " ".join(partes)
