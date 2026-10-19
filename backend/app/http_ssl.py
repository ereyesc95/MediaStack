"""Outbound HTTP with corporate-MITM SSL fallback (shared process flag)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

_log = logging.getLogger(__name__)

# After a corporate-MITM SSL failure, reuse verify=False for this process.
_ssl_verify: bool = True


def is_ssl_error(exc: BaseException) -> bool:
    msg = str(exc).casefold()
    return "certificate" in msg or "ssl" in msg


def ssl_verify_enabled() -> bool:
    return _ssl_verify


def disable_ssl_verify() -> None:
    global _ssl_verify
    if _ssl_verify:
        _ssl_verify = False
        _log.warning(
            "TLS certificate verify disabled for outbound HTTP (corporate proxy)"
        )


async def aget(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
    follow_redirects: bool = False,
) -> httpx.Response:
    """GET with one retry using verify=False after an SSL failure."""
    global _ssl_verify
    verify_order = (True, False) if _ssl_verify else (False,)
    last_exc: Exception | None = None
    for verify in verify_order:
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                verify=verify,
                follow_redirects=follow_redirects,
            ) as client:
                return await client.get(url, params=params, headers=headers)
        except httpx.HTTPError as exc:
            last_exc = exc
            if verify and is_ssl_error(exc):
                disable_ssl_verify()
                continue
            raise
    assert last_exc is not None
    raise last_exc


def sget(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
    follow_redirects: bool = False,
) -> httpx.Response:
    """Sync GET with the same corporate-MITM SSL retry as ``aget``."""
    global _ssl_verify
    verify_order = (True, False) if _ssl_verify else (False,)
    last_exc: Exception | None = None
    for verify in verify_order:
        try:
            with httpx.Client(
                timeout=timeout,
                verify=verify,
                follow_redirects=follow_redirects,
            ) as client:
                return client.get(url, params=params, headers=headers)
        except httpx.HTTPError as exc:
            last_exc = exc
            if verify and is_ssl_error(exc):
                disable_ssl_verify()
                continue
            raise
    assert last_exc is not None
    raise last_exc
