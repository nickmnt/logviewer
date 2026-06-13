from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path
import random


LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]
BASE_MESSAGES = {
    "TRACE": [
        "Entering request pipeline",
        "Evaluating feature flag state",
        "Preparing SQL command parameters",
        "Publishing heartbeat metrics",
    ],
    "DEBUG": [
        "Cache lookup completed",
        "Retry policy state updated",
        "Resolved tenant configuration",
        "Background worker lease renewed",
    ],
    "INFO": [
        "HTTP request completed successfully",
        "Scheduled job finished",
        "User session established",
        "File import processed",
    ],
    "WARN": [
        "Retrying transient downstream failure",
        "Queue lag exceeded threshold",
        "Configuration override missing optional value",
        "Slow query detected",
    ],
    "ERROR": [
        "Database command failed",
        "Unhandled exception while processing message",
        "Outbound API returned error status",
        "File import validation failed",
    ],
    "FATAL": [
        "Application host is shutting down unexpectedly",
        "Critical dependency initialization failed",
        "Data corruption detected during recovery",
        "Fatal exception terminated worker process",
    ],
}
CONTEXT_SUFFIXES = [
    "request_id=REQ-{req_id:04d}",
    "tenant=tenant-{tenant}",
    "node=node-{node}",
    "elapsed_ms={elapsed}",
    "correlation=CORR-{corr:05d}",
]
CATEGORIES = [
    "Auth.Api.LoginController",
    "Auth.Domain.TokenService",
    "Billing.Api.InvoiceController",
    "Billing.Domain.PaymentProcessor",
    "Catalog.Api.ProductController",
    "Catalog.Domain.IndexRefreshJob",
    "Checkout.Api.CartController",
    "Checkout.Domain.OrderCoordinator",
    "Infrastructure.Caching.RedisCache",
    "Infrastructure.Messaging.RabbitConsumer",
    "Infrastructure.Storage.BlobUploader",
    "Notifications.Api.EmailController",
    "Notifications.Domain.PushDispatcher",
    "Observability.Logging.LogArchiver",
    "Observability.Metrics.PrometheusExporter",
    "Platform.Config.FeatureFlagProvider",
    "Platform.Hosting.Startup",
    "Reporting.Domain.DailySummaryJob",
    "Search.Api.QueryController",
    "Search.Domain.IndexWriter",
]


def _format_line(timestamp: datetime, level: str, code: int, category: str, message: str) -> str:
    fraction = f"{timestamp.microsecond:06d}"[:4]
    return f"{timestamp:%Y-%m-%d %H:%M:%S}.{fraction}|{level}|{code:02d}|{category}|{message}"


def build_example_lines(line_count: int) -> list[str]:
    randomizer = random.Random(20260603)
    timestamp = datetime(2026, 6, 3, 9, 0, 0)
    lines: list[str] = []

    # Emit at least one line per level and category early so filter demos always have coverage.
    for index, category in enumerate(CATEGORIES):
        level = LEVELS[index % len(LEVELS)]
        code = (index + 11) % 100
        message = (
            f"{BASE_MESSAGES[level][index % len(BASE_MESSAGES[level])]} | "
            f"seeded startup event | request_id=REQ-{index + 1:04d}"
        )
        lines.append(_format_line(timestamp, level, code, category, message))
        timestamp += timedelta(milliseconds=75)

    while len(lines) < line_count:
        level = randomizer.choices(
            population=LEVELS,
            weights=[18, 16, 24, 10, 6, 1],
            k=1,
        )[0]
        category = randomizer.choice(CATEGORIES)
        code = randomizer.randint(0, 99)
        template = randomizer.choice(BASE_MESSAGES[level])
        context = " ".join(
            part.format(
                req_id=randomizer.randint(1, 9999),
                tenant=randomizer.choice(["alpha", "beta", "gamma", "delta"]),
                node=randomizer.randint(1, 6),
                elapsed=randomizer.randint(1, 2400),
                corr=randomizer.randint(1, 99999),
            )
            for part in randomizer.sample(CONTEXT_SUFFIXES, k=3)
        )
        if level in {"ERROR", "FATAL"}:
            detail = randomizer.choice(
                [
                    "exception=System.TimeoutException",
                    "exception=System.InvalidOperationException",
                    "exception=SqlException",
                    "exception=IOException",
                ]
            )
            context = f"{context} {detail}"
        message = f"{template} | {context}"
        lines.append(_format_line(timestamp, level, code, category, message))
        timestamp += timedelta(milliseconds=randomizer.randint(15, 220))

    return lines


def generate_example_file(output_path: Path, line_count: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(build_example_lines(line_count)) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a deterministic sample log file.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("nlog.log"),
        help="Where to write the generated log file.",
    )
    parser.add_argument(
        "--lines",
        type=int,
        default=480,
        help="How many log lines to generate.",
    )
    args = parser.parse_args()
    generate_example_file(args.output, args.lines)


if __name__ == "__main__":
    main()
