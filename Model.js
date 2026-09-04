// ──────────────────────────────────────────────────────────────────────────────
// OmaRazer — Model.js
// Shared logic module for the OmaRazer Omarchy shell plugin.
// Contains all pure helper functions used by Panel.qml and ui/*.qml:
//   - Data parsing & daemon response handling
//   - Device type detection & icon mapping
//   - Battery, DPI, brightness, poll-rate formatting
//   - Effect system (display names, icons, categories, availability)
//   - Color palette & per-device color management
//   - Speed levels & effect parameter helpers
//   - Per-key lighting helpers & keyboard key-label mapping
//   - Device ordering & persistent settings helpers
//   - Desktop notification helpers (connect/disconnect detection)
//
// Imported as: import "Model.js" as Model
// Also consumed by Node.js tests via module.exports at the bottom.
// ──────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// DATA PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse raw JSON output from the OpenRazer daemon CLI.
 * Returns a normalized object: { daemon_running, version, device_count, devices, error }
 * Falls back to an empty/error state on parse failure or empty input.
 */
function parseData(raw) {
  if (!raw) return { daemon_running: false, version: "", device_count: 0, devices: [], error: "No data" }
  try {
    var str = String(raw).trim()
    var parsed = JSON.parse(str)
    if (parsed && typeof parsed === "object") {
      if (!Array.isArray(parsed.devices)) parsed.devices = []
      if (typeof parsed.device_count !== "number") parsed.device_count = parsed.devices.length
      if (parsed.daemon_running === undefined) parsed.daemon_running = true
      return parsed
    }
  } catch (e) {
    // Ignore parse error and fallback
  }
  return { daemon_running: false, version: "", device_count: 0, devices: [], error: "Failed to parse data" }
}


// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE TYPE DETECTION & ICONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Return a Nerd Font icon character for a device type or device object.
 * Accepts either a device object ({ type, name }) or separate type/name strings.
 * Matches both the OpenRazer type field and known product name substrings.
 */
function deviceTypeIcon(typeOrDevice, name) {
  var type = ""
  var devName = ""
  if (typeOrDevice && typeof typeOrDevice === "object") {
    type = String(typeOrDevice.type || "")
    devName = String(typeOrDevice.name || "")
  } else {
    type = String(typeOrDevice || "")
    devName = String(name || "")
  }
  var t = type.toLowerCase().trim()
  var n = devName.toLowerCase().trim()

  if (t === "keyboard") return "󰌌"
  if (t === "keypad") return "󰦤"
  if (t === "mouse") return "󰍽"
  if (t === "speaker" || t === "speakers" || t === "soundbar" || n.indexOf("nommo") !== -1 || n.indexOf("speaker") !== -1 || n.indexOf("leviathan") !== -1 || n.indexOf("ferox") !== -1) return "󰓃"
  if (t === "headset" || t === "headphones" || n.indexOf("headset") !== -1 || n.indexOf("headphone") !== -1 || n.indexOf("kraken") !== -1 || n.indexOf("nari") !== -1 || n.indexOf("blackshark") !== -1 || n.indexOf("barracuda") !== -1 || n.indexOf("kaira") !== -1 || n.indexOf("opus") !== -1 || n.indexOf("hammerhead") !== -1 || n.indexOf("thresher") !== -1 || n.indexOf("electra") !== -1 || n.indexOf("seiren") !== -1) return "󰋋"
  if (t === "audio") {
    if (n.indexOf("nommo") !== -1 || n.indexOf("speaker") !== -1 || n.indexOf("leviathan") !== -1 || n.indexOf("ferox") !== -1) return "󰓃"
    return "󰋋"
  }
  if (t === "mousemat" || t === "mat" || t === "pad" || n.indexOf("firefly") !== -1 || n.indexOf("goliathus") !== -1 || n.indexOf("strider") !== -1 || n.indexOf("mouse mat") !== -1 || n.indexOf("mousemat") !== -1) return "󰆥"
  if (t === "accessory" || t === "dock" || t === "stand" || t === "hub" || t === "chassis" || t === "other" || t === "generic") return "󰒋"
  return "󰒋"
}


// ═══════════════════════════════════════════════════════════════════════════════
// BATTERY STATUS
// ═══════════════════════════════════════════════════════════════════════════════

/** Return a battery level icon (Nerd Font) based on percentage and charging state. */
function batteryIcon(level, isCharging) {
  if (isCharging) return "󰂄"
  if (level === null || level === undefined || level < 0) return ""
  var l = Math.round(Number(level))
  if (l >= 90) return "󰁹"
  if (l >= 75) return "󰂁"
  if (l >= 50) return "󰁿"
  if (l >= 25) return "󰁽"
  if (l >= 10) return "󰁻"
  return "󰂎"
}

/**
 * Return the battery badge text for a device card, e.g. "97%" or
 * "97% \u26a1 Charging". Empty string when the device has no battery or no
 * usable reading, so the caller can hide the badge entirely.
 *
 * A cached (stale) level is rendered exactly like a live one \u2014 a sleeping
 * mouse still has the charge it went to sleep with.
 */
function batteryBadgeText(device) {
  if (!device || !device.has_battery) return ""
  var level = device.battery_level
  var hasLevel = typeof level === "number" && isFinite(level) && level > 0
  var charging = !!device.is_charging
  if (!hasLevel) return charging ? "\u26a1 Charging" : ""
  return charging ? level + "% \u26a1 Charging" : level + "%"
}

/** Return a color hex string for battery level (green/yellow/red). */
function batteryColor(level, isCharging) {
  if (isCharging) return "#22c55e"
  if (level === null || level === undefined || level < 0) return ""
  var l = Math.round(Number(level))
  if (l <= 15) return "#ef4444"
  if (l <= 30) return "#eab308"
  return "#22c55e"
}


// ═══════════════════════════════════════════════════════════════════════════════
// BAR BUTTON FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Poll interval in seconds used while the panel is CLOSED, from user settings.
 * The bar only needs a battery percentage and a device count, so it backs off
 * hard rather than doing a full device read every 30 seconds all day.
 */
function getIdlePollInterval(settings, defaultVal) {
  var d = (typeof defaultVal === "number" && defaultVal >= 5) ? defaultVal : 300
  if (!settings || typeof settings !== "object") return d
  var v = settings.idlePollIntervalSec
  if (typeof v === "number" && v >= 30 && v <= 3600) return Math.round(v)
  if (typeof v === "string") {
    var n = parseInt(v, 10)
    if (!isNaN(n) && n >= 30 && n <= 3600) return n
  }
  return d
}

/**
 * The interval the poll timer should actually use, given whether the panel is
 * open. Never returns an idle interval shorter than the open one — a closed
 * panel polling more eagerly than an open one would be nonsense.
 */
function effectivePollInterval(settings, panelOpen) {
  var active = getPollInterval(settings, 30)
  if (panelOpen) return active
  return Math.max(active, getIdlePollInterval(settings, 300))
}

/**
 * Format the text shown in the bar widget button.
 * mode: "Device count" (default), "Battery level", or "Icon only".
 * Also accepts legacy booleans (true = "Device count", false = "Icon only").
 */
function formatBarText(data, mode) {
  var icon = "󰾰"
  if (!data || !data.daemon_running) return icon + " !"

  if (mode === true) mode = "Device count"
  if (mode === false) mode = "Icon only"

  if (mode === "Battery level") {
    var dev = firstBatteryDevice(data)
    if (dev && typeof dev.battery_level === "number") {
      return icon + " " + dev.battery_level + "%" + (dev.is_charging ? " ⚡" : "")
    }
    return icon + " --"
  }

  if (mode === "Icon only") {
    return icon
  }

  var count = typeof data.device_count === "number" ? data.device_count : (data.devices ? data.devices.length : 0)
  return icon + " " + count
}

/** The ordered list of valid bar display modes, for cycling and validation. */
var BAR_DISPLAY_MODES = ["Device count", "Battery level", "Icon only"]

/** Short label for the header cycle button (kept compact for the button chrome). */
function barDisplayModeShortLabel(mode) {
  if (mode === "Battery level") return "Battery"
  if (mode === "Icon only") return "Icon"
  return "Count"
}

/** Return the next bar display mode after `mode`, wrapping around. */
function nextBarDisplayMode(mode) {
  var idx = BAR_DISPLAY_MODES.indexOf(mode)
  return BAR_DISPLAY_MODES[(idx + 1) % BAR_DISPLAY_MODES.length]
}

/** Return the first connected device that reports battery capability, or null. */
function firstBatteryDevice(data) {
  if (!data || !Array.isArray(data.devices)) return null
  for (var i = 0; i < data.devices.length; i++) {
    if (data.devices[i] && data.devices[i].has_battery) return data.devices[i]
  }
  return null
}

/** Capitalize the first letter of a device type string (e.g. "keyboard" -> "Keyboard"). */
function formatDeviceType(type) {
  var t = String(type || "").trim()
  if (!t) return "Accessory"
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}


// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE METRICS FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/** Format DPI value(s) as a display string (e.g. "16000 DPI" or "800 x 1600 DPI"). */
function formatDpi(dpi) {
  if (Array.isArray(dpi)) {
    if (dpi.length === 2 && dpi[0] === dpi[1]) return dpi[0] + " DPI"
    if (dpi.length === 2) return dpi[0] + " x " + dpi[1] + " DPI"
    if (dpi.length === 1) return dpi[0] + " DPI"
  }
  if (typeof dpi === "number" && dpi > 0) return Math.round(dpi) + " DPI"
  return ""
}

/** Return standard default DPI preset steps. */
function defaultDpiPresets() {
  return [800, 1200, 1800, 2400, 3200]
}

/** Sanitize a DPI value within valid bounds (100 to maxDpi, default max 20000). */
function sanitizeDpi(dpi, maxDpi) {
  var max = (typeof maxDpi === "number" && maxDpi >= 100) ? maxDpi : 20000
  var val = 800
  if (Array.isArray(dpi) && dpi.length > 0) val = Number(dpi[0])
  else if (typeof dpi === "number") val = Number(dpi)
  else if (typeof dpi === "string") val = parseInt(dpi, 10)
  if (isNaN(val) || val <= 0) val = 800
  return Math.max(100, Math.min(max, Math.round(val)))
}

/**
 * Clean, deduplicate and numerically sort an array of DPI preset values.
 * Returns defaultDpiPresets() if the array is empty or contains no valid numbers.
 */
function sortDpiPresets(presets, maxDpi) {
  if (!Array.isArray(presets) || presets.length === 0) return defaultDpiPresets()
  var max = (typeof maxDpi === "number" && maxDpi >= 100) ? maxDpi : 20000
  var seen = {}
  var result = []
  for (var i = 0; i < presets.length; i++) {
    var raw = presets[i]
    var val = parseInt(raw, 10)
    if (!isNaN(val) && val >= 100 && val <= max && !seen[val]) {
      seen[val] = true
      result.push(val)
    }
  }
  if (result.length === 0) return defaultDpiPresets()
  result.sort(function(a, b) { return a - b })
  return result
}

/** Check if a preset step matches current device DPI. */
function isDpiPresetSelected(currentDpi, preset) {
  var cur = 0
  if (Array.isArray(currentDpi) && currentDpi.length > 0) cur = Number(currentDpi[0])
  else if (typeof currentDpi === "number") cur = Number(currentDpi)
  else if (typeof currentDpi === "string") cur = parseInt(currentDpi, 10)
  return cur === Number(preset)
}

/** Default DPI profile names list. */
function defaultDpiProfiles() {
  return ["Default", "FPS", "Gaming", "Office"]
}

/** Format polling rate as "NNN Hz". */
function formatPollRate(pollRate) {
  if (typeof pollRate === "number" && pollRate > 0) {
    return Math.round(pollRate) + " Hz"
  }
  return ""
}

/** Get the list of supported polling rates for a device, with sensible defaults. */
function supportedPollRates(device) {
  if (device && Array.isArray(device.supported_poll_rates) && device.supported_poll_rates.length > 0) {
    return device.supported_poll_rates
  }
  if (device && (device.has_poll_rate || device.type === "mouse")) {
    return [125, 500, 1000]
  }
  return []
}

/** Format daemon version string for the header subtitle. */
function formatDaemonVersion(version) {
  if (!version) return ""
  return "Installed OpenRazer Daemon v" + version
}

/** Check if any device in the list supports brightness control. */
function hasBrightnessSupport(devices) {
  if (!Array.isArray(devices)) return false
  for (var i = 0; i < devices.length; i++) {
    if (devices[i] && devices[i].has_brightness) return true
  }
  return false
}

/** Calculate the average brightness across all devices that report it. */
function averageBrightness(devices) {
  if (!Array.isArray(devices) || devices.length === 0) return 100
  var sum = 0
  var count = 0
  for (var i = 0; i < devices.length; i++) {
    var d = devices[i]
    if (d && d.has_brightness && d.brightness !== null && d.brightness !== undefined) {
      sum += Number(d.brightness)
      count++
    }
  }
  return count > 0 ? Math.round(sum / count) : 100
}

/** Format a brightness value as a percentage string (e.g. "75%"). */
function formatBrightness(val) {
  if (val !== null && val !== undefined && !isNaN(Number(val))) {
    return Math.round(Number(val)) + "%"
  }
  return ""
}

/** Read the poll interval from user settings, with a fallback default (seconds). */
function getPollInterval(settings, defaultVal) {
  var d = (typeof defaultVal === "number" && defaultVal >= 5) ? defaultVal : 30
  if (!settings || typeof settings !== "object") return d
  var v = settings.pollIntervalSec !== undefined ? settings.pollIntervalSec : settings.refreshIntervalSec
  if (typeof v === "number" && v >= 5 && v <= 3600) return Math.round(v)
  if (typeof v === "string") {
    var n = parseInt(v, 10)
    if (!isNaN(n) && n >= 5 && n <= 3600) return n
  }
  return d
}

/** Generate a human-readable summary of device status (shown in bar tooltip + header). */
function summaryText(data) {
  if (!data || !data.daemon_running) {
    return data && data.error ? data.error : "OpenRazer daemon not running"
  }
  var count = typeof data.device_count === "number" ? data.device_count : (data.devices ? data.devices.length : 0)
  if (count === 0) return "No Razer devices connected"
  if (count === 1) return "1 device connected"
  return count + " devices connected"
}


// ═══════════════════════════════════════════════════════════════════════════════
// COLOR PALETTE & DEVICE COLORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Return the full color palette array (51 colors) for the effect color pickers.
 * Organized in rows: Neutrals, Saturated spectrum, Pastels, Dark tones.
 * Each entry: { name: string, hex: string }
 */
function paletteColors() {
  return [
    // ── Neutrals ──
    { name: "White", hex: "#ffffff" },
    { name: "Snow", hex: "#f5f5f5" },
    { name: "Silver", hex: "#c0c0c0" },
    { name: "Gray", hex: "#666666" },
    { name: "Charcoal", hex: "#333333" },

    // ── Saturated Spectrum ──
    { name: "Razer Green", hex: "#00ff00" },
    { name: "Emerald", hex: "#10b981" },
    { name: "Mint", hex: "#34d399" },
    { name: "Teal", hex: "#14b8a6" },
    { name: "Cyan", hex: "#00e5ff" },
    { name: "Aqua", hex: "#06b6d4" },
    { name: "Sky", hex: "#38bdf8" },
    { name: "Blue", hex: "#2563eb" },
    { name: "Cobalt", hex: "#1d4ed8" },
    { name: "Indigo", hex: "#6366f1" },
    { name: "Purple", hex: "#8000ff" },
    { name: "Violet", hex: "#a855f7" },
    { name: "Lavender", hex: "#c084fc" },
    { name: "Magenta", hex: "#d946ef" },
    { name: "Pink", hex: "#ec4899" },
    { name: "Rose", hex: "#f43f5e" },
    { name: "Red", hex: "#ef4444" },
    { name: "Crimson", hex: "#dc2626" },
    { name: "Vermillion", hex: "#e11d48" },
    { name: "Orange", hex: "#f97316" },
    { name: "Amber", hex: "#f59e0b" },
    { name: "Yellow", hex: "#eab308" },
    { name: "Lime", hex: "#84cc16" },

    // ── Pastels ──
    { name: "Pastel Green", hex: "#86efac" },
    { name: "Pastel Teal", hex: "#99f6e4" },
    { name: "Pastel Cyan", hex: "#67e8f9" },
    { name: "Pastel Blue", hex: "#93c5fd" },
    { name: "Pastel Indigo", hex: "#a5b4fc" },
    { name: "Pastel Purple", hex: "#c4b5fd" },
    { name: "Pastel Lavender", hex: "#d8b4fe" },
    { name: "Pastel Pink", hex: "#f9a8d4" },
    { name: "Pastel Red", hex: "#fca5a5" },
    { name: "Pastel Orange", hex: "#fdba74" },
    { name: "Pastel Yellow", hex: "#fde047" },
    { name: "Pastel Lime", hex: "#d9f99d" },

    // ── Dark Tones ──
    { name: "Dark Green", hex: "#065f46" },
    { name: "Dark Teal", hex: "#115e59" },
    { name: "Dark Cyan", hex: "#0e7490" },
    { name: "Dark Blue", hex: "#1e3a5f" },
    { name: "Dark Indigo", hex: "#312e81" },
    { name: "Dark Purple", hex: "#581c87" },
    { name: "Dark Pink", hex: "#9d174d" },
    { name: "Dark Red", hex: "#7f1d1d" },
    { name: "Dark Orange", hex: "#9a3412" },
    { name: "Warm White", hex: "#fef3c7" },
    { name: "Cool White", hex: "#e0f2fe" }
  ]
}

/** Get the primary color for a device (from its color array or fallback to Razer Green). */
function primaryColor(device) {
  if (!device) return "#00ff00"
  if (Array.isArray(device.colors) && device.colors.length > 0 && device.colors[0]) {
    return device.colors[0]
  }
  if (device.primary_color) return device.primary_color
  return "#00ff00"
}

/** Get the secondary color for a device (from its color array or fallback to Cyan). */
function secondaryColor(device) {
  if (!device) return "#00e5ff"
  if (Array.isArray(device.colors) && device.colors.length > 1 && device.colors[1]) {
    return device.colors[1]
  }
  if (device.secondary_color) return device.secondary_color
  return "#00e5ff"
}


// ═══════════════════════════════════════════════════════════════════════════════
// EFFECT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/** Return available speed levels for an effect type (reactive has 4 levels, others have 3). */
function speedLevels(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  if (e === "reactive") {
    return [
      { value: "1", label: "Fast", icon: "󱐋", desc: "Fast reaction (500ms)" },
      { value: "2", label: "Normal", icon: "󰓅", desc: "Normal reaction (1000ms)" },
      { value: "3", label: "Slow", icon: "󰾆", desc: "Slow reaction (1500ms)" },
      { value: "4", label: "Very Slow", icon: "󰄰", desc: "Very Slow reaction (2000ms)" }
    ]
  }
  return [
    { value: "1", label: "Fast", icon: "󱐋", desc: "Fast animation speed" },
    { value: "2", label: "Normal", icon: "󰓅", desc: "Normal animation speed" },
    { value: "3", label: "Slow", icon: "󰾆", desc: "Slow animation speed" }
  ]
}

/** Format a speed value ("1"-"4") as a human-readable label. */
function formatSpeed(speedVal) {
  var s = String(speedVal || "2").toLowerCase().trim()
  if (s === "1" || s === "fast") return "Fast"
  if (s === "2" || s === "normal" || s === "medium" || s === "med") return "Normal"
  if (s === "3" || s === "slow") return "Slow"
  if (s === "4" || s === "very_slow" || s === "veryslow") return "Very Slow"
  return "Normal"
}

/** Convert an internal effect name to a human-readable display label. */
function effectDisplayName(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  if (e === "none" || e === "off") return "Off"
  if (e === "static") return "Static"
  if (e === "spectrum" || e === "spectrumcycling" || e === "spectrum_cycling") return "Spectrum"
  if (e === "wave") return "Wave"
  if (e === "breath_single" || e === "breathsingle" || e === "breath" || e === "breathing") return "Breathing"
  if (e === "breath_random" || e === "breathrandom") return "Breathing (Rand)"
  if (e === "breath_dual" || e === "breathdual") return "Dual Breathing"
  if (e === "reactive") return "Reactive"
  if (e === "ripple") return "Ripple"
  if (e === "ripple_random" || e === "ripplerandom") return "Ripple (Rand)"
  if (e === "starlight_random" || e === "starlightrandom" || e === "starlight") return "Starlight"
  if (e === "starlight_single") return "Starlight (Single)"
  if (e === "starlight_dual") return "Dual Starlight"
  if (!e) return "None"
  return e.charAt(0).toUpperCase() + e.slice(1).replace(/_/g, " ")
}

/** Return a Nerd Font icon for an effect name. */
function effectIcon(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  if (e === "none" || e === "off") return "󰚌"
  if (e === "static") return "󰏘"
  if (e === "spectrum" || e === "spectrumcycling" || e === "spectrum_cycling") return "󰑖"
  if (e === "wave") return "󰓅"
  if (e.indexOf("breath") === 0) return "󰔄"
  if (e === "reactive") return "󰌌"
  if (e.indexOf("ripple") === 0) return "󰑈"
  if (e.indexOf("starlight") === 0) return "󰵚"
  return "󰌵"
}

/** Check if an effect requires a primary color parameter. */
function needsColor(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  return e === "static" || e === "breath_single" || e === "breath" || e === "breathing" || e === "breath_dual" || e === "reactive" || e === "ripple" || e === "starlight_single" || e === "starlight_dual"
}

/** Check if an effect requires a secondary color parameter. Currently only starlight_dual. */
function needsSecondaryColor(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  // TODO: re-add "breath_dual" when dual breathing bug is resolved
  return e === "starlight_dual"
}

/** Check if an effect requires a direction parameter (currently only wave). */
function needsDirection(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  return e === "wave"
}

/** Check if an effect requires a speed parameter (reactive, starlight, ripple). */
function needsSpeed(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  return e === "reactive" || e.indexOf("starlight") === 0 || e.indexOf("ripple") === 0
}

/** Check if an effect is any breathing variant. */
function isBreathingEffect(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  return e.indexOf("breath") === 0
}

/** Check if an effect is any ripple variant. */
function isRippleEffect(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  return e.indexOf("ripple") === 0
}

/** Check if an effect is any starlight variant. */
function isStarlightEffect(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  return e.indexOf("starlight") === 0
}

/** Return the default supported effects list for a device type (used when daemon doesn't report them). */
function defaultEffectsForType(type) {
  var t = String(type || "").toLowerCase().trim()
  if (t === "keyboard") {
    return ["static", "spectrum", "wave", "breath_single", "breath_random", "breath_dual", "reactive", "ripple", "none"]
  }
  if (t === "mouse") {
    return ["static", "spectrum", "breath_single", "reactive", "none"]
  }
  if (t === "mousemat") {
    return ["static", "spectrum", "wave", "breath_single", "breath_random", "reactive", "none"]
  }
  if (t === "speaker" || t === "speakers" || t === "soundbar") {
    return ["static", "spectrum", "wave", "breath_single", "breath_random", "breath_dual", "none"]
  }
  if (t === "headset" || t === "headphones" || t === "audio") {
    return ["static", "spectrum", "breath_single", "none"]
  }
  if (t === "keypad") {
    return ["static", "spectrum", "wave", "breath_single", "reactive", "none"]
  }
  return ["static", "spectrum", "breath_single", "none"]
}

/**
 * Get the normalized, deduplicated list of available effects for a device.
 * Accepts a device object, effects array, or type string.
 * Effects are ordered by a priority list (static first, none last).
 */
function availableEffects(deviceOrEffects, deviceType) {
  var rawEffects = null
  var type = ""
  if (deviceOrEffects && typeof deviceOrEffects === "object" && !Array.isArray(deviceOrEffects)) {
    rawEffects = deviceOrEffects.supported_effects
    type = deviceOrEffects.type || ""
  } else if (Array.isArray(deviceOrEffects)) {
    rawEffects = deviceOrEffects
    type = deviceType || ""
  } else if (typeof deviceOrEffects === "string") {
    type = deviceOrEffects
  }

  if (!Array.isArray(rawEffects) || rawEffects.length === 0) {
    rawEffects = defaultEffectsForType(type)
  }

  // Canonical ordering for consistent UI display
  var priority = [
    "static",
    "spectrum",
    "wave",
    "breath_single",
    "breath_random",
    "breath_dual",
    "reactive",
    "ripple",
    "ripple_random",
    "starlight_random",
    "starlight_single",
    "starlight_dual",
    "none"
  ]

  // Normalize names: lowercase, replace hyphens with underscores, alias common variants
  var list = []
  var normalized = []
  for (var i = 0; i < rawEffects.length; i++) {
    var eff = String(rawEffects[i] || "").toLowerCase().replace(/-/g, "_")
    if (eff === "off") eff = "none"
    if (eff === "breath" || eff === "breathing") eff = "breath_single"
    if (eff && normalized.indexOf(eff) === -1) {
      normalized.push(eff)
    }
  }

  // Sort by priority order, then append any unknown effects at the end
  for (var p = 0; p < priority.length; p++) {
    if (normalized.indexOf(priority[p]) !== -1) {
      list.push(priority[p])
    }
  }

  for (var j = 0; j < normalized.length; j++) {
    if (list.indexOf(normalized[j]) === -1) {
      list.push(normalized[j])
    }
  }

  return list
}

/** Check if a device supports a specific effect by name. */
function hasEffect(device, effectName) {
  if (!device) return false
  var list = availableEffects(device)
  var target = String(effectName || "").toLowerCase().replace(/-/g, "_")
  if (target === "off") target = "none"
  if (target === "breath" || target === "breathing") target = "breath_single"
  for (var i = 0; i < list.length; i++) {
    if (String(list[i]).toLowerCase().replace(/-/g, "_") === target) {
      return true
    }
  }
  return false
}

/** Alias for availableEffects — normalizes and deduplicates an effects list. */
function sanitizeEffectsList(effects, deviceType) {
  return availableEffects(effects, deviceType)
}

/** Categorize an effect into "presets", "dynamic", or "interactive". */
function effectCategory(effect) {
  var e = String(effect || "").toLowerCase().replace(/-/g, "_")
  if (e === "static" || e === "spectrum" || e === "spectrumcycling" || e === "spectrum_cycling" || e === "none" || e === "off") {
    return "presets"
  }
  if (e.indexOf("breath") === 0 || e === "wave" || e.indexOf("starlight") === 0) {
    return "dynamic"
  }
  if (e === "reactive" || e.indexOf("ripple") === 0) {
    return "interactive"
  }
  return "presets"
}

/** Return the display label for an effect category. */
function categoryDisplayName(category) {
  var c = String(category || "").toLowerCase()
  if (c === "presets" || c === "basic") return "Presets"
  if (c === "dynamic" || c === "animated") return "Dynamic"
  if (c === "interactive" || c === "reactive") return "Interactive"
  return "Effects"
}

/** Return a Nerd Font icon for an effect category. */
function categoryIcon(category) {
  var c = String(category || "").toLowerCase()
  if (c === "presets" || c === "basic") return "󰏘"
  if (c === "dynamic" || c === "animated") return "󰑖"
  if (c === "interactive" || c === "reactive") return "󰌌"
  return "󰌵"
}

/**
 * Check if a button's effect matches the device's current active effect.
 * Handles sub-mode consolidation (e.g. "breath_single" matches any "breath_*" effect).
 */
function isEffectSelected(currentEffect, buttonEffect) {
  var curr = String(currentEffect || "").toLowerCase().replace(/-/g, "_")
  var btn = String(buttonEffect || "").toLowerCase().replace(/-/g, "_")
  if (btn === "breath_single" || btn === "breath" || btn === "breathing") {
    return curr.indexOf("breath") === 0
  }
  if (btn === "ripple") {
    return curr.indexOf("ripple") === 0
  }
  if (btn === "starlight" || btn === "starlight_random") {
    return curr.indexOf("starlight") === 0
  }
  if (btn === "none" || btn === "off") {
    return curr === "none" || curr === "off"
  }
  if (btn === "spectrum" || btn === "spectrumcycling" || btn === "spectrum_cycling") {
    return curr === "spectrum" || curr === "spectrumcycling" || curr === "spectrum_cycling"
  }
  return curr === btn
}

/**
 * Group available effects into categorized sections for the UI.
 * Sub-modes (breath_random, ripple_random, etc.) are consolidated into
 * their primary base effect button to avoid clutter.
 * Returns: [{ id, label, icon, effects: [string] }]
 */
function categorizedEffects(deviceOrEffects, deviceType) {
  var avail = availableEffects(deviceOrEffects, deviceType)
  var deviceObj = (deviceOrEffects && typeof deviceOrEffects === "object" && !Array.isArray(deviceOrEffects)) ? deviceOrEffects : null

  var categories = [
    { id: "presets", label: "Presets", icon: "󰏘", effects: [] },
    { id: "dynamic", label: "Dynamic", icon: "󰑖", effects: [] },
    { id: "interactive", label: "Interactive", icon: "󰌌", effects: [] }
  ]

  var addedBreathing = false
  var addedRipple = false
  var addedStarlight = false

  for (var i = 0; i < avail.length; i++) {
    var eff = avail[i]
    var cat = effectCategory(eff)
    var targetCat = null
    for (var c = 0; c < categories.length; c++) {
      if (categories[c].id === cat) {
        targetCat = categories[c]
        break
      }
    }
    if (!targetCat) targetCat = categories[0]

    // Consolidate sub-modes into primary base effect buttons
    if (eff.indexOf("breath") === 0) {
      if (!addedBreathing) {
        targetCat.effects.push("breath_single")
        addedBreathing = true
      }
    } else if (eff.indexOf("ripple") === 0) {
      if (!addedRipple) {
        targetCat.effects.push("ripple")
        addedRipple = true
      }
    } else if (eff.indexOf("starlight") === 0) {
      if (!addedStarlight) {
        targetCat.effects.push("starlight_random")
        addedStarlight = true
      }
    } else {
      if (targetCat.effects.indexOf(eff) === -1) {
        targetCat.effects.push(eff)
      }
    }
  }

  // Only return categories that have at least one effect
  var result = []
  for (var k = 0; k < categories.length; k++) {
    if (categories[k].effects.length > 0) {
      result.push(categories[k])
    }
  }
  return result
}

/** Check if a device's current effect has customizable parameters (color, speed, direction). */
function hasCustomizationOptions(device) {
  if (!device) return false
  var eff = device.current_effect
  if (!eff) return false
  if (needsColor(eff) || needsSecondaryColor(eff) || needsDirection(eff) || needsSpeed(eff)) return true
  if (isBreathingEffect(eff) || isRippleEffect(eff) || isStarlightEffect(eff)) return true
  return false
}


// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE ORDERING & SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

/** Read the saved device order (serial array) from user settings. */
function deviceOrderFromSettings(settings) {
  if (!settings || typeof settings !== "object") return []
  var v = settings.deviceOrder
  if (Array.isArray(v)) return v
  return []
}

/**
 * Reorder a device array according to a saved serial order.
 * Devices not in the order list are appended at the end.
 */
function applyDeviceOrder(devices, order) {
  if (!Array.isArray(devices) || devices.length === 0) return []
  if (!Array.isArray(order) || order.length === 0) return devices.slice()

  var bySerial = {}
  for (var i = 0; i < devices.length; i++) {
    var d = devices[i]
    if (d && d.serial) bySerial[String(d.serial).toLowerCase()] = d
  }

  var sorted = []
  for (var j = 0; j < order.length; j++) {
    var key = String(order[j] || "").toLowerCase()
    if (bySerial[key]) {
      sorted.push(bySerial[key])
      delete bySerial[key]
    }
  }

  // Append any devices not found in the saved order
  var remaining = Object.keys(bySerial)
  for (var k = 0; k < remaining.length; k++) {
    if (bySerial[remaining[k]]) sorted.push(bySerial[remaining[k]])
  }

  return sorted
}

/** Extract the current serial order from a device array (for saving to settings). */
function settingsDeviceOrder(devices) {
  if (!Array.isArray(devices)) return []
  var order = []
  for (var i = 0; i < devices.length; i++) {
    if (devices[i] && devices[i].serial) {
      order.push(String(devices[i].serial))
    }
  }
  return order
}


// ═══════════════════════════════════════════════════════════════════════════════
// PER-KEY LIGHTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Check if a device supports per-key RGB lighting control. */
function hasPerKeyLighting(device) {
  if (!device) return false
  return device.has_per_key === true && device.type === "keyboard" || device.type === "keypad"
}

/** Check if a device type is a keyboard or keypad (for per-key editor availability). */
function isKeyboardType(device) {
  if (!device) return false
  var t = String(device.type || "").toLowerCase()
  return t === "keyboard" || t === "keypad"
}

/**
 * Key label mapping: (row, col) -> display label for the per-key editor grid.
 * Based on OpenRazer daemon KEY_MAPPING for standard full-size / TKL keyboards.
 * Lazy-initialized on first call for performance.
 */
var _keyMap = null
function keyLabel(row, col) {
  if (_keyMap === null) {
    _keyMap = {}
    var m = {
      "0,1": "Esc", "0,3": "F1", "0,4": "F2", "0,5": "F3", "0,6": "F4",
      "0,7": "F5", "0,8": "F6", "0,9": "F7", "0,10": "F8",
      "0,11": "F9", "0,12": "F10", "0,13": "F11", "0,14": "F12",
      "0,15": "Prt", "0,16": "Slk", "0,17": "Pau",
      "1,0": "M1", "1,1": "`", "1,2": "1", "1,3": "2", "1,4": "3",
      "1,5": "4", "1,6": "5", "1,7": "6", "1,8": "7", "1,9": "8",
      "1,10": "9", "1,11": "0", "1,12": "-", "1,13": "=",
      "1,14": "Bksp", "1,15": "Ins", "1,16": "Hm", "1,17": "PUp",
      "2,0": "M2", "2,1": "Tab", "2,2": "Q", "2,3": "W", "2,4": "E",
      "2,5": "R", "2,6": "T", "2,7": "Y", "2,8": "U", "2,9": "I",
      "2,10": "O", "2,11": "P", "2,12": "[", "2,13": "]",
      "2,15": "Del", "2,16": "End", "2,17": "PDn",
      "3,0": "M3", "3,1": "Caps", "3,2": "A", "3,3": "S", "3,4": "D",
      "3,5": "F", "3,6": "G", "3,7": "H", "3,8": "J", "3,9": "K",
      "3,10": "L", "3,11": ";", "3,12": "'", "3,13": "#",
      "3,14": "Ret",
      "4,0": "M4", "4,1": "Sft", "4,2": "\\", "4,3": "Z", "4,4": "X",
      "4,5": "C", "4,6": "V", "4,7": "B", "4,8": "N", "4,9": "M",
      "4,10": ",", "4,11": ".", "4,12": "/",
      "4,14": "RSft", "4,16": "\u2191",
      "5,0": "M5", "5,1": "Ctrl", "5,2": "Super", "5,3": "LAlt",
      "5,7": "Space",
      "5,11": "RAlt", "5,12": "Fn", "5,13": "Menu", "5,14": "RCtrl",
      "5,15": "\u2190", "5,16": "\u2193", "5,17": "\u2192"
    }
    for (var k in m) {
      if (m.hasOwnProperty(k)) _keyMap[k] = m[k]
    }
  }
  return _keyMap[row + "," + col] || ""
}


// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a serial -> name map from a device array.
 * Used as a snapshot to detect connect/disconnect changes between polls.
 */
function buildDeviceMap(devices) {
  var map = {}
  if (!devices) return map
  for (var i = 0; i < devices.length; i++) {
    var d = devices[i]
    if (d.serial) map[d.serial] = d.name
  }
  return map
}

/**
 * Compare a previous device map snapshot against current devices.
 * Returns an array of change events: { type, name, message }
 * where type is "connected" or "disconnected".
 */
function detectDeviceChanges(prevMap, devices) {
  var changes = []
  if (!prevMap || !devices) return changes
  var currentSerials = {}
  for (var i = 0; i < devices.length; i++) {
    var d = devices[i]
    if (d.serial) currentSerials[d.serial] = d
    if (d.serial && !prevMap[d.serial]) {
      var typeName = d.type.charAt(0).toUpperCase() + d.type.slice(1)
      changes.push({ type: "connected", name: d.name, message: typeName + " connected" })
    }
  }
  var prevSerials = Object.keys(prevMap)
  for (var j = 0; j < prevSerials.length; j++) {
    if (!currentSerials[prevSerials[j]])
      changes.push({ type: "disconnected", name: prevMap[prevSerials[j]], message: "Device disconnected" })
  }
  return changes
}


// ═══════════════════════════════════════════════════════════════════════════════
// NODE.JS COMPATIBILITY (for test suite)
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== "undefined") {
  module.exports = {
    parseData: parseData,
    deviceTypeIcon: deviceTypeIcon,
    batteryIcon: batteryIcon,
    batteryColor: batteryColor,
    batteryBadgeText: batteryBadgeText,
    formatBarText: formatBarText,
    firstBatteryDevice: firstBatteryDevice,
    barDisplayModeShortLabel: barDisplayModeShortLabel,
    nextBarDisplayMode: nextBarDisplayMode,
    formatDeviceType: formatDeviceType,
    formatDpi: formatDpi,
    defaultDpiPresets: defaultDpiPresets,
    sanitizeDpi: sanitizeDpi,
    sortDpiPresets: sortDpiPresets,
    isDpiPresetSelected: isDpiPresetSelected,
    defaultDpiProfiles: defaultDpiProfiles,
    formatPollRate: formatPollRate,
    supportedPollRates: supportedPollRates,
    formatDaemonVersion: formatDaemonVersion,
    hasBrightnessSupport: hasBrightnessSupport,
    averageBrightness: averageBrightness,
    formatBrightness: formatBrightness,
    getPollInterval: getPollInterval,
    getIdlePollInterval: getIdlePollInterval,
    effectivePollInterval: effectivePollInterval,
    summaryText: summaryText,
    paletteColors: paletteColors,
    primaryColor: primaryColor,
    secondaryColor: secondaryColor,
    speedLevels: speedLevels,
    formatSpeed: formatSpeed,
    effectDisplayName: effectDisplayName,
    effectIcon: effectIcon,
    needsColor: needsColor,
    needsSecondaryColor: needsSecondaryColor,
    needsDirection: needsDirection,
    needsSpeed: needsSpeed,
    isBreathingEffect: isBreathingEffect,
    isRippleEffect: isRippleEffect,
    isStarlightEffect: isStarlightEffect,
    defaultEffectsForType: defaultEffectsForType,
    availableEffects: availableEffects,
    hasEffect: hasEffect,
    sanitizeEffectsList: sanitizeEffectsList,
    effectCategory: effectCategory,
    categoryDisplayName: categoryDisplayName,
    categoryIcon: categoryIcon,
    isEffectSelected: isEffectSelected,
    categorizedEffects: categorizedEffects,
    hasCustomizationOptions: hasCustomizationOptions,
    deviceOrderFromSettings: deviceOrderFromSettings,
    applyDeviceOrder: applyDeviceOrder,
    settingsDeviceOrder: settingsDeviceOrder,
    hasPerKeyLighting: hasPerKeyLighting,
    isKeyboardType: isKeyboardType,
    keyLabel: keyLabel,
    buildDeviceMap: buildDeviceMap,
    detectDeviceChanges: detectDeviceChanges
  }
}
