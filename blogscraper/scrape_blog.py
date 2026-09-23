#!/usr/bin/env python3
"""Blog scraper — multi-agent CLI entry.

Examples:

    python scrape_blog.py https://www.artisan.co/blog --use-browser --max-articles 3
    python scrape_blog.py https://example.com/blog --no-images
    python scrape_blog.py https://example.com/blog --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from agents.orchestrator import Orchestrator
from utils.urls import BlogTarget


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="scrape_blog",
        description="Scrape a blog index and download every article + header image.",
    )
    p.add_argument("url", help="Blog index URL, e.g. https://www.artisan.co/blog")
    p.add_argument(
        "--output-dir",
        type=Path,
        default=Path.cwd(),
        help="Override the output root (default: current directory).",
    )
    p.add_argument(
        "--max-articles",
        type=int,
        default=None,
        help="Limit the number of articles scraped (useful for testing).",
    )
    p.add_argument(
        "--no-images", action="store_true", help="Skip image download; text-only."
    )
    p.add_argument(
        "--use-browser",
        action="store_true",
        help="Force Playwright (Chromium) for both discovery and extraction. "
             "Required for JS-rendered sites.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Run discovery only; print URLs that would be scraped, do nothing else.",
    )
    p.add_argument(
        "--concurrency", type=int, default=5,
        help="Max concurrent extraction/download tasks (default 5).",
    )
    p.add_argument("-v", "--verbose", action="store_true", help="Verbose (DEBUG) logging.")
    return p


def setup_logging(verbose: bool, log_path: Path) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s %(levelname)s %(name)s: %(message)s"
    handlers = [logging.StreamHandler()]
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_path, encoding="utf-8"))
    except OSError:
        # Best-effort file logging; console always works.
        pass
    logging.basicConfig(level=level, format=fmt, handlers=handlers)
    # Quiet noisy libs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def print_summary(summary, dry_run: bool) -> None:
    line = "=" * 78
    print(f"\n{line}")
    print(f"BlogScraper summary{'  (dry run)' if dry_run else ''}")
    print(line)
    print(f"target:               {summary.target}")
    print(f"output dir:           {summary.output_dir}")
    print(f"discovery source:     {summary.discovery_source or '(n/a)'}")
    print(f"discovered URLs:      {summary.discovered}")
    if not dry_run:
        print(f"scraped (ok):         {summary.scraped_ok}")
        print(f"scraped (partial):    {summary.scraped_partial}  (text saved, image missing/failed)")
        print(f"scraped (failed):     {summary.scraped_failed}")
        print(f"images downloaded:    {summary.images_downloaded}")
        print(f"skipped (in manifest):{summary.skipped_already_done}")
    print(line)


async def amain(args: argparse.Namespace) -> int:
    target = BlogTarget.parse(args.url)
    log_path = (args.output_dir / target.domain_root / "scrape.log").resolve()
    setup_logging(args.verbose, log_path)

    orch = Orchestrator(
        target,
        output_dir=args.output_dir.resolve(),
        use_browser=args.use_browser,
        no_images=args.no_images,
        max_articles=args.max_articles,
        concurrency=args.concurrency,
    )

    summary = await orch.run(dry_run=args.dry_run)
    print_summary(summary, dry_run=args.dry_run)
    return 0


def main() -> int:
    args = build_parser().parse_args()
    try:
        return asyncio.run(amain(args))
    except KeyboardInterrupt:
        print("\nInterrupted. Re-run to resume — already-scraped articles will be skipped.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
