"""
Structured logging via loguru.
All modules import `log` from here to ensure consistent formatting.
"""
import os
import sys
from loguru import logger

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

# Remove default handler and add a structured one
logger.remove()
logger.add(
    sys.stdout,
    level=LOG_LEVEL,
    format=(
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "{message}"
    ),
    colorize=True,
    backtrace=True,
    diagnose=True,
)

log = logger
