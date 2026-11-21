"""Simulación de cuentas con contraseña y permisos por área.

Las cuentas viven en `modules/usuarios.json` (local, ignorado por git) con la contraseña
cifrada con PBKDF2. La primera vez se crean las cuentas iniciales con su sal y su hash ya
calculados: la contraseña no aparece en el código (el repositorio es público).

En producción esto lo resuelve el back con un proveedor de identidad; aquí solo se simula
para mostrar cómo cambia lo que ve cada área.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ARCHIVO = Path(os.environ.get("USUARIOS_FILE") or RAIZ / "modules" / "usuarios.json")

TIPO_TRABAJADOR = "Trabajador 3B"
TIPO_ARRENDADOR = "Arrendador"

# Permisos: recurso.acción. Los perfiles son conjuntos de permisos (datos, no código).
PERMISOS = {
    "Superusuario": {"usuarios.admin"},
    "Jurídico": {"expedientes.ver", "expedientes.cargar", "documentos.ver", "propietario.ver",
                 "inmueble.ver", "fiscal.ver", "regulatorio.ver", "hallazgos.ver", "dictamen.decidir"},
    "Analista de expansión": {"expedientes.ver", "expedientes.cargar", "documentos.ver",
                              "propietario.ver", "inmueble.ver", "regulatorio.ver", "hallazgos.ver"},
    "Gestor de trámites": {"expedientes.ver", "documentos.ver", "inmueble.ver", "regulatorio.ver",
                           "hallazgos.ver"},
    "Fiscal": {"expedientes.ver", "documentos.ver", "propietario.ver", "inmueble.ver",
               "fiscal.ver", "hallazgos.ver"},
    "Gerente": {"expedientes.ver", "inmueble.ver", "regulatorio.ver", "hallazgos.ver",
                "dictamen.decidir"},
    "Auditor": {"expedientes.ver", "documentos.ver", "propietario.ver", "inmueble.ver",
                "fiscal.ver", "regulatorio.ver", "hallazgos.ver"},
    TIPO_ARRENDADOR: {"propios.cargar", "propios.ver"},
}
PERFILES_TRABAJADOR = [p for p in PERMISOS if p != TIPO_ARRENDADOR]

DESCRIPCION_PERFIL = {
    "Superusuario": "Da de alta a trabajadores. No ve expedientes.",
    "Jurídico": "Ve todo el expediente y emite el dictamen.",
    "Analista de expansión": "Carga y revisa expedientes, sin datos fiscales.",
    "Gestor de trámites": "Revisa vigencias y documentos municipales.",
    "Fiscal": "Revisa predial, contribuyente y clave catastral.",
    "Gerente": "Ve resultados y decide, sin documentos originales.",
    "Auditor": "Consulta todo en solo lectura.",
}

# usuario, nombre, tipo, perfil, sal y hash PBKDF2 de la contraseña (igual que el front en Angular).
_SEMILLA = [
    ("admin", "Ana Torres", TIPO_TRABAJADOR, "Superusuario",
     "27e2100ca2cc2540bf5aa31ce26f061a", "029b3bb5c9e16554a4e8ec27362a35121e526d38591d0c53ffb05e2a5cc14e15"),
    ("juridico", "Luis Herrera", TIPO_TRABAJADOR, "Jurídico",
     "2bc1f6ba14e9801df7f13c2c9856520c", "7259fdb39ddf6199f6ce31db2e0469d58f8f3c289ef67f07de53f43580c0e3a2"),
    ("analista", "Carla Méndez", TIPO_TRABAJADOR, "Analista de expansión",
     "3de0b8da01c1f1aa3f0a2722d2481873", "e1dcab100bf96d9551f0af022a2d8d4c964d790250cd9f3bb5ea807ce35bbf22"),
    ("fiscal", "Jorge Ramos", TIPO_TRABAJADOR, "Fiscal",
     "68bfc2b8a68a719fe0ae9047996cfe19", "d1d3067fb27f91e099eb4e79cc469bb48ee7c7277e353b335adc5afff9a3a3b3"),
    ("gestor", "Sofía Núñez", TIPO_TRABAJADOR, "Gestor de trámites",
     "65620e0561541a7e3028b58891f17249", "bb6886f78f9fa1959814126ae65f5a3805abc81ecd92d79673327144c015ba26"),
    ("gerente", "Raúl Ortega", TIPO_TRABAJADOR, "Gerente",
     "ea17841418de4da637dbcf7695a9295c", "500b73a9724d0abf14a5badcfde0bb63b12ae8d631e46c676a66dd4a55c850f4"),
    ("arrendador", "Patricia Lara", TIPO_ARRENDADOR, TIPO_ARRENDADOR,
     "20fedfeb277c6e30c850bbfd847176fd", "7bcb76833693286bbd267db09bba6b1827d95760a2f93a5930435fcd8241c0eb"),
]


def _hash(clave: str, sal: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", clave.encode(), bytes.fromhex(sal), 120_000).hex()


def _nuevo_registro(usuario: str, nombre: str, tipo: str, perfil: str, clave: str) -> dict:
    sal = secrets.token_hex(16)
    return {"usuario": usuario, "nombre": nombre, "tipo": tipo, "perfil": perfil,
            "sal": sal, "hash": _hash(clave, sal), "activo": True}


def _cargar() -> dict[str, dict]:
    if not ARCHIVO.exists():
        datos = {u: {"usuario": u, "nombre": n, "tipo": t, "perfil": p, "sal": sal, "hash": h, "activo": True}
                 for u, n, t, p, sal, h in _SEMILLA}
        _guardar(datos)
        return datos
    return json.loads(ARCHIVO.read_text(encoding="utf-8"))


def _guardar(datos: dict[str, dict]) -> None:
    ARCHIVO.parent.mkdir(parents=True, exist_ok=True)
    ARCHIVO.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")


def _publico(reg: dict) -> dict:
    return {k: reg[k] for k in ("usuario", "nombre", "tipo", "perfil", "activo")}


def autenticar(usuario: str, clave: str, tipo: str) -> dict | None:
    """Devuelve la cuenta (sin hash) si usuario, contraseña y tipo coinciden."""
    reg = _cargar().get(usuario.strip().lower())
    if not reg or not reg.get("activo") or reg["tipo"] != tipo:
        return None
    if not hmac.compare_digest(reg["hash"], _hash(clave, reg["sal"])):
        return None
    return _publico(reg)


def registrar_arrendador(usuario: str, nombre: str, clave: str) -> dict:
    datos = _cargar()
    usuario = usuario.strip().lower()
    if usuario in datos:
        raise ValueError("ese usuario ya existe; elige otro")
    datos[usuario] = _nuevo_registro(usuario, nombre.strip(), TIPO_ARRENDADOR, TIPO_ARRENDADOR, clave)
    _guardar(datos)
    return _publico(datos[usuario])


def crear_trabajador(usuario: str, nombre: str, perfil: str) -> tuple[dict, str]:
    """Crea una cuenta de trabajador con contraseña temporal. Devuelve (cuenta, contraseña)."""
    if perfil not in PERFILES_TRABAJADOR:
        raise ValueError("perfil no válido")
    datos = _cargar()
    usuario = usuario.strip().lower()
    if usuario in datos:
        raise ValueError("ese usuario ya existe; elige otro")
    temporal = secrets.token_urlsafe(6)
    datos[usuario] = _nuevo_registro(usuario, nombre.strip(), TIPO_TRABAJADOR, perfil, temporal)
    _guardar(datos)
    return _publico(datos[usuario]), temporal


def cambiar_estado(usuario: str, activo: bool) -> None:
    datos = _cargar()
    if usuario in datos:
        datos[usuario]["activo"] = activo
        _guardar(datos)


def trabajadores() -> list[dict]:
    return [_publico(r) for r in _cargar().values() if r["tipo"] == TIPO_TRABAJADOR]


def puede(cuenta: dict | None, permiso: str) -> bool:
    return bool(cuenta) and permiso in PERMISOS.get(cuenta["perfil"], set())


# Qué permiso hace falta para ver cada dato extraído.
def permiso_de_campo(campo: str) -> str:
    c = campo.lower()
    if any(p in c for p in ("propietario", "contribuyente", "titular")):
        return "propietario.ver"
    if any(p in c for p in ("clave", "cuenta predial", "adeudo", "pago")):
        return "fiscal.ver"
    if any(p in c for p in ("uso", "alineamiento", "vigencia", "emisión", "autoridad",
                            "restricci", "compatib", "condicion")):
        return "regulatorio.ver"
    return "inmueble.ver"
