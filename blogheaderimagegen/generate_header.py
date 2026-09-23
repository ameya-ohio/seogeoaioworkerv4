#!/usr/bin/env python3
"""Generate 1200×600 blog header images for articles.

Brand (colors, fonts, logos, domain mark) comes from the company config
surface: config/company.yaml + config/brand-assets/ (COMPANY_CONFIG env var
overrides the path).

Two ways to invoke:

  # 1) From a finalized article folder (Phase 6 of the article pipeline)
  python generate_header.py --from-article articles/2026-04-29-rag-vs-fine-tuning/

  # 2) Standalone — pass title etc. explicitly
  python generate_header.py \\
    --title "How agentic procurement replaces the RFP cycle" \\
    --keyword "agentic procurement" \\
    --subtitle "Same buyer. Same suppliers. New floor on cycle time." \\
    --pattern auto \\
    --output outputs/agentic-procurement

Pattern options: auto | clean-light | contrarian | stat-highlight | question-hook | report-cover | all
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from lib.article import read_article_meta
from lib.patterns import (
    PATTERN_NAMES,
    HeaderInputs,
    auto_pick,
    render,
)
from lib.render import build_html, render_to_png


log = logging.getLogger("blogheader")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="generate_header",
        description="Generate 1200×600 blog header HTML + PNG using the company brand from config/company.yaml.",
    )
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument(
        "--from-article",
        type=Path,
        help="Path to an article folder (uses article.md frontmatter for inputs).",
    )
    src.add_argument("--title", type=str, help="Headline text.")

    p.add_argument("--subtitle", type=str, help="Optional dek under the title.")
    p.add_argument("--eyebrow", type=str, help="Optional uppercase eyebrow above the title.")
    p.add_argument(
        "--keyword",
        type=str,
        help="Word or phrase from the title to highlight in red. Falls back to the title's last word.",
    )
    p.add_argument(
        "--pattern",
        type=str,
        default="auto",
        help=f"Pattern name. One of: auto | all | {' | '.join(PATTERN_NAMES)}. Default: auto.",
    )
    p.add_argument(
        "--output",
        type=Path,
        help="Output folder. Default: alongside the article folder, or ./outputs/<slug>/ for standalone.",
    )
    p.add_argument(
        "--filename-stem",
        type=str,
        default="header",
        help="Base name for output files (default: 'header' → header.html, header.png).",
    )
    p.add_argument("-v", "--verbose", action="store_true")
    return p


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("playwright").setLevel(logging.WARNING)


async def amain(args: argparse.Namespace) -> int:
    setup_logging(args.verbose)

    # Resolve inputs.
    if args.from_article:
        meta = read_article_meta(args.from_article.resolve())
        title = meta.title
        keyword = args.keyword or meta.primary_keyword
        subtitle = args.subtitle or meta.meta_description
        eyebrow = args.eyebrow or (meta.category.upper() if meta.category else None)
        category = meta.category
        out_dir = (args.output or args.from_article).resolve()
    else:
        if not args.title:
            print("ERROR: --title is required when --from-article is not given.", file=sys.stderr)
            return 2
        title = args.title
        keyword = args.keyword
        subtitle = args.subtitle
        eyebrow = args.eyebrow
        category = None
        if args.output:
            out_dir = args.output.resolve()
        else:
            slug = _slugify(title)
            out_dir = (Path.cwd() / "outputs" / slug).resolve()

    inputs = HeaderInputs(
        title=title, subtitle=subtitle, eyebrow=eyebrow, keyword=keyword
    )

    if args.pattern == "all":
        patterns = list(PATTERN_NAMES)
    elif args.pattern == "auto":
        chosen = auto_pick(inputs, category=category)
        log.info("auto-picked pattern: %s", chosen)
        patterns = [chosen]
    else:
        patterns = [args.pattern]

    out_dir.mkdir(parents=True, exist_ok=True)

    written: list[tuple[str, Path, Path]] = []
    for pat in patterns:
        inner = render(pat, inputs)
        html_doc = build_html(inner, title=f"Header — {title}")
        suffix = f"-{pat}" if len(patterns) > 1 else ""
        html_path = out_dir / f"{args.filename_stem}{suffix}.html"
        png_path = out_dir / f"{args.filename_stem}{suffix}.png"
        html_path.write_text(html_doc, encoding="utf-8")
        await render_to_png(html_path, png_path)
        written.append((pat, html_path, png_path))

    line = "=" * 78
    print(f"\n{line}\nBlog header(s) generated\n{line}")
    print(f"title:    {title}")
    print(f"keyword:  {keyword or '(none)'}")
    print(f"output:   {out_dir}")
    print(f"patterns: {len(written)}")
    for pat, html_p, png_p in written:
        rel_html = html_p.relative_to(out_dir)
        rel_png = png_p.relative_to(out_dir)
        print(f"  - {pat:<16} → {rel_html}  +  {rel_png}")
    print(line)
    return 0


def _slugify(text: str, max_len: int = 60) -> str:
    import re

    s = text.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s or "untitled")[:max_len].rstrip("-")


def main() -> int:
    args = build_parser().parse_args()
    try:
        return asyncio.run(amain(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
