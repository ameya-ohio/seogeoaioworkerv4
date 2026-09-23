"""Headless 1200×600 PNG rendering via Playwright element screenshot."""
from __future__ import annotations

import logging
from pathlib import Path

from .brand import FONT_FAMILY, font_face_css


log = logging.getLogger(__name__)


HEADER_WIDTH = 1200
HEADER_HEIGHT = 600


def build_html(inner_html: str, *, title: str = "Blog header") -> str:
    """Wrap a pattern's inner HTML into a complete, self-contained document.

    The `#ad` div is exactly 1200×600 with overflow:hidden. Element screenshot
    on `#ad` produces a pixel-perfect PNG.
    """
    font_face = font_face_css(embed=True)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
{font_face}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ background: #efefef; }}
body {{
  margin: 0; padding: 24px;
  font-family: {FONT_FAMILY};
  display: flex; justify-content: center; align-items: flex-start;
  min-height: 100vh;
}}
#ad {{
  width: {HEADER_WIDTH}px;
  height: {HEADER_HEIGHT}px;
  position: relative;
  overflow: hidden;
  border-radius: 0;
  background: #fff;
  font-family: {FONT_FAMILY};
}}
</style>
</head>
<body>
<div id="ad">
{inner_html}
</div>
</body>
</html>
"""


async def render_to_png(html_path: Path, png_path: Path) -> None:
    """Render the `#ad` element of a local HTML file to a 1200×600 PNG."""
    from playwright.async_api import async_playwright

    png_path.parent.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(
                viewport={"width": HEADER_WIDTH + 80, "height": HEADER_HEIGHT + 80},
                device_scale_factor=2,  # 2× DPI for crisp PNG
            )
            page = await context.new_page()
            file_url = f"file://{html_path.resolve()}"
            log.info("rendering %s -> %s", html_path.name, png_path.name)
            await page.goto(file_url, wait_until="networkidle", timeout=30_000)
            # Allow web fonts a beat to stabilise.
            await page.evaluate("document.fonts && document.fonts.ready")
            element = await page.query_selector("#ad")
            if element is None:
                raise RuntimeError("#ad element not found in rendered HTML")
            await element.screenshot(path=str(png_path), omit_background=False)
        finally:
            await browser.close()
