"""Carga expedientes en el back a través de la API: cada subcarpeta es un expediente.

Uso (con el back encendido), desde back/:
    .venv\\Scripts\\python -m scripts.cargar_carpetas <carpeta> [cuenta] [origen]

`cuenta` es el usuario al que se le asignan (por defecto «arrendador») y `origen` es
«arrendador» o «3b» (por defecto «arrendador»).
"""
import sys
import time
from pathlib import Path

import httpx

from app.config import settings

BACK = "http://127.0.0.1:8000"
EXTENSIONES = {".pdf", ".jpg", ".jpeg", ".png"}


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    sys.stdout.reconfigure(encoding="utf-8")
    raiz = Path(sys.argv[1])
    cuenta = sys.argv[2] if len(sys.argv) > 2 else "arrendador"
    origen = sys.argv[3] if len(sys.argv) > 3 else "arrendador"
    clave = {"X-API-Key": settings.api_key}
    carpetas = sorted(c for c in raiz.iterdir() if c.is_dir())
    if not carpetas:
        print(f"No hay subcarpetas en {raiz}")
        return 1

    fallidos = 0
    with httpx.Client(base_url=BACK, timeout=60) as api:
        for carpeta in carpetas:
            archivos = sorted(f for f in carpeta.iterdir() if f.suffix.lower() in EXTENSIONES)
            if not archivos:
                continue
            inicio = time.perf_counter()
            r = api.post("/expedientes", headers={**clave, "X-Usuario": cuenta}, data={"origen": origen, "cuenta": cuenta},
                         files=[("archivos", (f.name, f.read_bytes(), "application/octet-stream")) for f in archivos])
            r.raise_for_status()
            eid = r.json()["id"]
            while True:
                time.sleep(3)
                try:
                    e = api.get(f"/expedientes/{eid}", headers={**clave, "X-Usuario": "sistema"}).json()
                except httpx.HTTPError:
                    continue  # el back puede tardar en responder mientras carga los modelos de OCR
                if e["estado"] in ("listo", "error"):
                    break
            d = e.get("dictamen") or {}
            fallidos += e["estado"] != "listo"
            print(f"[{carpeta.name}] {eid} {e['estado']}: {d.get('recomendacion', e.get('error'))} | "
                  f"{len(d.get('hallazgos', []))} hallazgos | {len(archivos)} documentos | "
                  f"{time.perf_counter() - inicio:.0f} s", flush=True)
            for h in d.get("hallazgos", []):
                print(f"     [{h['severidad']}] {h['regla_id']} {h['titulo']}")
    return 1 if fallidos else 0


if __name__ == "__main__":
    sys.exit(main())
