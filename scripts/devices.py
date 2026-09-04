#!/usr/bin/env python3
"""Device status and discovery for OmaRazer."""

from __future__ import annotations

from typing import Any

from scripts.helpers import (
    safe_get,
    classify_device_type,
    normalize_effect_name,
    normalize_battery_level,
)
from scripts.profiles import load_battery_level, save_battery_level


def get_device_info(device: Any, daemon_version: str = "") -> dict[str, Any]:
    """Extract full status and capabilities from a single OpenRazer device."""
    caps: dict[str, Any] = safe_get(device, "capabilities", {}) or {}

    # Battery
    #
    # OpenRazer answers 0 for a device that is asleep or otherwise unreachable,
    # so a 0 is treated as "no reading" and the last known level is shown
    # instead. Charging state is always read live — a stale "Charging" badge
    # after the cable comes out is worse than briefly missing one.
    has_battery = bool(caps.get("battery", False))
    battery_level: int | None = None
    battery_stale = False
    is_charging: bool | None = None
    if has_battery:
        try:
            battery_level = normalize_battery_level(device.battery_level)
        except (NotImplementedError, Exception):
            battery_level = None

        cache_key = str(safe_get(device, "name", "") or "")
        if battery_level is None:
            cached = load_battery_level(cache_key)
            if cached is not None:
                battery_level = cached
                battery_stale = True
        else:
            save_battery_level(cache_key, battery_level)

        try:
            c = device.is_charging
            is_charging = bool(c) if c is not None else None
        except (NotImplementedError, Exception):
            is_charging = None

    # Brightness (0 - 100)
    brightness: float | None = None
    has_brightness = bool(caps.get("brightness", False))
    if has_brightness:
        try:
            br = device.brightness
            brightness = round(float(br), 1) if br is not None else None
        except (NotImplementedError, Exception):
            brightness = None

    # DPI
    dpi: list[int] | None = None
    max_dpi: int | None = None
    has_dpi = bool(caps.get("dpi", False))
    if has_dpi:
        try:
            dpi_val = device.dpi
            if isinstance(dpi_val, (tuple, list)):
                dpi = [int(x) for x in dpi_val]
            elif dpi_val is not None:
                dpi = [int(dpi_val), int(dpi_val)]
        except (NotImplementedError, Exception):
            dpi = None
        try:
            m = device.max_dpi
            max_dpi = int(m) if m is not None else None
        except (NotImplementedError, Exception):
            max_dpi = None

    # Hardware DPI stages (on-board memory steps)
    has_dpi_stages = bool(caps.get("dpi_stages", False))
    hardware_dpi_stages: list[int] = []
    active_dpi_stage: int | None = None
    if has_dpi_stages:
        try:
            stages_tuple = getattr(device, "dpi_stages", None)
            if isinstance(stages_tuple, (tuple, list)) and len(stages_tuple) >= 2:
                active_dpi_stage = int(stages_tuple[0])
                raw_stages = stages_tuple[1]
                for st in raw_stages:
                    if isinstance(st, (tuple, list)):
                        hardware_dpi_stages.append(int(st[0]))
                    else:
                        hardware_dpi_stages.append(int(st))
        except (NotImplementedError, Exception):
            has_dpi_stages = False
            hardware_dpi_stages = []
            active_dpi_stage = None

    # Poll Rate (Hz)
    poll_rate: int | None = None
    has_poll_rate = bool(caps.get("poll_rate", False))
    if has_poll_rate:
        try:
            pr = device.poll_rate
            poll_rate = int(pr) if pr is not None else None
        except (NotImplementedError, Exception):
            poll_rate = None

    # Supported poll rates
    supported_poll_rates: list[int] = []
    if has_poll_rate:
        try:
            rates = safe_get(device, "supported_poll_rates", [])
            if isinstance(rates, (list, tuple)) and rates:
                supported_poll_rates = [int(r) for r in rates]
            elif poll_rate is not None:
                supported_poll_rates = [125, 500, 1000]
        except (NotImplementedError, Exception):
            supported_poll_rates = [125, 500, 1000] if poll_rate is not None else []
    if not supported_poll_rates and has_poll_rate:
        supported_poll_rates = [125, 500, 1000]

    # Lighting / FX
    fx = safe_get(device, "fx", None)
    has_lighting = bool(caps.get("lighting", False) or fx is not None)
    current_effect: str | None = None
    colors: list[str] = []
    supported_effects: list[str] = []

    if has_lighting and fx is not None:
        try:
            eff = safe_get(fx, "effect", None)
            if eff:
                current_effect = normalize_effect_name(str(eff))
        except Exception:
            current_effect = None

        try:
            raw_colors = safe_get(fx, "colors", None)
            if isinstance(raw_colors, (bytes, bytearray)):
                for i in range(0, len(raw_colors), 3):
                    chunk = raw_colors[i : i + 3]
                    if len(chunk) == 3:
                        colors.append(f"#{chunk[0]:02x}{chunk[1]:02x}{chunk[2]:02x}")
        except Exception:
            colors = []

        candidate_effects = [
            "none",
            "static",
            "spectrum",
            "wave",
            "breath_single",
            "breath_random",
            "breath_dual",
            "breath_triple",
            "reactive",
            "ripple",
            "ripple_random",
            "starlight_random",
            "starlight_single",
            "starlight_dual",
            "wheel",
        ]
        for e in candidate_effects:
            try:
                if hasattr(fx, "has") and fx.has(e):
                    supported_effects.append(e)
                elif caps.get(f"lighting_{e}", False):
                    supported_effects.append(e)
            except Exception:
                pass

    raw_type = str(safe_get(device, "type", "accessory")).lower()
    name = str(safe_get(device, "name", "Unknown Razer Device"))
    dev_type = classify_device_type(raw_type, name)
    serial = str(safe_get(device, "serial", ""))
    firmware_version = str(safe_get(device, "firmware_version", ""))
    driver_version = str(safe_get(device, "driver_version", daemon_version))

    # Per-key / matrix lighting
    has_per_key = False
    matrix_rows = 0
    matrix_cols = 0
    try:
        fx_obj = safe_get(device, "fx", None)
        advanced = safe_get(fx_obj, "advanced", None) if fx_obj else None
        if advanced is not None:
            has_per_key = True
            matrix_rows = int(safe_get(advanced, "rows", 0) or 0)
            matrix_cols = int(safe_get(advanced, "cols", 0) or 0)
    except Exception:
        pass

    return {
        "name": name,
        "type": dev_type,
        "serial": serial,
        "firmware_version": firmware_version,
        "driver_version": driver_version,
        "has_battery": has_battery,
        "battery_level": battery_level,
        "battery_stale": battery_stale,
        "is_charging": is_charging,
        "has_brightness": has_brightness,
        "brightness": brightness,
        "has_dpi": has_dpi,
        "dpi": dpi,
        "max_dpi": max_dpi,
        "has_dpi_stages": has_dpi_stages,
        "hardware_dpi_stages": hardware_dpi_stages,
        "active_dpi_stage": active_dpi_stage,
        "has_poll_rate": has_poll_rate,
        "poll_rate": poll_rate,
        "supported_poll_rates": supported_poll_rates,
        "has_lighting": has_lighting,
        "has_per_key": has_per_key,
        "matrix_rows": matrix_rows,
        "matrix_cols": matrix_cols,
        "current_effect": current_effect,
        "colors": colors,
        "primary_color": colors[0] if colors else "#00ff00",
        "supported_effects": supported_effects,
        "capabilities": {
            "battery": has_battery,
            "brightness": has_brightness,
            "dpi": has_dpi,
            "dpi_stages": has_dpi_stages,
            "poll_rate": has_poll_rate,
            "lighting": has_lighting,
            "per_key": has_per_key,
        },
    }


def get_razer_status() -> dict[str, Any]:
    """Connect to OpenRazer daemon and collect status for all connected devices."""
    try:
        import openrazer.client
    except ImportError:
        return {
            "daemon_running": False,
            "version": "",
            "sync_effects": False,
            "error": "openrazer Python library is not installed",
            "device_count": 0,
            "devices": [],
        }

    try:
        dm = openrazer.client.DeviceManager()
    except openrazer.client.DaemonNotFound:
        return {
            "daemon_running": False,
            "version": "",
            "sync_effects": False,
            "error": "OpenRazer daemon is not running (DaemonNotFound)",
            "device_count": 0,
            "devices": [],
        }
    except Exception as e:
        return {
            "daemon_running": False,
            "version": "",
            "sync_effects": False,
            "error": f"Failed to connect to OpenRazer daemon: {e}",
            "device_count": 0,
            "devices": [],
        }

    daemon_version = str(safe_get(dm, "version", ""))
    sync_effects = bool(safe_get(dm, "sync_effects", False))

    device_list: list[dict[str, Any]] = []
    try:
        raw_devices = dm.devices
    except Exception as e:
        return {
            "daemon_running": True,
            "version": daemon_version,
            "sync_effects": sync_effects,
            "error": f"Error querying devices: {e}",
            "device_count": 0,
            "devices": [],
        }

    for dev in raw_devices:
        try:
            device_list.append(get_device_info(dev, daemon_version))
        except Exception:
            continue

    return {
        "daemon_running": True,
        "version": daemon_version,
        "sync_effects": sync_effects,
        "device_count": len(device_list),
        "devices": device_list,
        "error": None,
    }


def print_summary(status: dict[str, Any]) -> None:
    """Print human-readable summary to stdout."""
    if not status.get("daemon_running"):
        print(f"OpenRazer Daemon: NOT RUNNING ({status.get('error', 'Unknown error')})")
        print("Hint: Start with 'systemctl --user start openrazer-daemon'")
        return

    print(f"Installed OpenRazer Daemon v{status.get('version', 'unknown')} - {status.get('device_count', 0)} devices connected")
    print("-" * 60)
    for i, dev in enumerate(status.get("devices", []), 1):
        print(f"[{i}] {dev['name']} ({dev['type'].title()})")
        print(f"    Serial:   {dev['serial'] or 'N/A'}")
        print(f"    Firmware: {dev['firmware_version'] or 'N/A'}")
        if dev.get("has_battery"):
            chg = " (Charging)" if dev.get("is_charging") else ""
            print(f"    Battery:  {dev.get('battery_level', 'N/A')}%{chg}")
        if dev.get("has_brightness") and dev.get("brightness") is not None:
            print(f"    Brightness: {dev.get('brightness')}%")
        if dev.get("has_lighting"):
            eff_str = dev.get("current_effect", "N/A")
            colors_str = ", ".join(dev.get("colors", [])) or "N/A"
            print(f"    Lighting:   Effect: {eff_str} | Colors: {colors_str}")
            if dev.get("supported_effects"):
                print(f"    Supported:  {', '.join(dev['supported_effects'])}")
        if dev.get("has_dpi") and dev.get("dpi") is not None:
            dpi_str = " x ".join(str(x) for x in dev["dpi"])
            max_str = f" (Max: {dev['max_dpi']})" if dev.get("max_dpi") else ""
            print(f"    DPI:      {dpi_str}{max_str}")
        if dev.get("has_poll_rate") and dev.get("poll_rate") is not None:
            print(f"    Poll Rate: {dev.get('poll_rate')} Hz")
        print()
