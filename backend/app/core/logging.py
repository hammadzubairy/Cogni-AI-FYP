"""Structured (JSON-lines) logging to stdout. Never log secrets (API keys,
passwords, tokens) or student answer text; log only ids, routes, timings and
counts."""

import json
import logging
import sys


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if fields:
            payload.update(fields)
        return json.dumps(payload, default=str)


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


def log_event(logger: logging.Logger, message: str, **fields) -> None:
    logger.info(message, extra={"fields": fields})
