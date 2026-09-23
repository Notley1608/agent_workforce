"""Secret substitution + SSRF guard for outbound REST connectors.

Standalone and unwired: no outbound HTTP call happens here. Secrets are
resolved from env vars into headers only (never URLs, which leak into
history/proxy logs/Referer), and every resolved value must be redacted
before it reaches a log or persisted job output. The SSRF guard blocks
requests to private/loopback/link-local/multicast/reserved/unspecified
addresses so a connector can't be pointed at internal infrastructure
(including the cloud metadata IP).
"""

import http.client
import ipaddress
import os
import re
import socket
import ssl
import time
from urllib.parse import urljoin, urlsplit

PLACEHOLDER_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")

MAX_REDIRECTS = 5
REQUEST_TIMEOUT = 10
MAX_RESPONSE_BYTES = 1_000_000
MAX_CONNECTOR_SECONDS = 30
REDIRECT_STATUSES = (301, 302, 303, 307, 308)


def resolve_secrets(headers: dict[str, str], url: str) -> tuple[dict[str, str], list[str]]:
    if PLACEHOLDER_RE.search(url):
        raise ValueError("secret placeholders are not allowed in the URL")

    resolved_headers: dict[str, str] = {}
    secret_values: list[str] = []

    for key, value in headers.items():
        def substitute(match: re.Match) -> str:
            name = match.group(1)
            if name not in os.environ:
                raise ValueError(f"secret env var not set: {name}")
            secret_value = os.environ[name]
            if secret_value == "":
                raise ValueError(f"secret env var is set but empty: {name}")
            secret_values.append(secret_value)
            return secret_value

        resolved_headers[key] = PLACEHOLDER_RE.sub(substitute, value)

    return resolved_headers, secret_values


def redact(text: str, secret_values: list[str]) -> str:
    for value in sorted(set(secret_values), key=len, reverse=True):
        if value:
            text = text.replace(value, "[REDACTED]")
    return text


def guard_ssrf(url: str) -> list[str]:
    hostname = urlsplit(url).hostname
    addresses = []
    for family, _, _, _, sockaddr in socket.getaddrinfo(hostname, None):
        addr = sockaddr[0]
        if addr in addresses:
            continue
        ip = ipaddress.ip_address(addr)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError(f"blocked SSRF-prone target: {addr}")
        addresses.append(addr)
    return addresses
