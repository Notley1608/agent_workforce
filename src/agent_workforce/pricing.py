"""Rough cost estimates, USD per 1M tokens (input, output).

Approximate published rates — edit to match your actual plan/pricing tier.
Unknown models return None rather than a guessed number.
"""

RATES = {
    "openai/gpt-oss-120b": (0.15, 0.75),
    "groq/compound": (0.15, 0.75),
}


def estimate_cost(model: str, input_tokens: int | None, output_tokens: int | None) -> float | None:
    rates = RATES.get(model)
    if not rates or input_tokens is None or output_tokens is None:
        return None
    in_rate, out_rate = rates
    return round((input_tokens * in_rate + output_tokens * out_rate) / 1_000_000, 6)
