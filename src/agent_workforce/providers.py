"""Model provider abstraction. One function, dict dispatch.

Add a provider by adding an entry to PROVIDERS: name -> callable.
"""

import json
from dataclasses import dataclass, field

from groq import Groq


@dataclass
class ModelResult:
    text: str
    input_tokens: int
    output_tokens: int
    tools_used: list[str] = field(default_factory=list)


def _run_groq(model: str, system: str, prompt: str, capabilities: set[str]) -> ModelResult:
    # ponytail: web search on Groq is baked into "compound" models, not a
    # tools= flag, so there's nothing to request here. If the model used one,
    # it shows up in executed_tools; otherwise this list is just empty.
    client = Groq()
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = client.chat.completions.create(model=model, messages=messages)
    message = resp.choices[0].message
    text = message.content or ""
    tools_used = [
        f"web search: {json.loads(t.arguments).get('query', '')}"
        for t in (getattr(message, "executed_tools", None) or [])
        if t.type == "search"
    ]
    return ModelResult(text, resp.usage.prompt_tokens, resp.usage.completion_tokens, tools_used)


PROVIDERS = {
    "groq": _run_groq,
}


def run_model(
    provider: str, model: str, system: str, prompt: str, capabilities: set[str] = frozenset()
) -> ModelResult:
    if provider not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider}")
    return PROVIDERS[provider](model, system, prompt, capabilities)
