# Front en Streamlit (versión anterior)

> Reemplazado por el front en Angular de `../front/`. Se conserva como referencia; se puede borrar cuando el equipo lo decida.

## Cómo correrlo

```bash
# una sola vez, desde la raíz del repo
py -3 -m venv .venv
.venv/Scripts/python -m pip install -r front-streamlit/requirements.txt

# cada vez
cd front-streamlit
../.venv/Scripts/python -m streamlit run app.py               # http://localhost:8501
```

- El front habla con el back (`back/app/main.py`) por HTTP. Antes de abrir el front, enciende el
  back (ver `back/README.md`). Variables opcionales:
  - `BACK_URL`: dirección del back. Por defecto `http://127.0.0.1:8000`.
  - `BACK_API_KEY`: la misma clave que `API_KEY` en `back/.env`. Si el back corre en esta misma
    computadora no hace falta: el front la lee de `back/.env`.

  ```powershell
  $env:BACK_URL = "http://192.168.1.50:8000"   # solo si el back corre en otra laptop
  $env:BACK_API_KEY = "<la clave de back/.env>"
  ```
- `servicio.py`: manda los archivos a `POST /expedientes` (las fotos se convierten a PDF), consulta
  `GET /expedientes/{id}` hasta que termina y traduce el dictamen del back al formato del front.
  Si el back no responde, los expedientes se guardan y quedan en la bandeja como «Sin analizar».
- `contrato.py`: forma del dictamen que usan las vistas. Si el back cambia `app/schemas.py`, solo
  hay que ajustar `servicio.traducir`.
- Los archivos subidos y los dictámenes se guardan solo en local, en `modules/cargas/<id>/` (ignorado por git).

---

# Hackatón Tiendas 3B — Reto 1: Expedientes

Repositorio de trabajo del equipo para el reto **Sistema multiagente para análisis inteligente de documentos** del Hackatón Tiendas 3B.

> Este README reúne información publicada por la organización. No describe una propuesta de solución.

## Información del hackatón

- **Evento:** Hackatón Tiendas 3B — “Talento que hackea el futuro”.
- **Fecha y hora anunciadas:** sábado 21 de noviembre de 2026, 9:00 a. m. (hora del centro de México).
- **Reto elegido:** Reto 1 — Expedientes.
- **Bases generales:** [hackaton3b.com](https://hackaton3b.com/index.html).
- **Bases completas del reto:** [Reto 1: Expedientes](https://hackaton3b.com/expedientes.html).

## Descripción del reto

Tiendas 3B recibe expedientes legales y administrativos de inmuebles para evaluar locales comerciales e industriales que podrían habilitarse como tiendas o centros de distribución. La revisión manual requiere leer documentos, localizar información relevante, validar requisitos e identificar problemas.

El reto plantea automatizar la revisión inicial con IA generativa y una arquitectura multiagente construida con **LangChain**, para apoyar al equipo legal con un análisis sustentado en evidencia. El objetivo descrito por la organización es ayudar a revisar más expedientes y priorizar la intervención humana; la decisión legal final sigue correspondiendo al equipo legal.

## Tipos de documentos del expediente

Las bases mencionan, como mínimo, cuatro tipos documentales:

1. **Escrituras:** propietario o titular, dirección e identificación del inmueble, superficie del terreno y datos relevantes.
2. **Predial:** propietario o contribuyente, dirección, cuenta o clave predial y superficie registrada.
3. **Alineamiento y Número Oficial:** dirección oficial, número oficial, identificación del predio, alineamiento, vigencia cuando corresponda y autoridad emisora.
4. **Uso de Suelo:** dirección e identificación del inmueble, uso autorizado, compatibilidad comercial, restricciones, superficie aplicable, vigencia cuando corresponda y autoridad emisora.

Los criterios y reglas definitivos para evaluar los documentos se entregan junto con los datos del reto. Si existe alguna diferencia, prevalecen los documentos oficiales del comité organizador.

## Insumos publicados para el reto

La página oficial anuncia un paquete ZIP por tipo documental:

| Paquete | Contenido anunciado |
| --- | ---: |
| `Escrituras.zip` | 12 PDF · 52.3 MB |
| `Predial.zip` | 16 PDF · 11.6 MB |
| `Alineamiento_y_Numero_Oficial.zip` | 18 PDF · 9.6 MB |
| `Uso_de_suelo.zip` | 16 PDF · 19.4 MB |

Los paquetes están referenciados en la sección de descargas de las [bases del Reto 1](https://hackaton3b.com/expedientes.html#descargas). **No se incluyen en este repositorio:** las reglas oficiales indican que los documentos del reto se usan solo dentro del reto, no se suben a otros servicios ni se comparten fuera del equipo. Este repositorio es público; por ello, los archivos de datos no deben copiarse aquí. Consulten y utilicen los documentos únicamente conforme a las instrucciones y canales autorizados por la organización.

## Alcance y entregables descritos por la organización

Las bases indican que el sistema del reto debe poder analizar el expediente y presentar información como:

- Documentos recibidos y documentos faltantes.
- Datos relevantes extraídos y validaciones realizadas.
- Requisitos cumplidos y no cumplidos.
- Inconsistencias entre documentos y evidencia que sustenta cada hallazgo.
- Nivel de confianza y recomendación inicial: **Cumple**, **Requiere revisión** o **No cumple**.

También se solicita un prototipo funcional que permita ingresar un expediente y ejecutar el análisis, además de un pitch de **3 minutos** ante el jurado.

## Criterios de evaluación publicados

| Criterio | Peso |
| --- | ---: |
| Precisión del análisis | 30% |
| Explicabilidad y trazabilidad | 20% |
| Arquitectura multiagente y prototipo | 25% |
| Pitch | 25% |

La organización señala que la evaluación busca equilibrar precisión, explicabilidad y eficiencia, y que una respuesta generada por un LLM por sí sola no basta.

## Regla de uso de datos

Los documentos, imágenes y datos de 3B deben usarse solo dentro del reto. Las bases indican que no deben subirse a otros servicios ni compartirse fuera del equipo. Las decisiones presentadas deben provenir de la solución desarrollada por el equipo.

## Estado del proyecto

Este repositorio contiene únicamente información descriptiva del evento y del reto publicada por la organización. **Todavía no se documenta ni propone una solución.**
