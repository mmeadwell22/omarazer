const assert = require("assert");
const Model = require("../Model.js");

// Test parseData
const rawJson = JSON.stringify({
  daemon_running: true,
  version: "3.6.0",
  device_count: 2,
  devices: [
    { name: "Razer BlackWidow", type: "keyboard", serial: "123", current_effect: "wave" },
    { name: "Razer DeathAdder", type: "mouse", serial: "456", current_effect: "static", primary_color: "#00ff00" }
  ]
});

const parsed = Model.parseData(rawJson);
assert.strictEqual(parsed.daemon_running, true);
assert.strictEqual(parsed.device_count, 2);
assert.strictEqual(parsed.devices.length, 2);

// Test formatBarText with new device bar icon
assert.strictEqual(Model.formatBarText(parsed, "Device count"), "󰾰 2");
assert.strictEqual(Model.formatBarText(parsed, "Icon only"), "󰾰");
assert.strictEqual(Model.formatBarText({ daemon_running: false }, "Device count"), "󰾰 !");

// Legacy boolean mode is still accepted for backward compatibility
assert.strictEqual(Model.formatBarText(parsed, true), "󰾰 2");
assert.strictEqual(Model.formatBarText(parsed, false), "󰾰");

// Test formatBarText battery mode
const withBattery = Model.parseData(JSON.stringify({
  daemon_running: true,
  device_count: 1,
  devices: [
    { name: "Razer Viper V3 Pro", type: "mouse", serial: "789", has_battery: true, battery_level: 84, is_charging: false }
  ]
}));
assert.strictEqual(Model.formatBarText(withBattery, "Battery level"), "󰾰 84%");
assert.strictEqual(Model.formatBarText(parsed, "Battery level"), "󰾰 --"); // no device reports battery

// Test firstBatteryDevice
assert.strictEqual(Model.firstBatteryDevice(withBattery).serial, "789");
assert.strictEqual(Model.firstBatteryDevice(parsed), null);

// Test deviceTypeIcon
assert.strictEqual(Model.deviceTypeIcon("keyboard"), "󰌌");
assert.strictEqual(Model.deviceTypeIcon("mouse"), "󰍽");
assert.strictEqual(Model.deviceTypeIcon("keypad"), "󰦤");
assert.strictEqual(Model.deviceTypeIcon("speaker"), "󰓃");
assert.strictEqual(Model.deviceTypeIcon("headset"), "󰋋");
assert.strictEqual(Model.deviceTypeIcon("mousemat"), "󰆥");
assert.strictEqual(Model.deviceTypeIcon("accessory"), "󰒋");
assert.strictEqual(Model.deviceTypeIcon({ type: "audio", name: "Razer Nommo Chroma" }), "󰓃");
assert.strictEqual(Model.deviceTypeIcon({ type: "audio", name: "Razer Kraken V3" }), "󰋋");
assert.strictEqual(Model.deviceTypeIcon({ type: "mousemat", name: "Razer Goliathus Extended Chroma" }), "󰆥");

// Test effectIcon & effectDisplayName
assert.strictEqual(Model.effectDisplayName("breath_single"), "Breathing");
assert.strictEqual(Model.effectDisplayName("spectrum"), "Spectrum");
assert.strictEqual(Model.effectIcon("static"), "󰏘");
assert.strictEqual(Model.effectIcon("wave"), "󰓅");

// Test availableEffects
const kbEffects = Model.availableEffects({ type: "keyboard", supported_effects: ["static", "wave", "breath", "spectrum"] });
assert(kbEffects.includes("wave"));
assert(kbEffects.includes("static"));

// Test categorizedEffects
const kbDevice = {
  name: "Razer BlackWidow",
  type: "keyboard",
  supported_effects: ["none", "static", "spectrum", "wave", "breath_single", "breath_random", "breath_dual", "reactive", "ripple", "ripple_random"]
};
const categories = Model.categorizedEffects(kbDevice);
assert.strictEqual(categories.length, 3);
assert.strictEqual(categories[0].id, "presets");
assert.strictEqual(categories[0].label, "Presets");
assert.deepStrictEqual(categories[0].effects, ["static", "spectrum", "none"]);
assert.strictEqual(categories[1].id, "dynamic");
assert.strictEqual(categories[1].label, "Dynamic");
assert.deepStrictEqual(categories[1].effects, ["wave", "breath_single"]);
assert.strictEqual(categories[2].id, "interactive");
assert.strictEqual(categories[2].label, "Interactive");
assert.deepStrictEqual(categories[2].effects, ["reactive", "ripple"]);

// Test isEffectSelected
assert.strictEqual(Model.isEffectSelected("breath_dual", "breath_single"), true);
assert.strictEqual(Model.isEffectSelected("breath_random", "breath_single"), true);
assert.strictEqual(Model.isEffectSelected("ripple_random", "ripple"), true);
assert.strictEqual(Model.isEffectSelected("wave", "wave"), true);
assert.strictEqual(Model.isEffectSelected("static", "wave"), false);

// Test hasCustomizationOptions
assert.strictEqual(Model.hasCustomizationOptions({ current_effect: "static" }), true);
assert.strictEqual(Model.hasCustomizationOptions({ current_effect: "wave" }), true);
assert.strictEqual(Model.hasCustomizationOptions({ current_effect: "breath_random" }), true);
assert.strictEqual(Model.hasCustomizationOptions({ current_effect: "reactive" }), true);
assert.strictEqual(Model.hasCustomizationOptions({ current_effect: "starlight_random" }), true);
assert.strictEqual(Model.hasCustomizationOptions({ current_effect: "ripple" }), true);
assert.strictEqual(Model.hasCustomizationOptions({ current_effect: "spectrum", supported_effects: ["spectrum"] }), false);

// Test needsSpeed, speedLevels, formatSpeed, isStarlightEffect
assert.strictEqual(Model.needsSpeed("reactive"), true);
assert.strictEqual(Model.needsSpeed("starlight_random"), true);
assert.strictEqual(Model.needsSpeed("starlight_single"), true);
assert.strictEqual(Model.needsSpeed("starlight_dual"), true);
assert.strictEqual(Model.needsSpeed("ripple"), true);
assert.strictEqual(Model.needsSpeed("ripple_random"), true);
assert.strictEqual(Model.needsSpeed("static"), false);
assert.strictEqual(Model.needsSpeed("wave"), false);
assert.strictEqual(Model.needsSpeed("spectrum"), false);

assert.strictEqual(Model.isStarlightEffect("starlight"), true);
assert.strictEqual(Model.isStarlightEffect("starlight_random"), true);
assert.strictEqual(Model.isStarlightEffect("starlight_single"), true);
assert.strictEqual(Model.isStarlightEffect("reactive"), false);

const reactiveLevels = Model.speedLevels("reactive");
assert.strictEqual(reactiveLevels.length, 4);
assert.strictEqual(reactiveLevels[0].value, "1");
assert.strictEqual(reactiveLevels[0].label, "Fast");
assert.strictEqual(reactiveLevels[3].value, "4");
assert.strictEqual(reactiveLevels[3].label, "Very Slow");

const starlightLevels = Model.speedLevels("starlight_random");
assert.strictEqual(starlightLevels.length, 3);
assert.strictEqual(starlightLevels[0].value, "1");
assert.strictEqual(starlightLevels[0].label, "Fast");

assert.strictEqual(Model.formatSpeed("1"), "Fast");
assert.strictEqual(Model.formatSpeed("2"), "Normal");
assert.strictEqual(Model.formatSpeed("3"), "Slow");
assert.strictEqual(Model.formatSpeed("4"), "Very Slow");

// Test formatDaemonVersion
assert.strictEqual(Model.formatDaemonVersion("3.6.0"), "Installed OpenRazer Daemon v3.6.0");
assert.strictEqual(Model.formatDaemonVersion(""), "");
assert.strictEqual(Model.formatDaemonVersion(null), "");

// Test hasBrightnessSupport and averageBrightness
assert.strictEqual(Model.hasBrightnessSupport([{ has_brightness: true, brightness: 80 }]), true);
assert.strictEqual(Model.hasBrightnessSupport([{ has_brightness: false }]), false);
assert.strictEqual(Model.hasBrightnessSupport([]), false);
assert.strictEqual(Model.averageBrightness([{ has_brightness: true, brightness: 80 }, { has_brightness: true, brightness: 40 }]), 60);
assert.strictEqual(Model.averageBrightness([{ has_brightness: true, brightness: 0 }]), 0);
assert.strictEqual(Model.averageBrightness([{ has_brightness: true, brightness: 50 }, { has_brightness: true, brightness: 0 }]), 25);
assert.strictEqual(Model.averageBrightness([{ has_brightness: false }]), 100);
assert.strictEqual(Model.formatBrightness(0), "0%");
assert.strictEqual(Model.formatBrightness(75), "75%");
assert.strictEqual(Model.formatBrightness(null), "");

// Test formatPollRate & supportedPollRates
assert.strictEqual(Model.formatPollRate(1000), "1000 Hz");
assert.strictEqual(Model.formatPollRate(500), "500 Hz");
assert.strictEqual(Model.formatPollRate(125), "125 Hz");
assert.strictEqual(Model.formatPollRate(null), "");
assert.deepStrictEqual(Model.supportedPollRates({ has_poll_rate: true, supported_poll_rates: [125, 500, 1000] }), [125, 500, 1000]);
assert.deepStrictEqual(Model.supportedPollRates({ type: "mouse", has_poll_rate: true, supported_poll_rates: [] }), [125, 500, 1000]);

// Test formatDpi
assert.strictEqual(Model.formatDpi(1800), "1800 DPI");
assert.strictEqual(Model.formatDpi([1800, 1800]), "1800 DPI");
assert.strictEqual(Model.formatDpi([800, 1200]), "800 x 1200 DPI");

// Test DPI presets and profiles
assert.deepStrictEqual(Model.defaultDpiPresets(), [800, 1200, 1800, 2400, 3200]);
assert.deepStrictEqual(Model.defaultDpiProfiles(), ["Default", "FPS", "Gaming", "Office"]);

assert.strictEqual(Model.sanitizeDpi(800, 16000), 800);
assert.strictEqual(Model.sanitizeDpi(50, 16000), 100);
assert.strictEqual(Model.sanitizeDpi(20000, 16000), 16000);
assert.strictEqual(Model.sanitizeDpi("1200", 16000), 1200);
assert.strictEqual(Model.sanitizeDpi([3000, 3000], 16000), 3000);

assert.deepStrictEqual(Model.sortDpiPresets([3000, 800, 1200]), [800, 1200, 3000]);
assert.deepStrictEqual(Model.sortDpiPresets([800, 800, 1200, 3000]), [800, 1200, 3000]);
assert.deepStrictEqual(Model.sortDpiPresets([], 16000), [800, 1200, 1800, 2400, 3200]);
assert.deepStrictEqual(Model.sortDpiPresets([50, 99999], 16000), [800, 1200, 1800, 2400, 3200]);

assert.strictEqual(Model.isDpiPresetSelected([800, 800], 800), true);
assert.strictEqual(Model.isDpiPresetSelected(1200, 1200), true);
assert.strictEqual(Model.isDpiPresetSelected(800, 1200), false);

// Test getPollInterval
assert.strictEqual(Model.getPollInterval(undefined), 30);
assert.strictEqual(Model.getPollInterval({}), 30);
assert.strictEqual(Model.getPollInterval({ pollIntervalSec: 15 }), 15);
assert.strictEqual(Model.getPollInterval({ refreshIntervalSec: 20 }), 20);
assert.strictEqual(Model.getPollInterval({ pollIntervalSec: "45" }), 45);
assert.strictEqual(Model.getPollInterval({ pollIntervalSec: 2 }, 30), 30);
assert.strictEqual(Model.getPollInterval({ pollIntervalSec: 5000 }, 30), 30);
assert.strictEqual(Model.getPollInterval({ pollIntervalSec: 10, refreshIntervalSec: 25 }), 10);

// Test batteryBadgeText
assert.strictEqual(Model.batteryBadgeText({ has_battery: true, battery_level: 97, is_charging: false }), "97%");
assert.strictEqual(Model.batteryBadgeText({ has_battery: true, battery_level: 97, is_charging: true }), "97% \u26a1 Charging");
assert.strictEqual(Model.batteryBadgeText({ has_battery: true, battery_level: 5, is_charging: true }), "5% \u26a1 Charging");

// A device with no usable reading and nothing cached renders no badge at all
assert.strictEqual(Model.batteryBadgeText({ has_battery: true, battery_level: null, is_charging: false }), "");
assert.strictEqual(Model.batteryBadgeText({ has_battery: false, battery_level: 97, is_charging: false }), "");
assert.strictEqual(Model.batteryBadgeText(null), "");

// Charging with no level still tells you it is charging
assert.strictEqual(Model.batteryBadgeText({ has_battery: true, battery_level: null, is_charging: true }), "\u26a1 Charging");

// A stale (cached) level renders exactly like a live one
assert.strictEqual(Model.batteryBadgeText({ has_battery: true, battery_level: 97, is_charging: false, battery_stale: true }), "97%");

// Test getIdlePollInterval — the interval used while the panel is closed
assert.strictEqual(Model.getIdlePollInterval(undefined), 300);
assert.strictEqual(Model.getIdlePollInterval({}), 300);
assert.strictEqual(Model.getIdlePollInterval({ idlePollIntervalSec: 600 }), 600);
assert.strictEqual(Model.getIdlePollInterval({ idlePollIntervalSec: "600" }), 600);
assert.strictEqual(Model.getIdlePollInterval({ idlePollIntervalSec: 1 }), 300);
assert.strictEqual(Model.getIdlePollInterval({ idlePollIntervalSec: 99999 }), 300);

// Test effectivePollInterval — open uses the live interval, closed backs off
assert.strictEqual(Model.effectivePollInterval({ pollIntervalSec: 30, idlePollIntervalSec: 300 }, true), 30);
assert.strictEqual(Model.effectivePollInterval({ pollIntervalSec: 30, idlePollIntervalSec: 300 }, false), 300);
assert.strictEqual(Model.effectivePollInterval({}, true), 30);
assert.strictEqual(Model.effectivePollInterval({}, false), 300);
assert.strictEqual(Model.effectivePollInterval(undefined, false), 300);

// A closed panel never polls more often than an open one, even if misconfigured
assert.strictEqual(Model.effectivePollInterval({ pollIntervalSec: 120, idlePollIntervalSec: 60 }, false), 120);

console.log("All Model.js tests passed!");

