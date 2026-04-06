"""
JWT Bearer Flow authentication for Salesforce.

Generates a signed JWT, exchanges it for an access token at the
Salesforce token endpoint, and returns (access_token, instance_url).

Reference:
  https://help.salesforce.com/articleView?id=remoteaccess_oauth_jwt_flow.htm
"""
from __future__ import annotations
import time
import requests
import jwt  # PyJWT

from src.utils.logger import log
from src.utils.retry import api_retry

# Token endpoint URLs
_TOKEN_ENDPOINTS = {
    "production": "https://login.salesforce.com/services/oauth2/token",
    "sandbox": "https://test.salesforce.com/services/oauth2/token",
}

# JWT expiry window in seconds (must be <= 300 per SF spec)
_JWT_EXPIRY_WINDOW = 300
_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer"


def _build_jwt(consumer_key: str, username: str, private_key_pem: str, environment: str) -> str:
    """
    Build and sign a JWT assertion using RS256.

    Args:
        consumer_key: Salesforce Connected App consumer key (iss).
        username: Integration user's Salesforce username (sub).
        private_key_pem: RSA 2048-bit private key PEM string.
        environment: 'production' or 'sandbox'.

    Returns:
        Signed JWT string.
    """
    audience = _TOKEN_ENDPOINTS[environment].replace("/services/oauth2/token", "")
    now = int(time.time())
    payload = {
        "iss": consumer_key,
        "sub": username,
        "aud": audience,
        "exp": now + _JWT_EXPIRY_WINDOW,
    }
    token = jwt.encode(payload, private_key_pem, algorithm="RS256")
    log.debug(f"JWT built for user={username} aud={audience} exp={payload['exp']}")
    return token


@api_retry
def get_access_token(
    consumer_key: str,
    username: str,
    private_key_pem: str,
    environment: str = "production",
) -> tuple[str, str]:
    """
    Exchange a JWT assertion for a Salesforce access token.

    Args:
        consumer_key: Connected App consumer key.
        username: Integration user's Salesforce username.
        private_key_pem: RSA private key PEM (from Secret Manager).
        environment: 'production' | 'sandbox'.

    Returns:
        Tuple of (access_token, instance_url).

    Raises:
        requests.HTTPError: If the token exchange fails with a non-retryable status.
        ValueError: If the response does not contain an access token.
    """
    token_url = _TOKEN_ENDPOINTS[environment]
    jwt_assertion = _build_jwt(consumer_key, username, private_key_pem, environment)

    log.info(f"Requesting access token from {token_url} for {username}")
    response = requests.post(
        token_url,
        data={
            "grant_type": _GRANT_TYPE,
            "assertion": jwt_assertion,
        },
        timeout=30,
    )

    if not response.ok:
        log.error(f"Token exchange failed: {response.status_code} {response.text}")
        response.raise_for_status()

    data = response.json()
    access_token = data.get("access_token")
    instance_url = data.get("instance_url")

    if not access_token or not instance_url:
        raise ValueError(f"Unexpected token response: {data}")

    log.info(f"Access token obtained. Instance URL: {instance_url}")
    return access_token, instance_url


class SalesforceAuth:
    """
    Thin wrapper that holds credentials and vends session headers.
    Re-authenticates automatically when the token is near expiry.
    """

    def __init__(
        self,
        consumer_key: str,
        username: str,
        private_key_pem: str,
        environment: str = "production",
        api_version: str = "59.0",
    ):
        self._consumer_key = consumer_key
        self._username = username
        self._private_key_pem = private_key_pem
        self._environment = environment
        self.api_version = api_version

        self._access_token: str | None = None
        self._instance_url: str | None = None
        self._token_obtained_at: float = 0.0

    # Token lifetime is 1 h; refresh if < 5 min remain
    _TOKEN_LIFETIME = 3600
    _REFRESH_BUFFER = 300

    def _is_expired(self) -> bool:
        elapsed = time.time() - self._token_obtained_at
        return elapsed >= (self._TOKEN_LIFETIME - self._REFRESH_BUFFER)

    def authenticate(self) -> None:
        self._access_token, self._instance_url = get_access_token(
            self._consumer_key,
            self._username,
            self._private_key_pem,
            self._environment,
        )
        self._token_obtained_at = time.time()

    @property
    def access_token(self) -> str:
        if not self._access_token or self._is_expired():
            self.authenticate()
        return self._access_token  # type: ignore[return-value]

    @property
    def instance_url(self) -> str:
        if not self._instance_url:
            self.authenticate()
        return self._instance_url  # type: ignore[return-value]

    def session_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def base_url(self) -> str:
        return f"{self.instance_url}/services/data/v{self.api_version}"
