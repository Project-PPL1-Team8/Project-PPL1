import base64
import json
from types import SimpleNamespace
from uuid import UUID


def _encode_segment(payload: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).rstrip(b"=").decode("utf-8")


def _build_fake_jwt(payload: dict) -> str:
    header = _encode_segment({"alg": "none", "typ": "JWT"})
    body = _encode_segment(payload)
    return f"{header}.{body}."


def test_google_sync_supports_dev_mode_token_fallback(client, monkeypatch):
    async def fake_verify_token(_token: str) -> dict:
        raise ValueError(
            "Supabase auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY or enable DEV_MODE=true for local mock auth."
        )

    def fake_ensure_local_profile(db, user_id, email, full_name, preferred_role):
        assert isinstance(user_id, UUID)
        assert email == "donor@example.com"
        assert full_name == "Google Donor"
        assert preferred_role == "donor"
        return SimpleNamespace(full_name=full_name), preferred_role, True

    monkeypatch.setattr("app.api.auth.supabase_auth.verify_token", fake_verify_token)
    monkeypatch.setattr("app.api.auth.google_auth_service.ensure_local_profile", fake_ensure_local_profile)

    token = _build_fake_jwt(
        {
            "sub": "11111111-1111-1111-1111-111111111111",
            "email": "donor@example.com",
            "app_metadata": {"provider": "google", "providers": ["google"]},
            "user_metadata": {"full_name": "Google Donor", "role": "donor"},
            "identities": [{"provider": "google"}],
        }
    )

    response = client.post(
        "/api/v1/auth/google/sync",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "google"
    assert data["user"]["email"] == "donor@example.com"
    assert data["user"]["role"] == "donor"
