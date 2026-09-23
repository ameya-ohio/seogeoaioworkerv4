"""Shared loader for config/company.yaml — the single company config surface.

Standard library only, so every consumer (seo_audit.py, blogheaderimagegen,
blogsagent) can use it regardless of venv. Parses the YAML subset used by
company.yaml: nested maps (2-space indent), lists of scalars, lists of flat
maps, quoted/unquoted scalars, and ``#`` comments. No anchors, no multi-line
strings, no flow mappings.

Usage:
    from company_config import load_config, cfg_get, brand_assets_dir

    cfg = load_config()                    # COMPANY_CONFIG env var, else
                                           # <repo>/config/company.yaml
    name = cfg_get(cfg, "company.name", "Unknown Co")
    assets = brand_assets_dir()            # brand-assets/ next to the yaml
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = REPO_ROOT / "config" / "company.yaml"
BANNED_PHRASES_PATH = REPO_ROOT / "standards" / "banned-phrases.txt"


class ConfigError(RuntimeError):
    pass


def config_path() -> Path:
    override = os.environ.get("COMPANY_CONFIG")
    if override:
        return Path(override).expanduser().resolve()
    return DEFAULT_CONFIG_PATH


def load_config(path: str | Path | None = None, *, strict: bool = True) -> dict:
    """Load and parse the company config.

    With ``strict=False`` a missing file returns ``{}`` instead of raising —
    for tools that should still run without a config (e.g. seo_audit).
    """
    p = Path(path) if path else config_path()
    if not p.is_file():
        if strict:
            raise ConfigError(
                f"Company config not found: {p}\n"
                "Create config/company.yaml (see config/README.md) or set "
                "the COMPANY_CONFIG env var."
            )
        return {}
    return _parse_yaml(p.read_text(encoding="utf-8"))


def cfg_get(cfg: dict, dotted: str, default: Any = None) -> Any:
    """cfg_get(cfg, "brand.colors.primary_accent", "#000")"""
    node: Any = cfg
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return node


def brand_assets_dir(path: str | Path | None = None) -> Path:
    """brand-assets/ folder next to the loaded yaml file."""
    p = Path(path) if path else config_path()
    return p.parent / "brand-assets"


def load_banned_phrases(cfg: dict | None = None) -> list[str]:
    """Generic list from standards/banned-phrases.txt plus company additions
    from voice.banned_phrases. All lowercased, deduped, order-preserving."""
    phrases: list[str] = []
    if BANNED_PHRASES_PATH.is_file():
        for line in BANNED_PHRASES_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Double quotes preserve deliberate leading/trailing spaces.
            phrases.append(_unquote(line).lower())
    if cfg:
        extra = cfg_get(cfg, "voice.banned_phrases", []) or []
        phrases.extend(str(x).lower() for x in extra)
    seen: set[str] = set()
    out: list[str] = []
    for p in phrases:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


# ---------------- YAML-subset parser ------------------------------------

_KEY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*|\"[^\"]+\")\s*:\s*(.*)$")


def _parse_yaml(text: str) -> dict:
    lines: list[tuple[int, str]] = []  # (indent, content)
    for raw in text.splitlines():
        stripped = _strip_comment(raw.rstrip())
        if not stripped.strip():
            continue
        indent = len(stripped) - len(stripped.lstrip(" "))
        lines.append((indent, stripped.strip()))
    value, next_i = _parse_block(lines, 0, 0)
    if next_i != len(lines):
        indent, content = lines[next_i]
        raise ConfigError(f"Could not parse config near: {content!r}")
    return value if isinstance(value, dict) else {}


def _strip_comment(line: str) -> str:
    """Remove a trailing ``#`` comment, respecting quoted strings."""
    out: list[str] = []
    in_quote: str | None = None
    for ch in line:
        if in_quote:
            out.append(ch)
            if ch == in_quote:
                in_quote = None
            continue
        if ch in "'\"":
            in_quote = ch
            out.append(ch)
            continue
        if ch == "#":
            break
        out.append(ch)
    return "".join(out)


def _parse_block(lines: list[tuple[int, str]], i: int, indent: int) -> tuple[Any, int]:
    """Parse the block starting at ``lines[i]`` whose items sit at ``indent``."""
    if i >= len(lines):
        return {}, i
    if lines[i][1].startswith("- "):
        return _parse_list(lines, i, indent)
    return _parse_map(lines, i, indent)


def _parse_map(lines: list[tuple[int, str]], i: int, indent: int) -> tuple[dict, int]:
    result: dict = {}
    while i < len(lines):
        line_indent, content = lines[i]
        if line_indent < indent:
            break
        if line_indent > indent or content.startswith("- "):
            raise ConfigError(f"Unexpected indentation near: {content!r}")
        m = _KEY_RE.match(content)
        if not m:
            raise ConfigError(f"Expected 'key: value' near: {content!r}")
        key = _unquote(m.group(1))
        rest = m.group(2).strip()
        if rest:
            result[key] = _scalar(rest)
            i += 1
            continue
        # nested block (map or list) or empty value
        if i + 1 < len(lines) and lines[i + 1][0] > indent:
            value, i = _parse_block(lines, i + 1, lines[i + 1][0])
            result[key] = value
        else:
            result[key] = None
            i += 1
    return result, i


def _parse_list(lines: list[tuple[int, str]], i: int, indent: int) -> tuple[list, int]:
    result: list = []
    while i < len(lines):
        line_indent, content = lines[i]
        if line_indent < indent or not content.startswith("- "):
            break
        item = content[2:].strip()
        m = _KEY_RE.match(item)
        if m and m.group(2).strip() != "" or (m and _is_map_item_continued(lines, i, indent)):
            # list of flat maps: "- name: Home" followed by "  url: ..." at
            # deeper indent (the continuation lines belong to this item)
            entry: dict = {}
            key = _unquote(m.group(1))
            entry[key] = _scalar(m.group(2).strip())
            i += 1
            while i < len(lines) and lines[i][0] > indent and not lines[i][1].startswith("- "):
                m2 = _KEY_RE.match(lines[i][1])
                if not m2:
                    raise ConfigError(f"Expected 'key: value' near: {lines[i][1]!r}")
                entry[_unquote(m2.group(1))] = _scalar(m2.group(2).strip())
                i += 1
            result.append(entry)
        else:
            result.append(_scalar(item))
            i += 1
    return result, i


def _is_map_item_continued(lines: list[tuple[int, str]], i: int, indent: int) -> bool:
    return (
        i + 1 < len(lines)
        and lines[i + 1][0] > indent
        and not lines[i + 1][1].startswith("- ")
    )


def _scalar(s: str) -> Any:
    s = s.strip()
    if s in ("[]",):
        return []
    if s in ("{}",):
        return {}
    if s in ("null", "~", ""):
        return None
    if s in ("true", "True"):
        return True
    if s in ("false", "False"):
        return False
    unquoted = _unquote(s)
    if unquoted != s:
        return unquoted
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    if re.fullmatch(r"-?\d+\.\d+", s):
        return float(s)
    return s


def _unquote(s: str) -> str:
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        return s[1:-1]
    return s


if __name__ == "__main__":
    # Parse check: load the config (arg or COMPANY_CONFIG or default) and dump
    # it as JSON. Exit 0 = the file parses in the YAML subset.
    import json as _json
    import sys as _sys

    try:
        _cfg = load_config(_sys.argv[1] if len(_sys.argv) > 1 else None)
    except ConfigError as e:
        print(f"ERROR: {e}", file=_sys.stderr)
        _sys.exit(1)
    print(_json.dumps(_cfg, indent=2))
