"""Simulación de cuentas con contraseña y permisos por área.

Las cuentas viven en `modules/usuarios.json` (local, ignorado por git) con la contraseña
cifrada con PBKDF2. La primera vez se crean cuentas de prueba para la demo.

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
CLAVE_PRUEBA = "demo3b"

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

_SEMILLA = [
    ("admin", "Ana Torres", TIPO_TRABAJADOR, "Superusuario"),
    ("juridico", "Luis Herrera", TIPO_TRABAJADOR, "Jurídico"),
    ("analista", "Carla Méndez", TIPO_TRABAJADOR, "Analista de expansión"),
    ("fiscal", "Jorge Ramos", TIPO_TRABAJADOR, "Fiscal"),
    ("gestor", "Sofía Núñez", TIPO_TRABAJADOR, "Gestor de trámites"),
    ("gerente", "Raúl Ortega", TIPO_TRABAJADOR, "Gerente"),
    ("arrendador", "Patricia Lara", TIPO_ARRENDADOR, TIPO_ARRENDADOR),
]


def _hash(clave: str, sal: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", clave.encode(), bytes.fromhex(sal), 120_000).hex()


def _nuevo_registro(usuario: str, nombre: str, tipo: str, perfil: str, clave: str) -> dict:
    sal = secrets.token_hex(16)
    return {"usuario": usuario, "nombre": nombre, "tipo": tipo, "perfil": perfil,
            "sal": sal, "hash": _hash(clave, sal), "activo": True}


def _cargar() -> dict[str, dict]:
    if not ARCHIVO.exists():
        datos = {u: _nuevo_registro(u, n, t, p, CLAVE_PRUEBA) for u, n, t, p in _SEMILLA}
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


def cuentas_de_prueba() -> list[dict]:
    datos = _cargar()
    return [_publico(datos[u]) for u, *_ in _SEMILLA if u in datos]


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
