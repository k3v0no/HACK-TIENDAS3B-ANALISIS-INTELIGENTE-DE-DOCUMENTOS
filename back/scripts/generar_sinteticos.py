"""Genera expedientes sintéticos VÁLIDOS: cuatro documentos coherentes entre sí y vigentes.

Uso (desde back/):  .venv\\Scripts\\python -m scripts.generar_sinteticos <carpeta_de_salida>

Requiere pdflatex (MiKTeX o TeX Live). Todos los nombres, direcciones, claves y autoridades son
inventados. Las fechas se calculan a partir de hoy, para que los documentos estén vigentes el
día en que se generan.
"""
import shutil
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
         "octubre", "noviembre", "diciembre"]

INMUEBLES = [
    dict(
        carpeta="Jacarandas 42", titular="LAURA PATRICIA DOMÍNGUEZ RIVAS", vendedor="ERNESTO SALDAÑA PINEDA",
        calle="Calle Jacarandas", numero="42", lote="Lote 7, Manzana 12", colonia="Las Arboledas",
        municipio="San Mateo Tlalpizco", estado="Estado de México", clave="104 02 087 07 00 0000",
        superficie="320.00", construccion="180.00", frente="16.00", fondo="20.00",
        notario="LIC. HORACIO BENAVIDES LUNA", notaria="27", plaza="Toluca", instrumento="48,216", volumen="1,032",
        fecha_escritura=date(2019, 6, 14), folio_real="20457", director="ARQ. SILVIA MONTERO CASAS",
        zona="CU-200 CORREDOR URBANO",
    ),
    dict(
        carpeta="Hidalgo 118", titular="ROBERTO CARLOS MENDOZA AGUIRRE", vendedor="INMOBILIARIA DEL VALLE, S.A. DE C.V.",
        calle="Avenida Hidalgo", numero="118", lote="Lote 3, Manzana 5", colonia="Centro",
        municipio="Santa Cruz Atempa", estado="Estado de Hidalgo", clave="045 01 021 03 00 0000",
        superficie="450.00", construccion="260.00", frente="18.00", fondo="25.00",
        notario="LIC. PATRICIA OLVERA SÁNCHEZ", notaria="9", plaza="Pachuca", instrumento="31,905", volumen="842",
        fecha_escritura=date(2021, 3, 9), folio_real="58812", director="ING. MARCO ANTONIO REYES VIDAL",
        zona="CS-300 COMERCIO Y SERVICIOS",
    ),
    dict(
        carpeta="Las Torres 305", titular="MARÍA FERNANDA ORTEGA SALINAS", vendedor="JOAQUÍN ESPARZA TREVIÑO",
        calle="Boulevard Las Torres", numero="305", lote="Lote 22, Manzana 8", colonia="Industrial",
        municipio="Villa del Sol Ixtapan", estado="Estado de México", clave="098 05 310 22 00 0000",
        superficie="600.00", construccion="410.00", frente="20.00", fondo="30.00",
        notario="LIC. GUILLERMO ÁVALOS PRIETO", notaria="112", plaza="Naucalpan", instrumento="67,540", volumen="1,518",
        fecha_escritura=date(2017, 10, 2), folio_real="77340", director="ARQ. DANIELA CORTÉS IBARRA",
        zona="CRU-300 CORREDOR URBANO",
    ),
]

PREAMBULO = r"""\documentclass[11pt,letterpaper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=2.2cm,bottom=2.6cm]{geometry}
\usepackage{array}
\usepackage{xcolor}
\usepackage{fancyhdr}
\input{glyphtounicode}
\pdfgentounicode=1
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\cfoot{\scriptsize\color{gray}DOCUMENTO SINTÉTICO -- HACKATÓN 3B -- SIN VALIDEZ OFICIAL}
\setlength{\parindent}{0pt}
\setlength{\parskip}{7pt}
\hyphenpenalty=10000
\exhyphenpenalty=10000
\sloppy
\raggedright
\renewcommand{\arraystretch}{1.45}
\newcommand{\sello}[1]{\par\medskip{\color{blue!60!black}\fbox{\parbox{0.9\linewidth}{\centering\bfseries #1}}}}
\newcommand{\pagado}[1]{\par\medskip{\color{red!70!black}\fbox{\parbox{0.6\linewidth}{\centering\bfseries #1}}}}
\newcommand{\encabezado}[2]{\begin{center}{\Large\bfseries #1}\\[3pt]{#2}\end{center}}
\newcommand{\titulo}[1]{\begin{center}{\large\bfseries #1}\end{center}}
\begin{document}
"""
CIERRE = "\n\\end{document}\n"


def tex(valor) -> str:
    """Escapa un dato para ponerlo dentro de LaTeX."""
    s = str(valor)
    for a, b in [("\\", r"\textbackslash{}"), ("&", r"\&"), ("%", r"\%"), ("#", r"\#"), ("_", r"\_"), ("$", r"\$")]:
        s = s.replace(a, b)
    return s


def larga(f: date) -> str:
    return f"{f.day:02d} de {MESES[f.month - 1]} de {f.year}"


def tabla(filas: list[tuple[str, str]]) -> str:
    cuerpo = "\n".join(f"\\textbf{{{tex(a)}}} & {tex(b)} \\\\ \\hline" for a, b in filas)
    return "\\par\\begin{tabular}{|p{6.2cm}|p{9.4cm}|}\\hline\n" + cuerpo + "\n\\end{tabular}\\par\n\n"


def direccion(i: dict) -> str:
    return f"{i['calle']} No. {i['numero']}, {i['lote']}, Col. {i['colonia']}"


def escritura(i: dict) -> str:
    t = {k: tex(v) for k, v in i.items()}
    cabeza = f"\\encabezado{{{t['notario']}}}{{NOTARIO PÚBLICO No. {t['notaria']} -- {t['plaza'].upper()}}}\n"
    return cabeza + f"""\\hfill Hoja 1

\\textbf{{VOLUMEN {t['volumen']} --- INSTRUMENTO NÚMERO {t['instrumento']}}}

En la ciudad de {t['plaza']}, a {larga(i['fecha_escritura'])}, ANTE MÍ, {t['notario']}, Titular de la Notaría Pública
número {t['notaria']} del {t['estado']}, se hace constar el CONTRATO DE COMPRAVENTA que celebran, de una parte como
VENDEDOR {t['vendedor']}, y de la otra como COMPRADOR(A) {t['titular']}, al tenor de los siguientes antecedentes y
cláusulas:

\\textbf{{ANTECEDENTES}}

I.- Declara la parte vendedora ser legítima propietaria del inmueble ubicado en {tex(direccion(i))}, Municipio de
{t['municipio']}, {t['estado']}, con superficie de terreno de {t['superficie']} metros cuadrados y superficie de
construcción de {t['construccion']} metros cuadrados, identificado con clave catastral {t['clave']}, según consta en el
folio real electrónico inscrito en el Instituto de la Función Registral correspondiente.

II.- El inmueble tiene las siguientes medidas y colindancias: AL NORTE en {t['frente']} metros con {t['calle']};
AL SUR en {t['frente']} metros con lote colindante; AL ORIENTE en {t['fondo']} metros con lote colindante; AL PONIENTE
en {t['fondo']} metros con lote colindante.

III.- Manifiesta la parte vendedora que el inmueble se encuentra al corriente en el pago del impuesto predial y
derechos de agua, y LIBRE DE GRAVÁMENES Y LIMITACIONES DE DOMINIO, según certificado de libertad de gravamen expedido
por el Registro Público de la Propiedad.

\\textbf{{CLÁUSULAS}}

PRIMERA.- {t['vendedor']} vende, y {t['titular']} compra y adquiere para sí, el inmueble descrito en el antecedente I
de este instrumento, con la superficie, medidas y colindancias señaladas, con todo cuanto de hecho y por derecho le
corresponda.

SEGUNDA.- El precio de la operación ha sido recibido por la parte vendedora a su entera satisfacción.

TERCERA.- La parte vendedora se obliga al saneamiento para el caso de evicción en los términos de ley.

\\newpage
{cabeza}\\hfill Hoja 2

YO, EL NOTARIO, CERTIFICO: que me identifiqué plenamente como Notario ante los comparecientes; que a mi juicio tienen
capacidad legal; que les leí y expliqué el valor y consecuencias legales del presente instrumento, y que manifestaron
su conformidad firmándolo el día de su fecha. DOY FE.

\\vspace{{1.2cm}}
FIRMA DE LA PARTE COMPRADORA: {t['titular']}

\\vspace{{0.8cm}}
FIRMA DE LA PARTE VENDEDORA: {t['vendedor']}

\\vspace{{0.8cm}}
{t['notario']} --- RÚBRICA Y SELLO NOTARIAL

\\sello{{INSTITUTO DE LA FUNCIÓN REGISTRAL\\\\INSCRITO EN EL FOLIO REAL {t['folio_real']} -- PARTIDA 415 -- LIBRO PRIMERO}}
"""


def predial(i: dict, hoy: date) -> str:
    t = {k: tex(v) for k, v in i.items()}
    pago = date(hoy.year, 1, 20).strftime("%d/%m/%Y")
    return f"""\\encabezado{{MUNICIPIO DE {t['municipio'].upper()}, {t['estado'].upper()}}}{{TESORERÍA MUNICIPAL -- CATASTRO E IMPUESTO PREDIAL}}
\\titulo{{RECIBO OFICIAL DE PAGO DEL IMPUESTO PREDIAL}}

\\hfill FOLIO: TM-{hoy.year}-{t['folio_real']}

\\hfill FECHA DE PAGO: {pago}

\\textbf{{DATOS DEL PREDIO}}

""" + tabla([
        ("CLAVE CATASTRAL", i["clave"]),
        ("PROPIETARIO / CONTRIBUYENTE", i["titular"]),
        ("UBICACIÓN", f"{i['calle'].upper()} No. {i['numero']}, COL. {i['colonia'].upper()}, {i['municipio'].upper()}"),
        ("SUPERFICIE DE TERRENO (M2)", i["superficie"]),
        ("SUPERFICIE DE CONSTRUCCIÓN (M2)", i["construccion"]),
        ("USO DEL PREDIO", "COMERCIAL"),
    ]) + "\n\\textbf{DATOS DE LA CONTRIBUCIÓN}\n\n" + tabla([
        ("EJERCICIO FISCAL PAGADO", f"{hoy.year} (BIMESTRES 1 AL 6, PAGO ANUAL)"),
        ("RECARGOS Y MULTAS", "0.00"),
        ("ADEUDOS DE EJERCICIOS ANTERIORES", "NO PRESENTA ADEUDOS"),
        ("ESTADO DE LA CUENTA", "AL CORRIENTE"),
    ]) + f"""
Este recibo es el comprobante oficial del pago del impuesto predial correspondiente al ejercicio fiscal {hoy.year}.

\\pagado{{PAGADO -- CAJA 2 -- TESORERÍA MUNICIPAL\\\\{pago}}}

\\vspace{{0.8cm}}
Firma y sello del cajero recaudador de la Tesorería Municipal de {t['municipio']}.
"""


def alineamiento(i: dict, emision: date) -> str:
    t = {k: tex(v) for k, v in i.items()}
    cabeza = (f"\\encabezado{{H. AYUNTAMIENTO CONSTITUCIONAL DE {t['municipio'].upper()}}}"
              f"{{{t['estado']} -- DIRECCIÓN DE DESARROLLO URBANO Y OBRAS PÚBLICAS}}\n")
    firma = f"\\vspace{{1.4cm}}\n{t['director']}\\\\DIRECTOR(A) DE DESARROLLO URBANO Y OBRAS PÚBLICAS -- FIRMA Y SELLO\n"
    return cabeza + f"""\\titulo{{CONSTANCIA DE ALINEAMIENTO}}

\\hfill FOLIO: DDU/ALI/{emision.strftime('%m%d')}/{emision.year}

{t['municipio']}, {t['estado']}, a {larga(emision)}.

C. {t['titular']}: Esta Dirección, en contestación a su solicitud, ha señalado el alineamiento del predio ubicado en
{tex(direccion(i))}, Municipio de {t['municipio']}, {t['estado']}. CLAVE CATASTRAL: {t['clave']}.

""" + tabla([
        ("SUPERFICIE DEL PREDIO", f"{i['superficie']} m2"),
        ("ALINEAMIENTO OFICIAL", f"{i['frente']} m de frente a {i['calle']}. Sección de vialidad: 18.00 m"),
        ("RESTRICCIÓN DE CONSTRUCCIÓN AL FRENTE", "0.00 m"),
        ("AFECTACIONES", "NINGUNA. El predio no presenta afectaciones ni restricciones."),
        ("VIGENCIA", "Un año a partir de su expedición"),
    ]) + firma + "\n\\newpage\n" + cabeza + f"""\\titulo{{CONSTANCIA DE NÚMERO OFICIAL}}

\\hfill FOLIO: DDU/CNO/{emision.strftime('%m%d')}/{emision.year}

EL QUE SUSCRIBE, DIRECTOR(A) DE DESARROLLO URBANO Y OBRAS PÚBLICAS, hace constar que al predio ubicado en
{t['calle']}, {t['lote']}, Col. {t['colonia']}, Municipio de {t['municipio']}, {t['estado']}, identificado con la clave
catastral {t['clave']}, a nombre de {t['titular']}, le corresponde el

\\begin{{center}}{{\\LARGE\\bfseries NÚMERO OFICIAL: {t['numero']}}}\\end{{center}}

Se extiende la presente a petición del interesado para los usos y fines legales a que haya lugar.

Fecha de expedición: {larga(emision)}. Vigencia: un año a partir de su expedición.

""" + firma


def uso_de_suelo(i: dict, emision: date) -> str:
    t = {k: tex(v) for k, v in i.items()}
    vence = date(emision.year + 1, emision.month, min(emision.day, 28))
    return (f"\\encabezado{{H. AYUNTAMIENTO CONSTITUCIONAL DE {t['municipio'].upper()}}}"
            f"{{{t['estado']} -- DIRECCIÓN DE DESARROLLO URBANO Y METROPOLITANO}}\n"
            f"\\titulo{{LICENCIA DE USO DEL SUELO}}\n\n"
            f"\\hfill FOLIO: DDU/LUS/{emision.strftime('%m%d')}/{emision.year}\n\n") + tabla([
        ("NOMBRE", i["titular"]),
        ("DOMICILIO DEL PREDIO", direccion(i)),
        ("LOCALIDAD", f"{i['municipio']}, {i['estado']}"),
        ("CLAVE CATASTRAL", i["clave"]),
        ("SUPERFICIE DEL PREDIO", f"{i['superficie']} m2"),
        ("ZONA (PMDU)", i["zona"]),
        ("USO DE SUELO QUE SE AUTORIZA", "COMERCIAL"),
        ("GIRO AUTORIZADO", "TIENDA DE AUTOSERVICIO (MINISÚPER) Y COMERCIO DE PRODUCTOS BÁSICOS"),
        ("CONDICIONANTES Y RESTRICCIONES", "NINGUNA"),
        ("FECHA DE EXPEDICIÓN", larga(emision).upper()),
        ("VIGENCIA", larga(vence).upper()),
    ]) + f"""
La presente licencia autoriza el uso comercial del predio para el giro indicado, en toda la superficie del predio, con
fundamento en el Plan Municipal de Desarrollo Urbano vigente.

\\vspace{{1.4cm}}
AUTORIZA: {t['director']}\\\\DIRECTOR(A) DE DESARROLLO URBANO Y METROPOLITANO -- FIRMA Y SELLO
"""


def compilar(cuerpo: str, destino: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        fuente = Path(tmp) / "doc.tex"
        fuente.write_text(PREAMBULO + cuerpo + CIERRE, encoding="utf-8")
        r = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "-enable-installer", "doc.tex"],
            cwd=tmp, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600,
        )
        pdf = Path(tmp) / "doc.pdf"
        if r.returncode != 0 or not pdf.exists():
            errores = [l for l in r.stdout.splitlines() if l.startswith("!") or "Error" in l][:5]
            raise RuntimeError(f"pdflatex falló en {destino.name}: {errores or r.stdout[-400:]}")
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(pdf, destino)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    if shutil.which("pdflatex") is None:
        print("No se encontró pdflatex. Instala MiKTeX o TeX Live.")
        return 1
    salida = Path(sys.argv[1])
    hoy = date.today()
    for n, inmueble in enumerate(INMUEBLES):
        carpeta = salida / inmueble["carpeta"]
        compilar(escritura(inmueble), carpeta / "01 Escritura.pdf")
        compilar(predial(inmueble, hoy), carpeta / "02 Predial.pdf")
        compilar(alineamiento(inmueble, hoy - timedelta(days=60 + 20 * n)), carpeta / "03 Alineamiento y Numero Oficial.pdf")
        compilar(uso_de_suelo(inmueble, hoy - timedelta(days=45 + 15 * n)), carpeta / "04 Licencia de Uso de Suelo.pdf")
        print(f"{carpeta}: 4 documentos", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
