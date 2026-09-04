#!/usr/bin/env python3
"""Pure utility functions for OmaRazer — no OpenRazer dependency."""

from __future__ import annotations

from typing import Any


def safe_get(obj: Any, attr: str, default: Any = None) -> Any:
    """Safely get an attribute or property, handling NotImplementedError and exceptions."""
    try:
        val = getattr(obj, attr, default)
        return default if val is None else val
    except (NotImplementedError, AttributeError, Exception):
        return default


def normalize_battery_level(raw: Any) -> int | None:
    """Return a real battery percentage, or None when the firmware did not answer.

    OpenRazer reports 0 for a device that is asleep or otherwise unreachable
    rather than raising, and a genuinely empty wireless device cannot report at
    all — so 0 always means "no reading", never "empty".
    """
    try:
        level = int(float(raw))
    except (TypeError, ValueError):
        return None
    if level <= 0:
        return None
    return min(level, 100)


def normalize_effect_name(name: str) -> str:
    """Normalize effect name from daemon/CLI to standard lowercase identifier."""
    n = str(name or "").strip().lower().replace("-", "_")
    if n in ("none", "off"):
        return "none"
    if n in ("static",):
        return "static"
    if n in ("spectrum", "spectrumcycling", "spectrum_cycling"):
        return "spectrum"
    if n in ("wave",):
        return "wave"
    if n in ("breathsingle", "breath_single", "breath", "breathing"):
        return "breath_single"
    if n in ("breathrandom", "breath_random"):
        return "breath_random"
    if n in ("breathdual", "breath_dual"):
        return "breath_dual"
    if n in ("reactive",):
        return "reactive"
    if n in ("ripple",):
        return "ripple"
    if n in ("ripplerandom", "ripple_random"):
        return "ripple_random"
    if n in ("starlightrandom", "starlight_random", "starlight"):
        return "starlight_random"
    if n in ("starlight_single",):
        return "starlight_single"
    return n


def classify_device_type(raw_type: str, name: str) -> str:
    """Classify device type, refining generic types based on device name when appropriate."""
    t = str(raw_type or "").strip().lower()
    n = str(name or "").strip().lower()

    if t in ("keyboard", "keyboards"):
        return "keyboard"
    if t in ("keypad", "keypads"):
        return "keypad"
    if t in ("mouse", "mice"):
        return "mouse"
    if t in ("mousemat", "mousemats", "mouse_mat", "mat", "pad"):
        return "mousemat"
    if t in ("headset", "headsets", "headphone", "headphones"):
        return "headset"
    if t in ("speaker", "speakers", "soundbar"):
        return "speaker"

    # Name-based classification for accessories or generic audio/device
    if any(k in n for k in ("nommo", "speaker", "leviathan", "ferox")):
        return "speaker"
    if any(k in n for k in ("kraken", "nari", "blackshark", "barracuda", "kaira", "opus", "hammerhead", "thresher", "electra", "headset", "headphone", "earphone", "earbud")):
        return "headset"
    if any(k in n for k in ("seiren", "microphone", " mic ")):
        return "headset"
    if any(k in n for k in ("firefly", "goliathus", "strider", "mouse mat", "mousemat")):
        return "mousemat"
    if any(k in n for k in ("tartarus", "orbweaver", "nostromo")):
        return "keypad"
    if any(k in n for k in ("keyboard", "blackwidow", "huntsman", "cynosa", "deathstalker", "ornata")):
        return "keyboard"
    if any(k in n for k in ("mouse", "deathadder", "viper", "basilisk", "naga", "cobra", "orochi", "mamba", "abyssus", "lancehead")):
        return "mouse"

    return t or "accessory"


def parse_speed(val: Any, default: int = 2) -> int:
    """Parse speed/reaction time parameter (1=fast, 2=normal, 3=slow, 4=very_slow)."""
    if val is None:
        return default
    s = str(val).strip().lower()
    if s in ("1", "fast", "speed_fast"):
        return 1
    if s in ("2", "normal", "medium", "med", "speed_medium"):
        return 2
    if s in ("3", "slow", "speed_slow"):
        return 3
    if s in ("4", "very_slow"):
        return 4
    try:
        n = int(s)
        return n if 1 <= n <= 4 else default
    except ValueError:
        return default


def parse_direction(val: Any, default: int = 1) -> int:
    """Parse wave direction (1=right, 2=left)."""
    if val is None:
        return default
    s = str(val).strip().lower()
    if s in ("2", "left", "wave_left"):
        return 2
    if s in ("1", "right", "wave_right"):
        return 1
    try:
        n = int(s)
        return n if n in (1, 2) else default
    except ValueError:
        return default


def parse_color(c: str) -> tuple[int, int, int]:
    """Parse hex or comma-separated string to RGB tuple (0-255)."""
    if not c:
        return (0, 255, 0)
    cleaned = c.strip().lstrip("#")
    if "," in cleaned:
        parts = [int(p.strip()) for p in cleaned.split(",") if p.strip()]
        if len(parts) >= 3:
            return (
                max(0, min(255, parts[0])),
                max(0, min(255, parts[1])),
                max(0, min(255, parts[2])),
            )
    if len(cleaned) == 6:
        return (
            int(cleaned[0:2], 16),
            int(cleaned[2:4], 16),
            int(cleaned[4:6], 16),
        )
    if len(cleaned) == 3:
        return (
            int(cleaned[0] * 2, 16),
            int(cleaned[1] * 2, 16),
            int(cleaned[2] * 2, 16),
        )
    raise ValueError(f"Invalid color representation: {c}")
