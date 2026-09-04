#!/usr/bin/env python3
"""Profile file management for OmaRazer — no OpenRazer dependency."""

from __future__ import annotations

import json
import os
import sys
from typing import Any


def get_config_dir() -> str:
    """Return the OmaRazer config dir, creating it if needed.

    Defaults to ~/.config/omarazer/. Set OMARAZER_CONFIG_DIR to redirect it —
    the test suite uses that to stay out of the real user config.
    """
    config_dir = os.environ.get("OMARAZER_CONFIG_DIR") or os.path.join(
        os.path.expanduser("~"), ".config", "omarazer"
    )
    os.makedirs(config_dir, exist_ok=True)
    return config_dir


def get_profiles_dir() -> str:
    """Return the per-key lighting profiles dir, creating it if needed."""
    profiles_dir = os.path.join(get_config_dir(), "profiles")
    os.makedirs(profiles_dir, exist_ok=True)
    return profiles_dir


def sanitize_profile_name(name: str) -> str:
    """Strip path separators and dangerous characters from profile names."""
    return name.replace("/", "_").replace("\\", "_").replace("..", "_").strip()


def list_profiles() -> list[str]:
    """Return sorted list of saved profile names (without .json extension)."""
    profiles_dir = get_profiles_dir()
    names = []
    for f in os.listdir(profiles_dir):
        if f.endswith(".json"):
            names.append(f[:-5])
    names.sort()
    return names


def save_profile(name: str, data: dict[str, Any]) -> bool:
    """Save a profile to ~/.config/omarazer/profiles/<name>.json."""
    safe_name = sanitize_profile_name(name)
    if not safe_name:
        sys.stderr.write("Error: empty profile name\n")
        return False
    profiles_dir = get_profiles_dir()
    path = os.path.join(profiles_dir, safe_name + ".json")
    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        sys.stderr.write(f"Failed to save profile: {e}\n")
        return False


def load_profile(name: str) -> dict[str, Any] | None:
    """Load a profile from ~/.config/omarazer/profiles/<name>.json."""
    safe_name = sanitize_profile_name(name)
    profiles_dir = get_profiles_dir()
    path = os.path.join(profiles_dir, safe_name + ".json")
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        sys.stderr.write(f"Profile not found: {name}\n")
        return None
    except Exception as e:
        sys.stderr.write(f"Failed to load profile: {e}\n")
        return None


def delete_profile(name: str) -> bool:
    """Delete a profile file from ~/.config/omarazer/profiles/."""
    safe_name = sanitize_profile_name(name)
    profiles_dir = get_profiles_dir()
    path = os.path.join(profiles_dir, safe_name + ".json")
    try:
        os.remove(path)
        return True
    except FileNotFoundError:
        sys.stderr.write(f"Profile not found: {name}\n")
        return False
    except Exception as e:
        sys.stderr.write(f"Failed to delete profile: {e}\n")
        return False


# ── DPI Profiles ─────────────────────────────────────────────────────────────

DEFAULT_DPI_PROFILES: dict[str, dict[str, Any]] = {
    "Default": {"name": "Default", "presets": [800, 1200, 1800, 2400, 3200], "dpi": 1200},
    "FPS": {"name": "FPS", "presets": [800, 1200, 3000], "dpi": 800},
    "Gaming": {"name": "Gaming", "presets": [400, 800, 1600, 3200], "dpi": 800},
    "Office": {"name": "Office", "presets": [800, 1200, 2000], "dpi": 1200},
}


def get_dpi_profiles_dir() -> str:
    """Return the mouse DPI profiles dir, creating it if needed."""
    dpi_profiles_dir = os.path.join(get_config_dir(), "dpi_profiles")
    os.makedirs(dpi_profiles_dir, exist_ok=True)
    return dpi_profiles_dir


def list_dpi_profiles() -> list[str]:
    """Return sorted list of saved DPI profile names (without .json extension).

    If no user profiles exist yet, seeds default profiles.
    """
    dpi_profiles_dir = get_dpi_profiles_dir()
    names = [f[:-5] for f in os.listdir(dpi_profiles_dir) if f.endswith(".json")]

    if not names:
        # Seed default profiles
        for def_name, def_data in DEFAULT_DPI_PROFILES.items():
            save_dpi_profile(def_name, def_data)
        names = list(DEFAULT_DPI_PROFILES.keys())

    names.sort()
    return names


def save_dpi_profile(name: str, data: dict[str, Any]) -> bool:
    """Save a DPI profile to ~/.config/omarazer/dpi_profiles/<name>.json."""
    safe_name = sanitize_profile_name(name)
    if not safe_name:
        sys.stderr.write("Error: empty DPI profile name\n")
        return False
    dpi_profiles_dir = get_dpi_profiles_dir()
    path = os.path.join(dpi_profiles_dir, safe_name + ".json")
    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        sys.stderr.write(f"Failed to save DPI profile: {e}\n")
        return False


def load_dpi_profile(name: str) -> dict[str, Any] | None:
    """Load a DPI profile from ~/.config/omarazer/dpi_profiles/<name>.json."""
    safe_name = sanitize_profile_name(name)
    dpi_profiles_dir = get_dpi_profiles_dir()
    path = os.path.join(dpi_profiles_dir, safe_name + ".json")
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        if safe_name in DEFAULT_DPI_PROFILES:
            return DEFAULT_DPI_PROFILES[safe_name]
        sys.stderr.write(f"DPI profile not found: {name}\n")
        return None
    except Exception as e:
        sys.stderr.write(f"Failed to load DPI profile: {e}\n")
        return None


def delete_dpi_profile(name: str) -> bool:
    """Delete a DPI profile file from ~/.config/omarazer/dpi_profiles/."""
    safe_name = sanitize_profile_name(name)
    dpi_profiles_dir = get_dpi_profiles_dir()
    path = os.path.join(dpi_profiles_dir, safe_name + ".json")
    try:
        os.remove(path)
        return True
    except FileNotFoundError:
        sys.stderr.write(f"DPI profile not found: {name}\n")
        return False
    except Exception as e:
        sys.stderr.write(f"Failed to delete DPI profile: {e}\n")
        return False



# ── Per-Device Presets ───────────────────────────────────────────────────────
# Fallback store for mice without on-board DPI stage memory. Devices that do
# have `dpi_stages` keep their presets in firmware instead — see
# effects.apply_dpi_preset().


def get_device_presets_path() -> str:
    """Return the path to the per-device preset store, creating its dir."""
    return os.path.join(get_config_dir(), "device_presets.json")


def load_device_presets() -> dict[str, list[int]]:
    """Return the whole serial -> presets map, or {} if unreadable."""
    try:
        with open(get_device_presets_path(), "r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return {
            str(k): [int(x) for x in v]
            for k, v in data.items()
            if isinstance(v, list) and v
        }
    except FileNotFoundError:
        return {}
    except Exception as e:
        sys.stderr.write(f"Failed to load device presets: {e}\n")
        return {}


def save_device_presets(serial: str, presets: list[int]) -> bool:
    """Merge one device's presets into the store and write it back."""
    if not serial:
        sys.stderr.write("Error: empty device serial\n")
        return False
    data = load_device_presets()
    data[str(serial)] = [int(p) for p in presets]
    try:
        with open(get_device_presets_path(), "w") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        sys.stderr.write(f"Failed to save device presets: {e}\n")
        return False


# ── Battery cache ────────────────────────────────────────────────────────────
# Last known battery level per device, so a sleeping device keeps showing its
# real charge instead of the 0 the firmware reports when it does not answer.


def get_battery_cache_path() -> str:
    """Return the path to the last-known battery level store."""
    return os.path.join(get_config_dir(), "battery_cache.json")


def load_battery_cache() -> dict[str, int]:
    """Return the whole device key -> level map, or {} if unreadable."""
    try:
        with open(get_battery_cache_path(), "r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        out: dict[str, int] = {}
        for k, v in data.items():
            level = v.get("level") if isinstance(v, dict) else v
            try:
                out[str(k)] = int(level)
            except (TypeError, ValueError):
                continue
        return out
    except FileNotFoundError:
        return {}
    except Exception as e:
        sys.stderr.write(f"Failed to load battery cache: {e}\n")
        return {}


def load_battery_level(key: str) -> int | None:
    """Return the last known battery level for a device, or None."""
    if not key:
        return None
    return load_battery_cache().get(str(key))


def save_battery_level(key: str, level: Any) -> bool:
    """Record a device's battery level, skipping the write when unchanged.

    Keyed by device name rather than serial: OpenRazer synthesises a serial
    when a device is asleep at daemon start, so serials are not stable across
    daemon restarts — see the DPI preset store for the same hazard.
    """
    if not key:
        return False
    try:
        value = int(level)
    except (TypeError, ValueError):
        return False

    cache = load_battery_cache()
    if cache.get(str(key)) == value:
        return True

    cache[str(key)] = value
    try:
        with open(get_battery_cache_path(), "w") as f:
            json.dump({k: {"level": v} for k, v in cache.items()}, f, indent=2)
        return True
    except Exception as e:
        sys.stderr.write(f"Failed to save battery cache: {e}\n")
        return False
