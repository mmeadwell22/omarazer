# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OmaRazer is a third-party **Omarchy shell plugin** (`kind: bar-widget`, id `asdfsnlr.omarazer`) that
manages Razer peripherals through the OpenRazer daemon. It is a personal fork of
`asdfsnlr/omarazer` (remote: `mmeadwell22/omarazer`) and deliberately diverges from upstream —
see the "Updates" section of `README.md` before assuming a difference is a bug.

The plugin runs *inside* the long-running `omarchy-shell` Quickshell process, so its QML is
unsandboxed code in that process. A QML error can break the whole bar.

## This checkout is the live plugin

`~/.config/omarchy/plugins/asdfsnlr.omarazer` is a **symlink to this checkout**, so the shell loads
these files directly. There is no second clone and no deploy step — an edit here is live.

The one consequence: **hot reload does not fire for edits made here.** The shell watches plugins
with `inotifywait -m -r ~/.config/omarchy/plugins`, and `-r` does not descend into a symlinked
directory. After changing QML, apply it manually:

```bash
omarchy-shell shell rescanPlugins
```

To get watch-on-save back during an iteration session, run this in a spare terminal:

```bash
inotifywait -m -r -q -e close_write --exclude '/\.git/' ~/Projects/omarazer |
  while read -r _; do omarchy-shell shell rescanPlugins; done
```

Python changes need no reload at all — each action spawns a fresh `python3` process.

`omarchy plugin remove asdfsnlr.omarazer` detects the symlink and offers to *unlink* it, leaving
this repo intact. To restore the link if it is ever lost:

```bash
ln -s ~/Projects/omarazer ~/.config/omarchy/plugins/asdfsnlr.omarazer && omarchy-shell shell rescanPlugins
```

Never edit `/usr/share/omarchy/shell/` — it is package-owned and overwritten on update.
Reading it is the best reference for the plugin API (`Ui/Panel.qml`, `Ui/WidgetButton.qml`,
`README.md`, `plugins/bar/README.md`).

## Commands

```bash
node tests/test_model.js                 # Model.js unit tests (assert-based, no framework)
python3 -m unittest discover tests       # Python unit tests — MUST run from the repo root
python3 -m unittest tests.test_razer_devices.TestRazerDevices.test_parse_color   # single test
omarchy plugin validate .                # validate manifest.json against the Omarchy schema (silent = OK)
python3 scripts/razer_devices.py --summary   # exercise the backend against real hardware
```

`qmllint` is not installed on this machine; the practical QML check is loading the plugin in the
shell and watching for errors. Inspect shell state / logs with:

```bash
omarchy-shell shell listPlugins
journalctl --user -u openrazer-daemon -n 50
systemctl --user restart openrazer-daemon
```

Tests are hermetic: `TestRazerDevices.setUp` points `OMARAZER_CONFIG_DIR` at a temp directory, so
`profiles.py` never touches the real `~/.config/omarazer/`. Anything new that persists state must go
through `profiles.get_config_dir()` to inherit that isolation.

## Architecture

Three layers, with a process boundary in the middle:

```
Panel.qml + ui/*.qml   (QML, runs in omarchy-shell)
        │  Quickshell Process → python3 scripts/razer_devices.py …
        ▼
scripts/*.py           (CLI, JSON on stdout)
        ▼
OpenRazer daemon (DBus) → hardware
```

**Every hardware interaction is a one-shot subprocess.** There is no persistent Python process.
QML builds an argv array with `["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), …]`
and assigns it to a `Process`. Follow that pattern for new actions; `ui/*.qml` components use
`"../scripts/razer_devices.py"`. `pathFromUrl` exists because `Process.command` needs a filesystem
path, not a `file://` URL.

### Panel.qml — state owner

`Panel.qml` extends the shell's `qs.Ui` `Panel` and owns *all* mutable state. The child components in
`ui/` are presentational: they receive values and call back into `root` functions. Key conventions:

- State lives in `property var` **maps keyed by device serial** (`deviceDpi`, `deviceDpiPresets`,
  `deviceEffects`, `expandedSerials`, `deviceStageCapable`, …). QML does not track mutation of an
  existing object, so always **clone-and-reassign** (`var m = Object.assign({}, root.deviceDpi); …;
  root.deviceDpi = m`) rather than mutating in place.
- `dataVersion` is bumped on every daemon update to force bindings that read those maps to
  re-evaluate.
- Actions are **optimistic**: the setter mutates the local device list for instant feedback, then
  `actionProc.onExited` calls `refresh()` to reconcile with the daemon.
- **Polling is panel-aware.** `pollTimer.interval` binds to `Model.effectivePollInterval(settings, opened)`:
  `pollIntervalSec` (30s) while open, `idlePollIntervalSec` (300s) while closed, and never idler-faster
  than active. Measured cost of one poll: ~365ms, of which only three attribute reads actually touch
  hardware (`battery_level`, `is_charging`, `dpi`, ~60ms each) — everything else is daemon-cached.
  Verified 2026-09-04: polling does **not** wake a sleeping mouse (32 reads at 10s intervals all
  returned the sleep sentinel), so poll frequency is a CPU concern, not a battery one.
- Named `Process` instances at the bottom of the file each own one job (`razerProc` status poll,
  `actionProc` fire-and-forget commands, `presetLoadProc`/`presetSaveProc`, `notifyProc`,
  `barModeProc`). Reusing `actionProc` for a new command is the norm.
- The two editors (`ui/PerKeyEditor.qml`, `ui/DpiEditor.qml`) are standalone centered windows with
  their own `Process` set and their own profile CRUD — they talk to the CLI directly.

### Model.js — pure logic, dual-runtime

`Model.js` holds every pure helper (parsing, formatting, effect capability/categorization, color
palette, key labels, device-change detection). It is imported by QML as `import "Model.js" as Model`
and by the Node tests via a `typeof module !== "undefined"` guard at the bottom.

Constraints that keep both runtimes working:

- **Keep it one file.** It was split into modules once and flattened back, because QML's `import`
  of a JS file does not support a module graph.
- Any new exported function must be added to the `module.exports` block or the Node tests cannot
  see it.
- Stick to the conservative JS the QML engine accepts (`var`, `function`, no ES module syntax).

### scripts/ — Python backend

`razer_devices.py` is a thin argparse wrapper (it inserts the plugin root on `sys.path` so
`from scripts.x import y` works when invoked by path). Logic lives in:

| Module | Responsibility | Needs OpenRazer |
|---|---|---|
| `helpers.py` | pure parsing/classification (`parse_color`, `classify_device_type`, `normalize_effect_name`) | no |
| `devices.py` | device discovery, `get_razer_status()` → the JSON the panel consumes | yes |
| `effects.py` | brightness, poll rate, effects, DPI, DPI stages | yes |
| `perkey.py` | LED matrix dimensions and per-key writes | yes |
| `profiles.py` | JSON stores under `~/.config/omarazer/` (lighting profiles, DPI profiles, device presets, battery cache) | no |

Only `helpers.py` and `profiles.py` are unit-testable without hardware — put new pure logic there.
`get_razer_status()` is the contract between the two languages: adding a field there is what makes
it available to `Model.parseData` and the QML bindings.

### Sentinel readings (the subtle part, #1)

OpenRazer does **not** raise when a device is asleep or unreachable — it returns sentinel values:
`battery_level: 0`, `dpi: [0, 0]`, `firmware_version: "v0.0"`, empty effect lists. A wireless device
that is genuinely at 0% cannot report at all, so `0` always means "no reading".

`helpers.normalize_battery_level()` maps that to `None`; `get_device_info()` then falls back to the
last known level from `profiles.load_battery_level()` and flags the result `battery_stale: true`.
Live readings refresh the cache. **Charging state is never cached** — a stale "Charging" badge after
the cable comes out is worse than briefly missing one.

The cache is keyed by device **name**, not serial. OpenRazer synthesises a serial
(`UNKNOWN_<vid><pid>_0000`) when a device is asleep at daemon start, so a serial-keyed store
fragments on exactly the case being fixed. The existing `device_presets.json` has this bug.

### DPI stages (the subtle part, #2)

Mice with on-board memory are the **source of truth for their own presets**: when
`has_dpi_stages` is set and `hardware_dpi_stages` is non-empty, the firmware list overwrites
`deviceDpiPresets`, and `setDpi` commits presets + active stage together via `--apply-dpi-preset`
so the selection survives a reboot. Mice without stage support fall back to the on-disk store
(`--get-device-presets` / `--save-device-presets`). A wireless mouse often reports the capability
before the stage list is readable, hence the `stageRetryTimer` / `stageReadRetries` fast-retry path
in `updateData`.

## Settings

Settings are declared in `manifest.json` under `barWidget.schema` (with `barWidget.defaults`), read
in QML off the host-injected `settings` object, and persisted per-widget in
`~/.config/omarchy/shell.json`. Adding a setting means touching all three: schema entry, default,
and a `readonly property` on `root` that falls back sensibly when `settings` is undefined.

Writing a setting from inside the plugin shells out to the bar CLI — see `cycleBarDisplayMode()`,
which hardcodes the plugin id (`omarchy-bar set asdfsnlr.omarazer …`). Renaming the plugin id means
updating `manifest.json`, that call, and the installed directory name.

## Conventions

- QML/JS uses `var`, JSDoc-style `/** */` on properties and functions, and `// ── Section ──`
  banner comments; Python is typed (`from __future__ import annotations`) with module docstrings.
- Commits follow Conventional Commits (`feat(dpi):`, `refactor(ui):`, `fix(dpi):`) for recent work.
- User-visible changes get an entry in the README "Updates" section and a `version` bump in
  `manifest.json`.
