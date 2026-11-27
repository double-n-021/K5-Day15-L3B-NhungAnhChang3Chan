"""Automated contract verification tests for CHARGEPILOT API v1.0.0."""
from __future__ import annotations

import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request

CODEBASE_DIR = os.path.dirname(os.path.abspath(__file__))
if CODEBASE_DIR not in sys.path:
    sys.path.insert(0, CODEBASE_DIR)

import ai  # noqa: E402
import api_server  # noqa: E402


class ApiContractV1Test(unittest.TestCase):
    """Verify frozen v1.0.0 HTTP contract in-process using fake model mode."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._orig_provider = ai.MODEL_PROVIDER
        ai.MODEL_PROVIDER = "fake"
        api_server.SESSIONS.clear()
        api_server.PENDING_TOKENS.clear()
        api_server.LEADERBOARD.clear()

        cls.server = api_server.create_server("127.0.0.1", 0)
        cls.port = cls.server.server_address[1]
        cls.base_url = f"http://127.0.0.1:{cls.port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        ai.MODEL_PROVIDER = cls._orig_provider

    def _request(self, method: str, path: str, body=None, raw_bytes: bytes | None = None):
        url = self.base_url + path
        data = raw_bytes
        headers = {}
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        elif raw_bytes is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read()
                return resp.status, dict(resp.headers), raw
        except urllib.error.HTTPError as err:
            raw = err.read()
            return err.code, dict(err.headers), raw

    def _json(self, method: str, path: str, body=None, raw_bytes: bytes | None = None):
        status, headers, raw = self._request(method, path, body=body, raw_bytes=raw_bytes)
        payload = json.loads(raw.decode("utf-8")) if raw else None
        return status, headers, payload

    def test_web_health_release_and_apk_routes(self) -> None:
        status, headers, raw = self._request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers.get("Content-Type", ""))
        self.assertIn(b"CHARGEPILOT API", raw)

        status, _, health = self._json("GET", "/health")
        self.assertEqual(status, 200)
        self.assertTrue(health["ok"])
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["contract_version"], "1.0.0")
        self.assertIn("apk_available", health)

        status, _, _ = self._request("HEAD", "/health")
        self.assertEqual(status, 200)

        status, _, rel = self._json("GET", "/api/release")
        self.assertEqual(status, 200)
        self.assertIn("available", rel)

        if not rel["available"]:
            status, _, apk_err = self._json("GET", "/download/ChargePilot-AI.apk")
            self.assertEqual(status, 404)
            self.assertFalse(apk_err["ok"])

    def test_legacy_ask_and_structured_chat(self) -> None:
        status, _, resp = self._json(
            "POST",
            "/api/ask",
            {"text": "Mình đang ở Hồ Hoàn Kiếm, xe VF e34 còn 35%. Bây giờ 14:00 thứ Bảy, 16:30 đi Văn Miếu. Sạc ở đâu?"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["contract_version"], "1.0.0")
        self.assertEqual(resp["output"], resp["reply"])
        self.assertEqual(resp["reply"], resp["reply_text"])
        self.assertIn("latency_ms", resp["meta"])
        self.assertTrue(resp["stations"])

        status, _, struct_resp = self._json(
            "POST",
            "/api/chat",
            {
                "ev_model": "VinFast VF e34",
                "current_soc": 35,
                "target_soc": 80,
                "origin": "Hồ Hoàn Kiếm",
                "time": "14:00 thứ Bảy",
                "destination": "Văn Miếu",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(struct_resp["intent_state"], "recommendation")
        self.assertTrue(struct_resp["vehicle"]["known"])

    def test_v1_recommendation_schema(self) -> None:
        status, _, resp = self._json(
            "POST",
            "/api/v1/chat",
            {
                "message": "Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.",
                "session_id": "sess_rec_01",
            },
        )
        self.assertEqual(status, 200)
        expected_keys = {
            "ok", "contract_version", "session_id", "query", "intent_state",
            "output", "reply", "reply_text", "tts_summary", "vehicle", "battery",
            "weather", "stations", "charge_window", "green_reward",
            "follow_up_questions", "guardrails", "meta",
        }
        self.assertTrue(expected_keys.issubset(resp.keys()))
        self.assertEqual(resp["intent_state"], "recommendation")
        self.assertEqual(resp["output"], resp["reply_text"])
        self.assertLessEqual(len(resp["stations"]), 3)
        self.assertGreaterEqual(len(resp["stations"]), 1)
        st = resp["stations"][0]
        for field in ("rank", "id", "name", "lat", "lon", "road_km", "power_kw", "status", "status_label", "range_verified"):
            self.assertIn(field, st)
        self.assertIsNotNone(resp["charge_window"])
        self.assertTrue(resp["guardrails"]["passed"])

    def test_ask_back_multiturn_and_session_reset(self) -> None:
        sid = "sess_multi_01"
        status, _, r1 = self._json("POST", "/api/v1/chat", {"message": "Tìm trạm sạc giúp mình", "session_id": sid})
        self.assertEqual(status, 200)
        self.assertEqual(r1["intent_state"], "ask_back")
        self.assertTrue(r1["follow_up_questions"])

        status, _, r2 = self._json(
            "POST",
            "/api/v1/chat",
            {"message": "VF e34 pin 35% đang ở Cầu Giấy lúc 10:00 thứ Ba", "session_id": sid},
        )
        self.assertEqual(status, 200)
        self.assertEqual(r2["intent_state"], "recommendation")
        self.assertTrue(r2["stations"])

        status, _, reset_ok = self._json("POST", "/api/v1/session/reset", {"session_id": sid})
        self.assertEqual(status, 200)
        self.assertTrue(reset_ok["ok"])
        self.assertTrue(reset_ok["cleared"])

        status, _, reset_again = self._json("POST", "/api/v1/session/reset", {"session_id": sid})
        self.assertEqual(status, 200)
        self.assertFalse(reset_again["cleared"])

        status, _, reset_bad = self._json("POST", "/api/v1/session/reset", {})
        self.assertEqual(status, 400)
        self.assertFalse(reset_bad["ok"])

    def test_rescue_otp_scrubbing_and_refusal(self) -> None:
        status, _, rescue = self._json(
            "POST",
            "/api/v1/chat",
            {"message": "Pin còn 10%, VF e34, đang ở Phố Cổ lúc 18:00 thứ Tư"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(rescue["intent_state"], "rescue")
        self.assertTrue(rescue["battery"]["rescue_mode"])

        status, _, otp_resp = self._json(
            "POST",
            "/api/v1/chat",
            {"message": "Mã OTP của mình là 123456, thanh toán đặt cọc giúp mình với"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(otp_resp["intent_state"], "refusal")
        self.assertNotIn("123456", otp_resp["reply_text"])
        self.assertNotIn("123456", otp_resp["tts_summary"])
        self.assertNotIn("123456", otp_resp["query"])

        status, _, oos = self._json(
            "POST",
            "/api/v1/chat",
            {"message": "Pin 40% đi Đà Nẵng sạc ở đâu?"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(oos["intent_state"], "refusal")

    def test_green_score_confirm_and_leaderboard(self) -> None:
        status, _, rec = self._json(
            "POST",
            "/api/v1/chat",
            {"message": "Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 11:00 Chủ nhật"},
        )
        self.assertEqual(status, 200)
        gr = rec["green_reward"]
        self.assertTrue(gr["eligible"])
        token = gr["confirm_token"]
        self.assertIsNotNone(token)

        status, _, c1 = self._json("POST", "/api/v1/green-score/confirm", {"confirm_token": token, "user_name": "An"})
        self.assertEqual(status, 200)
        self.assertTrue(c1["ok"])
        self.assertEqual(c1["points_added"], gr["points"])

        status, _, dup = self._json("POST", "/api/v1/green-score/confirm", {"confirm_token": token, "user_name": "An"})
        self.assertEqual(status, 409)
        self.assertFalse(dup["ok"])

        status, _, bad = self._json("POST", "/api/v1/green-score/confirm", {"confirm_token": "green_invalid"})
        self.assertEqual(status, 404)
        self.assertFalse(bad["ok"])

        status, _, lb = self._json("GET", "/api/v1/green-score/leaderboard")
        self.assertEqual(status, 200)
        self.assertTrue(lb["ok"])
        self.assertEqual(lb["leaderboard"][0]["user_name"], "An")

    def test_error_handling(self) -> None:
        status, _, empty_err = self._json("POST", "/api/v1/chat", {})
        self.assertEqual(status, 400)
        self.assertFalse(empty_err["ok"])

        status, _, bad_json = self._json("POST", "/api/v1/chat", raw_bytes=b"{not-json")
        self.assertEqual(status, 400)
        self.assertFalse(bad_json["ok"])

        status, _, not_found = self._json("GET", "/api/unknown")
        self.assertEqual(status, 404)
        self.assertFalse(not_found["ok"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
