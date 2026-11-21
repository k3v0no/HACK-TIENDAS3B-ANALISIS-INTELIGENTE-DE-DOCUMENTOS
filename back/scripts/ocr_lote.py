"""OCR por lote: procesa todos los PDFs de una carpeta y deja el resultado en el caché.

Uso (desde back/):  .venv\\Scripts\\python -m scripts.ocr_lote <carpeta_con_pdfs>

Solo imprime conteos y confianzas; nunca el texto de los documentos.
"""
import sys
import time
from pathlib import Path

from app import ocr


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    carpeta = Path(sys.argv[1])
    extensiones = {".pdf", ".jpg", ".jpeg", ".png"}
    pdfs = sorted(
        f
        for f in carpeta.rglob("*")
        if f.suffix.lower() in extensiones and not f.name.startswith("._") and "__MACOSX" not in f.parts
    )
    if not pdfs:
        print(f"No hay documentos en {carpeta}")
        return 1

    fallidos = 0
    inicio_total = time.perf_counter()
    for i, pdf in enumerate(pdfs, start=1):
        inicio = time.perf_counter()
        try:
            documento = ocr.ocr_pdf(pdf)
        except Exception as exc:
            fallidos += 1
            print(f"[{i}/{len(pdfs)}] ERROR {type(exc).__name__} en {pdf.parent.name}/{pdf.name}")
            continue
        paginas = documento["paginas"]
        lineas = sum(len(p["lineas"]) for p in paginas)
        confianzas = [p["confianza_ocr"] for p in paginas if p["confianza_ocr"] is not None]
        media = sum(confianzas) / len(confianzas) if confianzas else 0.0
        print(
            f"[{i}/{len(pdfs)}] {pdf.parent.name}/{pdf.name}: {len(paginas)} páginas, "
            f"{lineas} líneas, confianza media {media:.2f}, {time.perf_counter() - inicio:.1f} s"
        )

    print(f"Listo: {len(pdfs) - fallidos} de {len(pdfs)} PDFs en {time.perf_counter() - inicio_total:.0f} s")
    return 1 if fallidos else 0


if __name__ == "__main__":
    sys.exit(main())
