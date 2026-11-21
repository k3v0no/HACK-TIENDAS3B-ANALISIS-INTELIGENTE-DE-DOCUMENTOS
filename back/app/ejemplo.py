"""Expediente ficticio con dictamen completo. Todos los datos son inventados.

Sirve para que el front se desarrolle sin esperar al OCR ni a los agentes.
Sus documentos no tienen imágenes de página: el visor de evidencia se prueba
con un expediente real.
"""
from .schemas import (
    Campo,
    Dictamen,
    Documento,
    Evidencia,
    Expediente,
    Hallazgo,
    PaginaInfo,
    Requisito,
    ValidacionCruzada,
    ValorComparado,
)

_PAGINA = PaginaInfo(numero=1, ancho=1654, alto=2339, confianza_ocr=0.94)


def _ev(doc: str, linea: str, texto: str, caja: list[float]) -> Evidencia:
    return Evidencia(documento_id=doc, pagina=1, linea_id=linea, texto=texto, caja=caja)


_ESC, _PRE, _ALI = "aaaaaaaaaaa1", "aaaaaaaaaaa2", "aaaaaaaaaaa3"

_ev_sup_esc = _ev(_ESC, "p1-L42", "con superficie de 450.00 metros cuadrados", [210, 1180, 1320, 1222])
_ev_sup_pre = _ev(_PRE, "p1-L18", "SUP. TERRENO 405.00 M2", [880, 640, 1290, 676])
_ev_dir_esc = _ev(_ESC, "p1-L37", "ubicado en Avenida Ejemplo número 123, Colonia Centro", [210, 1020, 1410, 1062])
_ev_dir_pre = _ev(_PRE, "p1-L9", "AV. EJEMPLO 123 COL. CENTRO", [240, 410, 900, 446])
_ev_prop_esc = _ev(_ESC, "p1-L12", "comparece la señora María Ejemplo Ficticia", [210, 520, 1180, 562])
_ev_prop_pre = _ev(_PRE, "p1-L6", "CONTRIBUYENTE: MARIA EJEMPLO FICTICIA", [240, 330, 980, 366])
_ev_vig_ali = _ev(_ALI, "p1-L27", "VIGENCIA: 15 DE MARZO DE 2025", [300, 1500, 900, 1540])

EXPEDIENTE = Expediente(
    id="ejemplo00000",
    estado="listo",
    etapa="Análisis terminado",
    documentos=[
        Documento(
            id=_ESC,
            archivo="escritura_ejemplo.pdf",
            tipo="escrituras",
            paginas=[_PAGINA],
            campos=[
                Campo(nombre="propietario", valor="María Ejemplo Ficticia", confianza=0.95, evidencia=[_ev_prop_esc]),
                Campo(
                    nombre="direccion",
                    valor="Avenida Ejemplo 123, Colonia Centro",
                    confianza=0.93,
                    evidencia=[_ev_dir_esc],
                ),
                Campo(nombre="superficie_m2", valor="450.00", confianza=0.96, evidencia=[_ev_sup_esc]),
            ],
        ),
        Documento(
            id=_PRE,
            archivo="predial_ejemplo.pdf",
            tipo="predial",
            paginas=[_PAGINA],
            campos=[
                Campo(nombre="contribuyente", valor="MARIA EJEMPLO FICTICIA", confianza=0.92, evidencia=[_ev_prop_pre]),
                Campo(nombre="direccion", valor="AV. EJEMPLO 123 COL. CENTRO", confianza=0.9, evidencia=[_ev_dir_pre]),
                Campo(nombre="cuenta_predial", valor="000-000-00-000", confianza=0.88),
                Campo(nombre="superficie_m2", valor="405.00", confianza=0.91, evidencia=[_ev_sup_pre]),
            ],
        ),
        Documento(
            id=_ALI,
            archivo="alineamiento_ejemplo.pdf",
            tipo="alineamiento_numero_oficial",
            paginas=[_PAGINA],
            campos=[
                Campo(nombre="numero_oficial", valor="123", confianza=0.94),
                Campo(nombre="vigencia", valor="2025-03-15", confianza=0.9, evidencia=[_ev_vig_ali]),
                Campo(nombre="autoridad_emisora", valor="Dirección de Desarrollo Urbano (ficticia)", confianza=0.85),
            ],
        ),
    ],
    dictamen=Dictamen(
        recomendacion="Requiere revisión",
        confianza=0.78,
        resumen=(
            "El expediente tiene tres de los cuatro documentos. Propietario y dirección coinciden, "
            "pero la superficie difiere entre escrituras y predial, el alineamiento está vencido "
            "y falta el uso de suelo."
        ),
        faltantes=["uso_de_suelo"],
        requisitos=[
            Requisito(nombre="Escrituras presentes y legibles", cumple=True, detalle="Documento completo.", documento_id=_ESC),
            Requisito(nombre="Predial presente y legible", cumple=True, detalle="Documento completo.", documento_id=_PRE),
            Requisito(
                nombre="Alineamiento y número oficial vigente",
                cumple=False,
                detalle="La vigencia terminó el 15 de marzo de 2025.",
                documento_id=_ALI,
                evidencia=[_ev_vig_ali],
            ),
            Requisito(nombre="Uso de suelo compatible con uso comercial", cumple=None, detalle="No se recibió el documento."),
        ],
        validaciones_cruzadas=[
            ValidacionCruzada(
                regla="Propietario coincide entre documentos",
                estado="ok",
                detalle="El nombre coincide salvo mayúsculas y acentos.",
                valores=[
                    ValorComparado(documento_id=_ESC, valor="María Ejemplo Ficticia", evidencia=[_ev_prop_esc]),
                    ValorComparado(documento_id=_PRE, valor="MARIA EJEMPLO FICTICIA", evidencia=[_ev_prop_pre]),
                ],
            ),
            ValidacionCruzada(
                regla="Dirección coincide entre documentos",
                estado="ok",
                detalle="Misma dirección; solo cambian las abreviaturas.",
                valores=[
                    ValorComparado(documento_id=_ESC, valor="Avenida Ejemplo 123, Colonia Centro", evidencia=[_ev_dir_esc]),
                    ValorComparado(documento_id=_PRE, valor="AV. EJEMPLO 123 COL. CENTRO", evidencia=[_ev_dir_pre]),
                ],
            ),
            ValidacionCruzada(
                regla="Superficie coincide entre documentos",
                estado="discrepancia",
                detalle="450.00 m² en escrituras contra 405.00 m² en predial: 10 % de diferencia.",
                valores=[
                    ValorComparado(documento_id=_ESC, valor="450.00", evidencia=[_ev_sup_esc]),
                    ValorComparado(documento_id=_PRE, valor="405.00", evidencia=[_ev_sup_pre]),
                ],
            ),
        ],
        hallazgos=[
            Hallazgo(
                severidad="alta",
                titulo="Falta el documento de uso de suelo",
                explicacion="Sin él no se puede confirmar que el inmueble admita uso comercial.",
                accion_sugerida="Solicitar al arrendador el certificado de uso de suelo vigente.",
            ),
            Hallazgo(
                severidad="media",
                titulo="La superficie no coincide",
                explicacion="Las escrituras indican 450.00 m² y el predial 405.00 m².",
                accion_sugerida="Pedir aclaración o un levantamiento que confirme la superficie.",
                evidencia=[_ev_sup_esc, _ev_sup_pre],
            ),
            Hallazgo(
                severidad="media",
                titulo="Alineamiento y número oficial vencido",
                explicacion="La vigencia del documento terminó el 15 de marzo de 2025.",
                accion_sugerida="Solicitar la renovación ante la autoridad municipal.",
                evidencia=[_ev_vig_ali],
            ),
        ],
    ),
)
