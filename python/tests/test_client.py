import email.message
import io
import json
import unittest
import urllib.error

from zeiko import Zeiko, ZeikoError


class Answer(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def error(status, body=None, **headers):
    h = email.message.Message()
    for k, v in headers.items():
        h[k.replace("_", "-")] = v
    return urllib.error.HTTPError("https://x", status, "", h, io.BytesIO(json.dumps(body or {}).encode()))


def client(*answers):
    calls, slept, queue = [], [], list(answers)

    def opener(req, timeout=None):
        calls.append(req)
        a = queue.pop(0)
        if isinstance(a, Exception):
            raise a
        return Answer(json.dumps(a).encode())

    return Zeiko("zkc_test", base_url="https://api.example.test/v1/", opener=opener, sleep=slept.append), calls, slept


class ClientTest(unittest.TestCase):
    def test_a_call_carries_the_key_and_the_address(self):
        z, calls, _ = client({"services": []})
        self.assertEqual(z.request("GET", "/v1/vps", query={"limit": 5}), {"services": []})
        self.assertEqual(calls[0].full_url, "https://api.example.test/v1/vps?limit=5")
        self.assertEqual(calls[0].get_header("Authorization"), "Bearer zkc_test")
        self.assertIsNone(calls[0].get_header("Idempotency-key"))

    def test_a_retried_write_keeps_one_idempotency_key(self):
        z, calls, _ = client(error(503), urllib.error.URLError("broken"), {"ok": True})
        z.request("POST", "/v1/vps/order", body={"plan": "a"})
        self.assertEqual(len(calls), 3)
        self.assertTrue(calls[0].get_header("Idempotency-key"))
        self.assertEqual(calls[2].get_header("Idempotency-key"), calls[0].get_header("Idempotency-key"))

    def test_retry_after_is_obeyed(self):
        z, _, slept = client(error(429, Retry_After="7"), {})
        z.request("GET", "/v1/account")
        self.assertEqual(slept, [7.0])

    def test_a_refusal_is_raised_with_its_code(self):
        z, _, _ = client(error(404, {"error": {"code": "no_request", "message": "Not found."}}, X_Request_Id="r1"))
        with self.assertRaises(ZeikoError) as seen:
            z.request("GET", "/v1/vps/x")
        self.assertEqual((seen.exception.code, seen.exception.status, seen.exception.request_id), ("no_request", 404, "r1"))

    def test_waiting_ends_when_answered(self):
        vps = lambda s: {"services": [{"id": "v", "requests": [{"id": "q", "status": s}]}]}
        z, _, _ = client(vps("open"), vps("done"))
        self.assertEqual(z.wait_for_request("v", "q")["status"], "done")

    def test_generated_calls_fill_in_the_address(self):
        z, calls, _ = client({"status": "paid"})
        self.assertEqual(z.wait_for_payment("a/b")["status"], "paid")
        self.assertEqual(calls[0].full_url, "https://api.example.test/v1/payments/a%2Fb/qris")
