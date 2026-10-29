"""Outbound HTTP with corporate-MITM SSL fallback (shared process flag)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

_log = logging.getLogger(__name__)

# After a corporate-MITM SSL failure, reuse verify=False for this process.
_ssl_verify: bool = True


def is_ssl_error(exc: BaseException) -> bool:
    parts = [str(exc)]
    cur: BaseException | None = exc
    seen = 0
    while cur is not None and seen < 6:
        parts.append(str(cur))
        if cur.__cause__ is not None and cur.__cause__ is not cur:
            cur = cur.__cause__
        elif cur.__context__ is not None and cur.__context__ is not cur:
            cur = cur.__context__
        else:
            break
        seen += 1
    msg = " ".join(parts).casefold()
    return (
        "certificate" in msg
        or "ssl" in msg
        or "certifi" in msg
        or "certificate_verify_failed" in msg
    )


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
    return await arequest(
        "GET",
        url,
        params=params,
        headers=headers,
        timeout=timeout,
        follow_redirects=follow_redirects,
    )


async def apost(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    content: str | bytes | None = None,
    data: dict[str, Any] | None = None,
    json: Any | None = None,
    timeout: float = 30.0,
    follow_redirects: bool = False,
) -> httpx.Response:
    """POST with the same corporate-MITM SSL retry as ``aget``."""
    return await arequest(
        "POST",
        url,
        params=params,
        headers=headers,
        content=content,
        data=data,
        json=json,
        timeout=timeout,
        follow_redirects=follow_redirects,
    )


async def arequest(
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    content: str | bytes | None = None,
    data: dict[str, Any] | None = None,
    json: Any | None = None,
    timeout: float = 30.0,
    follow_redirects: bool = False,
) -> httpx.Response:
    """Async HTTP with one retry using verify=False after an SSL failure."""
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
                return await client.request(
                    method,
                    url,
                    params=params,
                    headers=headers,
                    content=content,
                    data=data,
                    json=json,
                )
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
