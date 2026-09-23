"""1200×600 blog-header design patterns.

Each pattern is a function that returns the inner HTML for the `#ad`
container. The CSS lives inline so the resulting HTML file is fully
self-contained and renders identically in headless Chromium.

Patterns are tuned for the 2:1 aspect ratio. Title-dominant. Brand-locked
to config/company.yaml + config/brand-assets/.

Available patterns:
  - clean-light       — light background, big bold headline, accent word in red
  - contrarian        — dark background, huge centered headline
  - stat-highlight    — vibrant, stat-led; headline is the number
  - question-hook     — question in red italic above bold answer
  - report-cover      — dark gradient, eyebrow pill, premium feel

`auto_pick` chooses one based on simple title heuristics.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass

from .brand import BRAND, Colors


PATTERN_NAMES = (
    "clean-light",
    "contrarian",
    "stat-highlight",
    "question-hook",
    "report-cover",
)


@dataclass
class HeaderInputs:
    title: str
    subtitle: str | None = None      # short dek under the title
    eyebrow: str | None = None       # small uppercase label above title (e.g. "AI WORKERS")
    keyword: str | None = None       # the word to highlight in red within the title


# ---- helpers ----------------------------------------------------------

def _esc(s: str | None) -> str:
    return html.escape(s or "")


def _highlight_keyword(title: str, keyword: str | None, accent: str) -> str:
    """Wrap the first occurrence of `keyword` (case-insensitive, whole-word)
    in the title with a red span. Falls back to highlighting the last word
    if no keyword match.
    """
    if not title:
        return ""
    if keyword:
        pattern = re.compile(rf"\b({re.escape(keyword)})\b", re.IGNORECASE)
        m = pattern.search(title)
        if m:
            before = _esc(title[: m.start()])
            hit = _esc(title[m.start() : m.end()])
            after = _esc(title[m.end() :])
            return f'{before}<span style="color:{accent};">{hit}</span>{after}'
    # fallback: highlight final word
    parts = title.rstrip().rsplit(" ", 1)
    if len(parts) == 2:
        return f'{_esc(parts[0])} <span style="color:{accent};">{_esc(parts[1])}</span>'
    return f'<span style="color:{accent};">{_esc(title)}</span>'


def _logo(*, on_dark: bool, height_px: int = 28) -> str:
    """Return the brand logo (inline SVG or wordmark fallback) at a height."""
    return BRAND.logo_html(on_dark=on_dark, height_px=height_px)


def _domain_mark() -> str:
    return _esc(BRAND.domain)


def _year() -> int:
    from datetime import date

    return date.today().year


def _hex_rgb(hex_color: str) -> str:
    """'#FF0D40' -> '255,13,64' (for rgba() glows tinted by the brand accent)."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return f"{int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)}"
    except ValueError:
        return "0,0,0"


def _accent_rgb() -> str:
    return _hex_rgb(Colors.PRIMARY_RED)


def _accent2_rgb() -> str:
    return _hex_rgb(Colors.ACCENT_GREEN)


def _lighten(hex_color: str, factor: float) -> str:
    """Blend a hex color toward white by `factor` (0..1)."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return hex_color
    mix = lambda c: round(c + (255 - c) * factor)  # noqa: E731
    return f"#{mix(r):02x}{mix(g):02x}{mix(b):02x}"


# ---- pattern implementations -----------------------------------------

def render_clean_light(inp: HeaderInputs) -> str:
    title_html = _highlight_keyword(inp.title, inp.keyword, Colors.PRIMARY_RED)
    subtitle = (
        f'<p style="font-size:22px;font-weight:400;line-height:1.45;color:#3d4250;margin:0;max-width:840px;">{_esc(inp.subtitle)}</p>'
        if inp.subtitle else ""
    )
    eyebrow = (
        f'<div style="display:inline-block;padding:8px 16px;background:rgba({_accent_rgb()},0.1);border:1px solid rgba({_accent_rgb()},0.25);border-radius:999px;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:{Colors.PRIMARY_RED};margin-bottom:24px;">{_esc(inp.eyebrow)}</div>'
        if inp.eyebrow else ""
    )
    return f"""
<div style="position:relative;width:100%;height:100%;background:{Colors.LIGHT_BG};padding:64px 80px;display:flex;flex-direction:column;justify-content:space-between;">
  <!-- decorative accent shape, top-right -->
  <div style="position:absolute;top:-160px;right:-160px;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,rgba({_accent_rgb()},0.12) 0%,rgba({_accent_rgb()},0) 70%);"></div>
  <div style="position:absolute;bottom:-120px;right:120px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba({_accent2_rgb()},0.15) 0%,rgba({_accent2_rgb()},0) 70%);"></div>

  <!-- top: logo + eyebrow -->
  <div style="position:relative;display:flex;flex-direction:column;gap:0;">
    <div style="height:32px;">{_logo(on_dark=False, height_px=32)}</div>
  </div>

  <!-- middle: title block -->
  <div style="position:relative;">
    {eyebrow}
    <h1 style="font-size:72px;font-weight:800;line-height:1.05;letter-spacing:-1.5px;color:{Colors.DARK_BG};margin:0 0 20px 0;max-width:1000px;">{title_html}</h1>
    {subtitle}
  </div>

  <!-- bottom: domain mark -->
  <div style="position:relative;font-size:13px;font-weight:600;letter-spacing:1.5px;color:#9aa0ac;text-transform:uppercase;">{_domain_mark()}</div>
</div>
"""


def render_contrarian(inp: HeaderInputs) -> str:
    title_html = _highlight_keyword(inp.title, inp.keyword, Colors.PRIMARY_RED)
    subtitle = (
        f'<p style="font-size:22px;font-weight:400;line-height:1.5;color:{Colors.MUTED_ON_DARK};margin:24px 0 0 0;max-width:880px;">{_esc(inp.subtitle)}</p>'
        if inp.subtitle else ""
    )
    return f"""
<div style="position:relative;width:100%;height:100%;background:radial-gradient(ellipse at top right, #15202e 0%, {Colors.DARK_BG} 60%, #060a0f 100%);padding:64px 80px;display:flex;flex-direction:column;justify-content:space-between;">
  <!-- glow accent -->
  <div style="position:absolute;top:-120px;left:-120px;width:480px;height:480px;border-radius:50%;background:rgba({_accent_rgb()},0.10);filter:blur(80px);"></div>
  <div style="position:absolute;bottom:-100px;right:-100px;width:380px;height:380px;border-radius:50%;background:rgba({_accent2_rgb()},0.04);filter:blur(60px);"></div>
  <div style="position:absolute;top:50%;right:80px;width:1px;height:300px;background:linear-gradient(180deg,transparent,rgba(255,255,255,0.06),transparent);"></div>

  <!-- logo top-left -->
  <div style="position:relative;height:30px;">{_logo(on_dark=True, height_px=30)}</div>

  <!-- big centered headline -->
  <div style="position:relative;flex:1;display:flex;align-items:center;">
    <div>
      <h1 style="font-size:84px;font-weight:800;line-height:1.0;letter-spacing:-2px;color:{Colors.TEXT_ON_DARK};margin:0;max-width:1040px;">{title_html}</h1>
      {subtitle}
    </div>
  </div>

  <!-- bottom mark -->
  <div style="position:relative;display:flex;align-items:center;gap:12px;font-size:13px;font-weight:700;letter-spacing:2px;color:{Colors.DIMMER_ON_DARK};text-transform:uppercase;">
    <div style="width:24px;height:2px;background:{Colors.PRIMARY_RED};"></div>
    {_domain_mark()}
  </div>
</div>
"""


def render_stat_highlight(inp: HeaderInputs) -> str:
    """The title IS the stat. `subtitle` carries the explanation.

    If the title is short and number-led (e.g. "3×", "$0.008", "82%"), this
    pattern centers it in big bold red. Otherwise it falls back to the
    contrarian layout but with a stat-pill accent.
    """
    title_html = _highlight_keyword(inp.title, inp.keyword, Colors.PRIMARY_RED)
    subtitle = (
        f'<p style="font-size:24px;font-weight:500;line-height:1.4;color:{Colors.TEXT_ON_DARK};margin:32px auto 0 auto;max-width:760px;text-align:center;">{_esc(inp.subtitle)}</p>'
        if inp.subtitle else ""
    )
    eyebrow = inp.eyebrow or "BY THE NUMBERS"
    return f"""
<div style="position:relative;width:100%;height:100%;background:linear-gradient(135deg,{Colors.DARK_BG} 0%,{Colors.DARK_GRAY} 100%);padding:56px 80px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
  <!-- bold red gradient blob behind stat -->
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba({_accent_rgb()},0.18) 0%,rgba({_accent_rgb()},0) 65%);filter:blur(40px);"></div>

  <!-- logo top-left -->
  <div style="position:absolute;top:48px;left:80px;height:26px;">{_logo(on_dark=True, height_px=26)}</div>

  <!-- eyebrow -->
  <div style="position:relative;display:inline-block;padding:8px 18px;background:rgba({_accent_rgb()},0.18);border:1px solid rgba({_accent_rgb()},0.45);border-radius:999px;font-size:12px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:{_lighten(Colors.PRIMARY_RED, 0.35)};margin-bottom:32px;">{_esc(eyebrow)}</div>

  <!-- huge stat -->
  <h1 style="position:relative;font-size:140px;font-weight:900;line-height:1;letter-spacing:-4px;color:{Colors.TEXT_ON_DARK};margin:0;max-width:1100px;">{title_html}</h1>

  {subtitle}

  <!-- bottom mark -->
  <div style="position:absolute;bottom:48px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:700;letter-spacing:2px;color:{Colors.DIMMER_ON_DARK};text-transform:uppercase;">{_domain_mark()}</div>
</div>
"""


def render_question_hook(inp: HeaderInputs) -> str:
    # The question goes in the eyebrow slot (or we synthesize one); the title is the answer.
    question = inp.eyebrow or _derive_question(inp.title) or "What's actually happening?"
    title_html = _highlight_keyword(inp.title, inp.keyword, Colors.PRIMARY_RED)
    subtitle = (
        f'<p style="font-size:22px;font-weight:400;line-height:1.45;color:#3d4250;margin:28px 0 0 0;max-width:880px;">{_esc(inp.subtitle)}</p>'
        if inp.subtitle else ""
    )
    return f"""
<div style="position:relative;width:100%;height:100%;background:{Colors.LIGHT_BG};padding:64px 80px;display:flex;flex-direction:column;justify-content:space-between;">
  <!-- accent line -->
  <div style="position:absolute;top:0;left:80px;width:120px;height:6px;background:{Colors.PRIMARY_RED};"></div>
  <div style="position:absolute;top:-180px;right:-180px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba({_accent_rgb()},0.10) 0%,rgba({_accent_rgb()},0) 65%);"></div>

  <!-- logo top-left -->
  <div style="position:relative;height:30px;margin-top:8px;">{_logo(on_dark=False, height_px=30)}</div>

  <!-- middle: question + answer -->
  <div style="position:relative;">
    <p style="font-size:30px;font-weight:600;font-style:italic;line-height:1.2;color:{Colors.PRIMARY_RED};margin:0 0 14px 0;max-width:980px;">{_esc(question)}</p>
    <h1 style="font-size:68px;font-weight:800;line-height:1.05;letter-spacing:-1.5px;color:{Colors.DARK_BG};margin:0;max-width:1020px;">{title_html}</h1>
    {subtitle}
  </div>

  <!-- bottom mark -->
  <div style="position:relative;font-size:13px;font-weight:600;letter-spacing:1.5px;color:#9aa0ac;text-transform:uppercase;">{_domain_mark()}</div>
</div>
"""


def render_report_cover(inp: HeaderInputs) -> str:
    title_html = _highlight_keyword(inp.title, inp.keyword, Colors.PRIMARY_RED)
    subtitle = (
        f'<p style="font-size:20px;font-weight:400;line-height:1.5;color:{Colors.MUTED_ON_DARK};margin:24px 0 0 0;max-width:760px;">{_esc(inp.subtitle)}</p>'
        if inp.subtitle else ""
    )
    eyebrow = inp.eyebrow or "REPORT"
    return f"""
<div style="position:relative;width:100%;height:100%;background:linear-gradient(140deg,{Colors.DARK_BG} 0%,#15202e 50%,{Colors.DARK_BG} 100%);padding:64px 80px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">
  <!-- subtle grid lines -->
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px);background-size:80px 80px;mask-image:radial-gradient(ellipse at center,black 30%,transparent 80%);"></div>
  <!-- glass card behind title -->
  <div style="position:absolute;top:50%;left:80px;right:80px;transform:translateY(-50%);height:340px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:18px;backdrop-filter:blur(10px);"></div>
  <!-- red glow -->
  <div style="position:absolute;bottom:-100px;right:-100px;width:420px;height:420px;border-radius:50%;background:rgba({_accent_rgb()},0.10);filter:blur(80px);"></div>

  <!-- top: eyebrow pill + logo -->
  <div style="position:relative;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:inline-flex;align-items:center;gap:10px;padding:8px 16px;background:{Colors.PRIMARY_RED};border-radius:999px;font-size:12px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#fff;">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fff;"></span>
      {_esc(eyebrow)}
    </div>
    <div style="height:26px;">{_logo(on_dark=True, height_px=26)}</div>
  </div>

  <!-- middle: title block -->
  <div style="position:relative;padding:0 32px;">
    <h1 style="font-size:64px;font-weight:800;line-height:1.05;letter-spacing:-1.5px;color:{Colors.TEXT_ON_DARK};margin:0;max-width:1000px;">{title_html}</h1>
    {subtitle}
  </div>

  <!-- bottom mark -->
  <div style="position:relative;display:flex;align-items:center;gap:12px;font-size:13px;font-weight:700;letter-spacing:2px;color:{Colors.DIMMER_ON_DARK};text-transform:uppercase;">
    <div style="width:24px;height:2px;background:{Colors.PRIMARY_RED};"></div>
    {_domain_mark()} · {_year()}
  </div>
</div>
"""


# ---- pattern registry + auto-pick ------------------------------------

PATTERN_RENDERERS = {
    "clean-light": render_clean_light,
    "contrarian": render_contrarian,
    "stat-highlight": render_stat_highlight,
    "question-hook": render_question_hook,
    "report-cover": render_report_cover,
}


def render(pattern: str, inp: HeaderInputs) -> str:
    if pattern not in PATTERN_RENDERERS:
        raise ValueError(
            f"Unknown pattern {pattern!r}. Available: {', '.join(PATTERN_NAMES)}"
        )
    return PATTERN_RENDERERS[pattern](inp)


def auto_pick(inp: HeaderInputs, *, category: str | None = None) -> str:
    """Pick a pattern from the title shape and category hints.

    The picker is deliberately simple — explicit rules a human can audit.
    For semantic picks, pass --pattern explicitly.
    """
    title = (inp.title or "").strip()
    title_lc = title.lower()
    blob = " ".join(filter(None, [title, inp.subtitle, inp.keyword, category])).lower()

    # Stat-led: short title with prominent number / unit.
    if _is_stat_title(title):
        return "stat-highlight"

    # Comparison or question.
    if " vs " in title_lc or " vs. " in title_lc:
        return "question-hook"
    if title_lc.startswith(("how ", "why ", "what ", "when ", "should ", "is ")):
        return "question-hook"

    # Report / whitepaper / benchmark.
    if any(w in blob for w in ("report", "whitepaper", "benchmark", "study", "research", "playbook", "guide")):
        return "report-cover"

    # Contrarian / opinionated.
    if any(w in title_lc for w in ("don't", "stop ", "no one", "actually", "wrong", "myth", "kill ")):
        return "contrarian"

    # Default — versatile and brand-on.
    return "clean-light"


_STAT_TITLE_RE = re.compile(r"^[\$\u00a3\u20ac]?\d[\d,\.]*\s*[%xX×k|kK|m|M|b|B]?\b")


def _is_stat_title(title: str) -> bool:
    if not title:
        return False
    # Short title (≤ 30 chars) and starts with a number/unit pattern.
    if len(title) <= 30 and _STAT_TITLE_RE.match(title.strip()):
        return True
    # Or contains a strong stat token like "3×" or "82%" within the first few words
    head = " ".join(title.split()[:4]).lower()
    if re.search(r"\b\d+\s*(%|x|×)\b", head):
        return True
    return False


def _derive_question(title: str) -> str | None:
    """Best-effort question from a title for question-hook eyebrow."""
    t = title.strip().rstrip(".")
    if not t:
        return None
    tl = t.lower()
    if " vs " in tl or " vs. " in tl:
        return f"Which one wins?"
    if tl.startswith("how "):
        return None  # the title already is the question
    if tl.startswith(("why ", "what ", "when ", "should ", "is ")):
        return None
    return None  # caller falls back to a default
