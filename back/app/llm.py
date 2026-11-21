"""Fábrica del LLM. Los agentes piden el modelo aquí para poder cambiarlo por configuración.

Con LLM_BASE_URL se usa cualquier servicio compatible con la API de OpenAI (por ejemplo
Deploy); sin ella, la API directa de DeepSeek.
"""
from functools import lru_cache

from .config import settings


@lru_cache
def obtener_llm():
    if not settings.deepseek_api_key:
        raise RuntimeError("Falta DEEPSEEK_API_KEY en back/.env")

    comunes = dict(
        model=settings.llm_model,
        api_key=settings.deepseek_api_key,
        temperature=0,
        max_retries=2,
        timeout=120,
    )
    if settings.llm_base_url:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(base_url=settings.llm_base_url, **comunes)

    from langchain_deepseek import ChatDeepSeek

    return ChatDeepSeek(**comunes)


def con_esquema(esquema):
    """LLM que responde con una instancia validada del modelo Pydantic `esquema`."""
    estructurado = obtener_llm().with_structured_output(esquema, method="function_calling")
    return estructurado.with_retry(stop_after_attempt=2)
