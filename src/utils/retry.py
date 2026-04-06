"""
Tenacity retry decorators matching spec:
  - Max 3 attempts
  - Exponential back-off: 5s initial, 2x multiplier, 120s max
  - Retry on HTTP 429/500/502/503/504 and SF error codes
"""
import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
    RetryError,
    before_sleep_log,
)
import logging
from src.utils.logger import log

# Salesforce error codes that warrant a retry
RETRYABLE_SF_CODES = {
    "QUERY_TIMEOUT",
    "REQUEST_LIMIT_EXCEEDED",
}

# HTTP status codes that warrant a retry
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, requests.HTTPError):
        return exc.response is not None and exc.response.status_code in RETRYABLE_HTTP_STATUS
    # simple-salesforce raises SalesforceError with error_code attribute
    error_code = getattr(exc, "error_code", None) or getattr(exc, "status", None)
    if error_code and str(error_code) in RETRYABLE_SF_CODES:
        return True
    # Also retry on ConnectionError / Timeout
    if isinstance(exc, (requests.ConnectionError, requests.Timeout)):
        return True
    return False


# Primary decorator used across the codebase
api_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=5, max=120),
    retry=retry_if_exception(_is_retryable),
    before_sleep=before_sleep_log(logging.getLogger("tenacity"), logging.WARNING),
    reraise=True,
)
