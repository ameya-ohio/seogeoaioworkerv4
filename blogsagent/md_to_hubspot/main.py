"""CLI entry point: markdown file -> HubSpot blog post."""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from .html_builder import build_head_html, build_post_body_html
from .hubspot_client import HubSpotClient, HubSpotError, PostPayload
from .parser import ParseError, parse_markdown

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))
from company_config import cfg_get, load_config  # noqa: E402


log = logging.getLogger("md_to_hubspot")


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="md_to_hubspot",
        description="Publish a markdown file as a HubSpot blog post.",
    )
    p.add_argument("path", help="Path to the markdown file (with YAML frontmatter).")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Build the HTML and head HTML and print them; do not call HubSpot.",
    )
    p.add_argument(
        "--draft",
        action="store_true",
        help="Create the post in HubSpot but leave it in DRAFT state (not published).",
    )
    p.add_argument(
        "-v", "--verbose", action="store_true", help="Verbose logging (DEBUG)."
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    load_dotenv()

    try:
        post = parse_markdown(args.path)
    except ParseError as e:
        log.error("parse failed: %s", e)
        return 2

    log.info("parsed: %r (slug=%s, %d schemas)", post.title, post.slug, len(post.schemas))

    body_html = build_post_body_html(post.body_markdown)
    head_html = build_head_html(post.schemas)
    log.info("built: postBody=%d chars, headHtml=%d chars", len(body_html), len(head_html))

    payload = PostPayload(
        title=post.title,
        slug=post.slug,
        meta_description=post.meta_description,
        post_body_html=body_html,
        head_html=head_html,
        html_title=post.html_title,
    )

    if args.dry_run:
        sep = "=" * 78
        print(f"{sep}\nDRY RUN — no API call\n{sep}")
        print(f"title:            {payload.title}")
        print(f"slug:             {payload.slug}")
        print(f"meta_description: {payload.meta_description}")
        print(f"html_title:       {payload.html_title or '(none — HubSpot will use title)'}")
        print(f"\n--- postBody ({len(body_html)} chars) ---\n{body_html}\n")
        print(f"--- headHtml ({len(head_html)} chars) ---\n{head_html}\n")
        return 0

    cfg = load_config()
    token_env = cfg_get(cfg, "hubspot.token_env", "HUBSPOT_TOKEN")
    token = os.getenv(token_env)
    if not token:
        log.error("%s is not set. Add it to .env or export it.", token_env)
        return 3

    client = HubSpotClient(
        token=token,
        cache_path=Path.cwd() / ".config_cache.json",
        author_name=cfg_get(cfg, "author.name", ""),
        content_group_id=cfg_get(cfg, "hubspot.content_group_id", ""),
        blog_author_id=cfg_get(cfg, "hubspot.blog_author_id", ""),
    )

    try:
        result = client.create_post(payload, publish=not args.draft)
    except HubSpotError as e:
        log.error("publish failed (%s): %s", e.status, e)
        if e.body is not None:
            log.error("response body: %s", e.body)
        return 4

    state = "DRAFT" if args.draft else "PUBLISHED"
    url = result.get("url") or "(url not returned)"
    log.info("post %s as %s — id=%s url=%s", payload.title, state, result.get("id"), url)
    print(f"\n{state}: {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
