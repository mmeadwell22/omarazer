#!/usr/bin/env python3
"""Device control for OmaRazer — brightness, poll rate, and lighting effects."""

from __future__ import annotations

import sys
from typing import Any

from scripts.helpers import safe_get, normalize_effect_name, parse_color, parse_speed, parse_direction


def _connect():
    """Connect to the OpenRazer daemon and return DeviceManager."""
    import openrazer.client

    return openrazer.client.DeviceManager()


def set_brightness(serial: str, value: float) -> bool:
    """Set brightness (0-100) for a device by serial number or 'all'."""
    try:
        dm = _connect()
    except Exception as e:
        sys.stderr.write(f"Error connecting to OpenRazer daemon: {e}\n")
        return False

    value = max(0.0, min(100.0, float(value)))
    found = False
    for dev in dm.devices:
        dev_serial = str(safe_get(dev, "serial", ""))
        if serial.lower() == "all" or dev_serial.lower() == serial.lower():
            try:
                dev.brightness = value
                found = True
            except Exception as e:
                sys.stderr.write(f"Failed to set brightness on {dev.name}: {e}\n")

    return found


def set_poll_rate(serial: str, rate: int) -> bool:
    """Set poll rate for a device by serial number."""
    try:
        dm = _connect()
    except Exception as e:
        sys.stderr.write(f"Error connecting to OpenRazer daemon: {e}\n")
        return False

    found = False
    for dev in dm.devices:
        dev_serial = str(safe_get(dev, "serial", ""))
        if dev_serial.lower() == serial.lower():
            try:
                dev.poll_rate = int(rate)
                found = True
            except Exception as e:
                sys.stderr.write(f"Failed to set poll rate on {dev.name}: {e}\n")

    return found


def set_dpi(serial: str, dpi_x: int, dpi_y: int | None = None) -> bool:
    """Set DPI for a device by serial number or 'all'."""
    try:
        dm = _connect()
    except Exception as e:
        sys.stderr.write(f"Error connecting to OpenRazer daemon: {e}\n")
        return False

    dpi_x = int(dpi_x)
    dpi_y = int(dpi_y) if dpi_y is not None else dpi_x

    found = False
    for dev in dm.devices:
        dev_serial = str(safe_get(dev, "serial", ""))
        if serial.lower() == "all" or dev_serial.lower() == serial.lower():
            try:
                max_dpi = int(safe_get(dev, "max_dpi", 20000) or 20000)
                cur_x = max(100, min(max_dpi, dpi_x))
                cur_y = max(100, min(max_dpi, dpi_y))

                if hasattr(dev, "has") and dev.has("available_dpi"):
                    dev.dpi = (cur_x, 0)
                else:
                    dev.dpi = (cur_x, cur_y)
                found = True
            except Exception as e:
                try:
                    dev.dpi = (cur_x, cur_y)
                    found = True
                except Exception as e2:
                    sys.stderr.write(f"Failed to set DPI on {dev.name}: {e2}\n")

    return found


def set_dpi_stages(
    serial: str, active_stage: int, stages: list[int | list[int] | tuple[int, int]]
) -> bool:
    """Set hardware DPI stages on mouse on-board memory by serial or 'all'."""
    try:
        dm = _connect()
    except Exception as e:
        sys.stderr.write(f"Error connecting to OpenRazer daemon: {e}\n")
        return False

    found = False
    for dev in dm.devices:
        dev_serial = str(safe_get(dev, "serial", ""))
        if serial.lower() == "all" or dev_serial.lower() == serial.lower():
            if hasattr(dev, "has") and dev.has("dpi_stages"):
                try:
                    max_dpi = int(safe_get(dev, "max_dpi", 20000) or 20000)
                    tuples_list: list[tuple[int, int]] = []
                    for st in stages:
                        if isinstance(st, (list, tuple)):
                            x = max(100, min(max_dpi, int(st[0])))
                            y = max(100, min(max_dpi, int(st[1]) if len(st) > 1 else x))
                        else:
                            x = max(100, min(max_dpi, int(st)))
                            y = x
                        tuples_list.append((x, y))

                    if not tuples_list:
                        continue

                    act = max(1, min(len(tuples_list), int(active_stage)))
                    dev.dpi_stages = (act, tuples_list)
                    found = True
                except Exception as exc:
                    sys.stderr.write(
                        f"Failed to set hardware DPI stages on {dev.name}: {exc}\n"
                    )

    return found



def set_effect(
    serial: str,
    effect: str,
    color: str | None = None,
    color2: str | None = None,
    param: str | None = None,
) -> bool:
    """Set lighting effect on a device by serial number or 'all'."""
    try:
        dm = _connect()
    except Exception as e:
        sys.stderr.write(f"Error connecting to OpenRazer daemon: {e}\n")
        return False

    eff = normalize_effect_name(effect)

    # Resolve colors
    rgb = (0, 255, 0)
    if color and color.lower() != "random":
        try:
            rgb = parse_color(color)
        except Exception:
            rgb = (0, 255, 0)

    rgb2 = None
    if color2 and color2.lower() != "random":
        try:
            rgb2 = parse_color(color2)
        except Exception:
            rgb2 = None

    found = False
    for dev in dm.devices:
        dev_serial = str(safe_get(dev, "serial", ""))
        if serial.lower() == "all" or dev_serial.lower() == serial.lower():
            fx = safe_get(dev, "fx", None)
            if not fx:
                continue
            try:
                if eff == "none":
                    if hasattr(fx, "none"):
                        fx.none()
                        found = True
                elif eff == "static":
                    if hasattr(fx, "static"):
                        fx.static(*rgb)
                        found = True
                elif eff == "spectrum":
                    if hasattr(fx, "spectrum"):
                        fx.spectrum()
                        found = True
                elif eff == "wave":
                    direction = parse_direction(param or color2 or color, 1)
                    if hasattr(fx, "wave"):
                        fx.wave(direction)
                        found = True
                elif eff == "breath_random":
                    if hasattr(fx, "breath_random"):
                        fx.breath_random()
                        found = True
                    elif hasattr(fx, "breath_single"):
                        fx.breath_single(*rgb)
                        found = True
                elif eff in ("breath_single", "breath"):
                    if color and color.lower() == "random" and hasattr(fx, "breath_random"):
                        fx.breath_random()
                        found = True
                    elif rgb2 and hasattr(fx, "breath_dual"):
                        fx.breath_dual(rgb[0], rgb[1], rgb[2], rgb2[0], rgb2[1], rgb2[2])
                        found = True
                    elif hasattr(fx, "breath_single"):
                        fx.breath_single(*rgb)
                        found = True
                    elif hasattr(fx, "breath_random"):
                        fx.breath_random()
                        found = True
                elif eff == "breath_dual":
                    if rgb2 and hasattr(fx, "breath_dual"):
                        fx.breath_dual(rgb[0], rgb[1], rgb[2], rgb2[0], rgb2[1], rgb2[2])
                        found = True
                    elif hasattr(fx, "breath_single"):
                        fx.breath_single(*rgb)
                        found = True
                elif eff == "reactive":
                    speed = parse_speed(param or color2, 2)
                    if hasattr(fx, "reactive"):
                        fx.reactive(rgb[0], rgb[1], rgb[2], speed)
                        found = True
                elif eff in ("ripple_random", "ripple"):
                    speed = parse_speed(param or color2 or (color if eff == "ripple_random" else None), 2)
                    rate_map = {1: 0.025, 2: 0.05, 3: 0.1, 4: 0.15}
                    refreshrate = rate_map.get(speed, 0.05)
                    if eff == "ripple" and hasattr(fx, "ripple") and color and color.lower() != "random":
                        try:
                            fx.ripple(rgb[0], rgb[1], rgb[2], refreshrate=refreshrate)
                            found = True
                        except TypeError:
                            fx.ripple(*rgb)
                            found = True
                    elif hasattr(fx, "ripple_random"):
                        try:
                            fx.ripple_random(refreshrate=refreshrate)
                            found = True
                        except TypeError:
                            fx.ripple_random()
                            found = True
                    elif hasattr(fx, "ripple"):
                        try:
                            fx.ripple(rgb[0], rgb[1], rgb[2], refreshrate=refreshrate)
                            found = True
                        except TypeError:
                            fx.ripple(*rgb)
                            found = True
                elif eff == "starlight_random":
                    speed = min(3, max(1, parse_speed(param or color2 or color, 2)))
                    if hasattr(fx, "starlight_random"):
                        fx.starlight_random(speed)
                        found = True
                elif eff == "starlight_single":
                    speed = min(3, max(1, parse_speed(param or color2, 2)))
                    if hasattr(fx, "starlight_single"):
                        fx.starlight_single(rgb[0], rgb[1], rgb[2], speed)
                        found = True
                elif eff == "starlight_dual":
                    speed = min(3, max(1, parse_speed(param, 2)))
                    r2, g2, b2 = rgb2 if rgb2 else (0, 229, 255)
                    if hasattr(fx, "starlight_dual"):
                        fx.starlight_dual(rgb[0], rgb[1], rgb[2], r2, g2, b2, speed)
                        found = True
                else:
                    # Generic fallback if method exists directly on fx
                    if hasattr(fx, eff) and callable(getattr(fx, eff)):
                        fn = getattr(fx, eff)
                        try:
                            fn(*rgb)
                            found = True
                        except TypeError:
                            try:
                                fn()
                                found = True
                            except Exception:
                                pass
            except Exception as e:
                sys.stderr.write(f"Failed to set effect {eff} on {dev.name}: {e}\n")

    return found


def apply_dpi_preset(
    serial: str, dpi: int, stages: list[int] | None = None
) -> bool:
    """Set active DPI, committing the preset list to on-board memory when supported.

    Mice with `dpi_stages` keep their stage list and active stage in firmware, so
    writing there is what makes presets survive a reboot. Devices without that
    capability fall back to a plain DPI set (persistence handled on disk).
    """
    dpi = int(dpi)
    stages = [int(s) for s in (stages or [])]

    if not stages:
        return set_dpi(serial, dpi, dpi)

    try:
        dm = _connect()
    except Exception as e:
        sys.stderr.write(f"Error connecting to OpenRazer daemon: {e}\n")
        return False

    found = False
    for dev in dm.devices:
        dev_serial = str(safe_get(dev, "serial", ""))
        if serial.lower() != "all" and dev_serial.lower() != serial.lower():
            continue

        if not (hasattr(dev, "has") and dev.has("dpi_stages")):
            # No on-board stage memory — just set the DPI.
            found = set_dpi(dev_serial, dpi, dpi) or found
            continue

        # Active stage is 1-based; fall back to stage 1 for a DPI that is not
        # one of the presets, then set that DPI explicitly on top.
        try:
            active = stages.index(dpi) + 1
        except ValueError:
            active = 1

        if not set_dpi_stages(dev_serial, active, list(stages)):
            continue
        found = True

        if dpi not in stages:
            set_dpi(dev_serial, dpi, dpi)

    return found
