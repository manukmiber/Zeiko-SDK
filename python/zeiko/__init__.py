"""A Python client for the Zeiko Cloud API. Nothing to install but Python."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Callable, Dict, Optional

from ._operations import Operations

__all__ = ["Zeiko", "ZeikoError"]

_WRITES = {"POST", "PUT", "PATCH", "DELETE"}
_LONGEST_WAIT = 60.0


class ZeikoError(Exception):
    """What the API refused, in its own words."""

    def __init__(self, message: str, status: int, code: str, request_id: str):
        super().__init__(message)
        self.status = status
        self.code = code
        #: Quote this when asking us about a call.
        self.request_id = request_id


class Zeiko(Operations):
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.zeiko.biz.id",
        retries: int = 3,
        timeout: float = 60.0,
        opener: Optional[Callable[..., Any]] = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        if not api_key:
            raise ValueError("api_key is required")
        base = base_url.rstrip("/")
        self._base = base[:-3] if base.endswith("/v1") else base
        self._key = api_key
        self._retries = retries
        self._timeout = timeout
        self._open = opener or urllib.request.urlopen
        self._sleep = sleep

    def request(
        self,
        method: str,
        path: str,
        query: Optional[Dict[str, Any]] = None,
        body: Any = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        url = self._base + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {"Authorization": f"Bearer {self._key}", "User-Agent": "zeiko-python"}
        # The same key on every try, so a retry can never do it twice.
        if method in _WRITES:
            headers["Idempotency-Key"] = idempotency_key or str(uuid.uuid4())
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        attempt = 0
        while True:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with self._open(req, timeout=self._timeout) as res:
                    return _parse(res.read())
            except urllib.error.HTTPError as err:
                if (err.code == 429 or err.code >= 500) and attempt < self._retries:
                    self._sleep(_wait_of(err.headers.get("Retry-After"), attempt))
                else:
                    raise _refusal(err) from None
            except urllib.error.URLError:
                if attempt >= self._retries:
                    raise
                self._sleep(_backoff(attempt))
            attempt += 1

    def wait_for_request(self, vps_id: str, request_id: str, every: float = 15.0, timeout: float = 3600.0) -> Any:
        """Waits until a VPS request is answered, and gives it back."""

        def look() -> Any:
            services = self.request("GET", "/v1/vps").get("services", [])
            vps = next((s for s in services if s.get("id") == vps_id), {})
            asked = next((r for r in vps.get("requests", []) if r.get("id") == request_id), None)
            if asked is None:
                raise ZeikoError("That request was not found.", 404, "no_request", "")
            return None if asked.get("status") == "open" else asked

        return self._until(look, every, timeout)

    def wait_for_payment(self, payment_id: str, every: float = 10.0, timeout: float = 3600.0) -> Any:
        """Waits until a QRIS payment is no longer waiting, and gives it back."""

        def look() -> Any:
            p = self.get_payments_pay_qris(payment_id)
            return None if p.get("status") in ("waiting", "confirming") else p

        return self._until(look, every, timeout)

    def _until(self, look: Callable[[], Any], every: float, timeout: float) -> Any:
        end = time.monotonic() + timeout
        while True:
            found = look()
            if found:
                return found
            if time.monotonic() >= end:
                raise TimeoutError("Still waiting when the time ran out.")
            self._sleep(every)


def _parse(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def _backoff(attempt: int) -> float:
    return min(0.5 * 2**attempt, _LONGEST_WAIT)


def _wait_of(retry_after: Optional[str], attempt: int) -> float:
    try:
        seconds = float(retry_after or 0)
    except ValueError:
        seconds = 0
    return min(seconds, _LONGEST_WAIT) if seconds > 0 else _backoff(attempt)


def _refusal(err: urllib.error.HTTPError) -> ZeikoError:
    data = _parse(err.read()) or {}
    e = data.get("error", {}) if isinstance(data, dict) else {}
    return ZeikoError(
        e.get("message") or f"The API answered {err.code}.",
        err.code,
        e.get("code") or "unknown",
        err.headers.get("X-Request-Id") or "",
    )
