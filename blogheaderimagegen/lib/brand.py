"""Brand system for the header generator — loaded from config/company.yaml.

Nothing company-specific is hardcoded here. Colors, fonts, logos, and the
domain mark all come from the config surface (`config/company.yaml` +
`config/brand-assets/`, or wherever the COMPANY_CONFIG env var points).

Degradation rules:
  - no font files declared/found  -> CSS fallback stack only
  - logo SVG file missing         -> styled text wordmark from company.name
"""
from __future__ import annotations

import base64
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from company_config import brand_assets_dir, cfg_get, load_config  # noqa: E402


# Neutral engine defaults — used only for keys absent from the config.
_DEFAULT_COLORS = {
    "primary_accent": "#2563EB",
    "secondary_accent": "#22D3EE",
    "dark_bg": "#0B1220",
    "dark_gray": "#272B31",
    "light_bg": "#F8F8F8",
    "text_on_dark": "#FFFFFF",
    "muted_on_dark": "rgba(255,255,255,0.65)",
    "dimmer_on_dark": "rgba(255,255,255,0.40)",
}

_DEFAULT_FALLBACK_STACK = (
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', "
    "Roboto, Helvetica, Arial, sans-serif"
)


@dataclass
class BrandColors:
    PRIMARY_RED: str  # historical name; the primary accent color
    ACCENT_GREEN: str  # decorative only, never on text
    DARK_BG: str
    DARK_GRAY: str
    LIGHT_BG: str
    TEXT_ON_DARK: str
    MUTED_ON_DARK: str
    DIMMER_ON_DARK: str


@dataclass
class Brand:
    name: str
    domain: str
    colors: BrandColors
    font_family: str
    font_files: dict[int, str] = field(default_factory=dict)  # weight -> basename
    fonts_dir: Path | None = None
    logos_dir: Path | None = None
    logo_light_bg: str | None = None  # basename for light backgrounds
    logo_dark_bg: str | None = None   # basename for dark backgrounds

    # ---- fonts ---------------------------------------------------------

    def font_face_css(self, *, embed: bool = True) -> str:
        """@font-face rules for the declared brand font files.

        With ``embed=True`` files are base64-inlined so the HTML is fully
        self-contained for headless Chromium. Missing dir/files degrade to
        the fallback stack silently (a CSS comment notes it).
        """
        family = self.font_family.split(",")[0].strip().strip("'\"")
        if not self.font_files:
            return f"/* no brand font files declared — using fallback stack */"
        if not self.fonts_dir or not self.fonts_dir.is_dir():
            return (
                f"/* brand fonts dir not found at {self.fonts_dir} — "
                "using fallback stack */"
            )
        rules: list[str] = []
        for weight, name in sorted(self.font_files.items()):
            woff = self.fonts_dir / f"{name}.woff"
            ttf = self.fonts_dir / f"{name}.ttf"
            if woff.exists():
                src = _src_for(woff, embed=embed, fmt="woff")
            elif ttf.exists():
                src = _src_for(ttf, embed=embed, fmt="truetype")
            else:
                continue
            rules.append(
                "@font-face {\n"
                f"  font-family: '{family}';\n"
                f"  src: {src};\n"
                f"  font-weight: {weight};\n"
                "  font-style: normal;\n"
                "  font-display: block;\n"
                "}"
            )
        return "\n".join(rules)

    # ---- logos ---------------------------------------------------------

    def logo_html(self, *, on_dark: bool, height_px: int = 28) -> str:
        """Inline SVG logo sized to ``height_px``, or a text wordmark when
        no logo file is available."""
        basename = self.logo_dark_bg if on_dark else self.logo_light_bg
        svg = None
        if basename and self.logos_dir:
            path = self.logos_dir / basename
            if path.is_file():
                svg = path.read_text(encoding="utf-8")
        if svg:
            return _size_svg(svg, height_px)
        color = self.colors.TEXT_ON_DARK if on_dark else self.colors.DARK_BG
        return (
            f'<div style="font-weight:800;font-size:{round(height_px * 0.78)}px;'
            f"letter-spacing:-0.5px;line-height:{height_px}px;color:{color};"
            f'text-transform:none;">{self.name}</div>'
        )


def _src_for(path: Path, *, embed: bool, fmt: str) -> str:
    if embed:
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        mime = "font/woff" if fmt == "woff" else "font/ttf"
        return f"url(data:{mime};base64,{b64}) format('{fmt}')"
    return f"url('file://{path}') format('{fmt}')"


_VIEWBOX_RE = re.compile(r'viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"')
_WH_RE = re.compile(r'^(<svg[^>]*?)\s(?:width|height)="[^"]*"', re.IGNORECASE)


def _size_svg(svg: str, height_px: int) -> str:
    """Set explicit width/height on the root <svg> from its aspect ratio."""
    m = _VIEWBOX_RE.search(svg)
    if m:
        vb_w, vb_h = float(m.group(1)), float(m.group(2))
        width_px = round(height_px * (vb_w / vb_h)) if vb_h else height_px
    else:
        width_px = height_px * 4  # sane default for a wordmark-shaped logo
    # strip any existing width/height attributes on the root tag
    while _WH_RE.search(svg):
        svg = _WH_RE.sub(r"\1", svg, count=1)
    return svg.replace(
        "<svg", f'<svg width="{width_px}" height="{height_px}"', 1
    )


# ---- module-level singleton, loaded once at import ----------------------

def _load_brand() -> Brand:
    cfg = load_config()  # strict: header generation needs the config
    assets = brand_assets_dir()

    colors = BrandColors(
        PRIMARY_RED=cfg_get(cfg, "brand.colors.primary_accent", _DEFAULT_COLORS["primary_accent"]),
        ACCENT_GREEN=cfg_get(cfg, "brand.colors.secondary_accent", _DEFAULT_COLORS["secondary_accent"]),
        DARK_BG=cfg_get(cfg, "brand.colors.dark_bg", _DEFAULT_COLORS["dark_bg"]),
        DARK_GRAY=cfg_get(cfg, "brand.colors.dark_gray", _DEFAULT_COLORS["dark_gray"]),
        LIGHT_BG=cfg_get(cfg, "brand.colors.light_bg", _DEFAULT_COLORS["light_bg"]),
        TEXT_ON_DARK=cfg_get(cfg, "brand.colors.text_on_dark", _DEFAULT_COLORS["text_on_dark"]),
        MUTED_ON_DARK=cfg_get(cfg, "brand.colors.muted_on_dark", _DEFAULT_COLORS["muted_on_dark"]),
        DIMMER_ON_DARK=cfg_get(cfg, "brand.colors.dimmer_on_dark", _DEFAULT_COLORS["dimmer_on_dark"]),
    )

    family = cfg_get(cfg, "brand.font.family", "") or ""
    fallback = cfg_get(cfg, "brand.font.fallback_stack", _DEFAULT_FALLBACK_STACK)
    font_family = f"'{family}', {fallback}" if family else fallback

    raw_files = cfg_get(cfg, "brand.font.files", {}) or {}
    font_files = {int(k): str(v) for k, v in raw_files.items()}

    return Brand(
        name=cfg_get(cfg, "company.name", "The Company"),
        domain=cfg_get(cfg, "company.domain", "example.com"),
        colors=colors,
        font_family=font_family,
        font_files=font_files,
        fonts_dir=assets / "fonts",
        logos_dir=assets / "logos",
        logo_light_bg=cfg_get(cfg, "brand.logos.light_bg"),
        logo_dark_bg=cfg_get(cfg, "brand.logos.dark_bg"),
    )


BRAND = _load_brand()

# Back-compat aliases used by patterns.py / render.py.
Colors = BRAND.colors
FONT_FAMILY = BRAND.font_family


def font_face_css(*, embed: bool = True) -> str:
    return BRAND.font_face_css(embed=embed)
