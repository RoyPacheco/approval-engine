"""
Async Coupa API client.
Handles OAuth 2.0 client-credentials token exchange and authenticated requests.
Secrets (client_id, client_secret) live only on the server — never sent to the browser.
"""
import httpx
from typing import Any


class CoupaClient:
    def __init__(self, api_url: str, client_id: str, client_secret: str, scope: str):
        self.api_url = api_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.scope = scope
        self._token: str | None = None

    async def get_token(self) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.api_url}/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": self.scope,
                },
                timeout=15,
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
            return self._token

    async def _auth_headers(self) -> dict:
        if not self._token:
            await self.get_token()
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
        }

    async def get(self, path: str, params: dict | None = None) -> Any:
        headers = await self._auth_headers()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.api_url}/api/{path}",
                params=params,
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def post(self, path: str, body: dict) -> Any:
        headers = await self._auth_headers()
        headers["Content-Type"] = "application/json"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.api_url}/api/{path}",
                json=body,
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def put(self, path: str, body: dict) -> Any:
        headers = await self._auth_headers()
        headers["Content-Type"] = "application/json"
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{self.api_url}/api/{path}",
                json=body,
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
