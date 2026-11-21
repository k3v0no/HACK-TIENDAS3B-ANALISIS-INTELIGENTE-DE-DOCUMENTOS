"""Fábrica del LLM. Los agentes piden el modelo aquí para poder cambiarlo por configuración."""
from functools import lru_cache

from .config import settings


@lru_cache
def obtener_llm():
    if not settings.deepseek_api_key:
        raise RuntimeError("Falta DEEPSEEK_API_KEY en back/.env")
    from langchain_deepseek import ChatDeepSeek

    return ChatDeepSeek(
        model=settings.llm_model,
        api_key=settings.deepseek_api_key,
        temperature=0,
        max_retries=2,
        timeout=120,
    )


def con_esquema(esquema):
    """LLM que responde con una instancia validada del modelo Pydantic `esquema`."""
    estructurado = obtener_llm().with_structured_output(esquema, method="function_calling")
    return estructurado.with_retry(stop_after_attempt=2)
