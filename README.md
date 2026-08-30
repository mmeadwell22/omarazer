# OmaRazer - OpenRazer Devices Plugin for Omarchy

An Omarchy shell bar widget and panel plugin that connects to the OpenRazer daemon to monitor and manage connected Razer peripherals (keyboards, mice, mousemats, headsets, and accessories).

> **Disclaimer:** *This project is an unofficial community plugin for Omarchy. 
> It is not developed by, endorsed by, affiliated with, or in any way officially connected to [Razer Inc.](https://razer.com) 
> or the [OpenRazer project](https://openrazer.github.io/).*

> **This is a personal fork** of [asdfsnlr/omarazer](https://github.com/asdfsnlr/omarazer), maintained independently for my own Omarchy setup. It is not a pull request against, and is not synced with, the upstream repo. It currently diverges from upstream by:
> - Rolling back a broken upstream commit that referenced a `ColorPicker` QML component whose file was never committed, which made the widget fail to load entirely (filed upstream as [asdfsnlr/omarazer#1](https://github.com/asdfsnlr/omarazer/issues/1) — see Updates below).
> - Adding a `barDisplayMode` setting (Device count / Battery level / Icon only) for the bar widget.
<p align="center">
  <img src="preview.png" alt="OmaRazer Preview" />
</p>

## Benefits

- **At-a-Glance Status in Your Bar**: Instantly see connected device counts and battery states right from the Omarchy status bar without cluttering your workspace.
- **Native & Lightweight Performance**: Fast, native QML interface powered by Quickshell — no bloated background web runtimes or heavy Electron applications required.
- **Instant Lighting & Profile Switching**: Adjust RGB lighting effects, colors, brightness, animation speeds, and global presets in seconds with immediate hardware response.
- **Mouse DPI Step Presets & Profiles**: Instant 1-click DPI step switching right from device cards, plus a dedicated preset editor with live sensitivity sliders, custom step management, and saveable DPI profiles.
- **Per-Key LED Matrix Editor**: Full-screen keyboard editor with paint modes, color palette, used-color tracking, and key labels — paint individual keys, fill entire rows, or fill all at once.
- **Saveable Profiles (Lighting & DPI)**: Create, load, and delete named per-key lighting profiles and mouse DPI profiles; auto-load on selection with intuitive inline creation workflow.
- **Wireless Battery Awareness**: Color-coded battery level indicators and charging status prevent your wireless mice and headsets from running out of power mid-game or mid-work.
- **Keyboard-First Ergonomics**: Designed for tiling window manager workflows with full keyboard navigation, quick shortcuts (`Esc` to close, `r` to refresh), and mouse controls.
- **Self-Healing & Diagnostic Tools**: Live daemon connectivity checks with one-click restart actions if the OpenRazer background service is stopped.
- **Scriptable CLI Automation**: Includes a standalone Python CLI tool for automating lighting profiles, DPI steps, polling rates, and brightness via scripts or custom keybindings.

## Features

- **Device Discovery & Status**: Automatically detects all connected Razer devices via the OpenRazer daemon.
- **Hardware Telemetry**: Displays device names, device types, serial numbers, and firmware versions.
- **Battery Monitoring**: Live battery percentage and charging state indicators with color-coded levels for wireless devices.
- **Mouse DPI Sensitivity & Profile Management**:
  - **Quick-Switch Step Buttons**: Direct 1-click DPI switching on mouse cards (`800`, `1200`, `1800`, `2400`, `3200`, etc.) with instant active step visual highlighting.
  - **Dedicated DPI Preset Editor**: Full-screen overlay window with live sensitivity slider (100 to device `max_dpi`), fine-tuning nudge buttons (`-500`, `-100`, `+100`, `+500`), and live readout.
  - **Custom Step Management**: Add custom DPI steps via numeric input or remove individual steps with `×` chips.
  - **DPI Profile System**: Save, load, and delete named DPI profiles (*Default*, *FPS*, *Gaming*, *Office*) stored in `~/.config/omarazer/dpi_profiles/`.
  - **Quick Preset Templates**: One-click application of curated preset templates (e.g. *FPS (800, 1200, 3000)*, *Gaming (400-3200)*, *Office*).
  - **Hardware On-Board Memory Stages**: Driver-level support for programming hardware on-board memory stages (`set_dpi_stages`) on compatible devices.
- **Lighting Effect Configurations**:
  - **Categorized Per-Device Effect Organization**: Grouped into logical categories (**Presets**, **Dynamic**, and **Interactive**) displaying only the lighting effects supported by each peripheral.
  - **13 Supported Effects**: Off, Static, Spectrum, Wave, Breathing (Single/Random/Dual), Reactive, Ripple (Single/Random), Starlight (Random/Single/Dual).
  - **Per-Effect Settings Card**: Dedicated settings card for the active effect with context-aware parameter controls:
    - Primary RGB color palette swatches with active selection indicator.
    - Secondary RGB color palette swatches for dual-color effects (Dual Starlight).
    - Wave direction selector (Left / Right).
    - Speed selector (Fast / Normal / Slow / Very Slow) for Reactive, Ripple, and Starlight effects.
    - Sub-mode switchers for Breathing (Single / Random), Ripple (Single / Random), and Starlight (Random / Single / Dual).
  - **Interactive Effect Toggles**: Collapsible per-device effect cards toggled by clicking the active effect badge.
  - **Global Quick Presets**: Quick lighting presets for all devices simultaneously (Spectrum, Wave, Razer Green, Off).
- **Per-Key Lighting Editor** (keyboards and keypads):
  - Full-screen overlay with scrollable LED matrix grid and key labels (Esc, F1–F12, alphanumeric, modifiers, etc.).
  - Two paint modes: **Paint** (single key) and **Fill Row** (entire row on click).
  - Click-and-drag painting across multiple cells.
  - 10-color palette with current color indicator and used-color tracking row.
  - **Fill All** / **Clear** / **Recolor All** global actions.
  - Matrix dimensions and painted key count in the status bar.
  - Apply to device button with unsaved-changes indicator.
- **Profile System** (per-key editor):
  - Save / Load / Delete named lighting profiles.
  - Styled dropdown with auto-load on selection.
  - Inline profile creation with **New** → name input → **Save** workflow.
  - Overwrite existing profiles with **Save** button.
  - Profiles stored in `~/.config/omarazer/profiles/`.
- **DPI & Polling Rate**: Displays active mouse DPI configuration and polling rate (Hz).
- **Brightness Control**: Inline brightness sliders for devices with lighting support.
- **Bar Widget**: Shows Razer status icon and connected device count on the Omarchy status bar with hover tooltip summaries.
- **Keyboard Navigation & Shortcuts**: Supports full keyboard navigation, `Esc` to close, and `r` to refresh.
- **Daemon Diagnostics**: Clear error reporting and one-click daemon restart if the daemon is offline.

## Requirements & External Dependencies

- **Omarchy Linux** (Quattro shell with plugin support)
- **OpenRazer Daemon & Python Client**:
  - `openrazer-daemon`
  - `python-openrazer`
- Ensure your user is in the `openrazer` group and the daemon service is running:
  ```bash
  sudo gpasswd -a "$USER" openrazer
  systemctl --user enable --now openrazer-daemon
  ```


## Installation

Add and enable the plugin directly in Omarchy:

```bash
omarchy plugin add https://github.com/asdfsnlr/omarazer.git --enable
```

Or install and enable locally for development:

```bash
mkdir -p ~/.config/omarchy/plugins
cp -r "$PWD" ~/.config/omarchy/plugins/asdfsnlr.omarazer
omarchy plugin enable asdfsnlr.omarazer --section right
```

## Removal

To disable or remove the plugin from Omarchy:

```bash
# Disable without uninstalling
omarchy plugin disable asdfsnlr.omarazer

# Remove the plugin
omarchy plugin remove asdfsnlr.omarazer
```

Or remove manually if installed locally:

```bash
omarchy plugin disable asdfsnlr.omarazer
rm -rf ~/.config/omarchy/plugins/asdfsnlr.omarazer
```

## Configuration

The widget supports configuration via Omarchy plugin settings (`manifest.json` schema) and the Omarchy bar CLI:

- `pollIntervalSec` / `refreshIntervalSec` (*integer*, default: `30`): Polling and refresh interval in seconds to refresh device status (min: `5`, max: `300`).
- `barDisplayMode` (*enum*: `Device count` | `Battery level` | `Icon only`, default: `Device count`): What to show next to the icon in the bar. `Battery level` shows the charge percentage of the first connected device that reports a battery.

### Changing the Refresh Interval

You can configure how frequently OmaRazer refreshes device status using any of the following methods:

#### 1. Using the Omarchy Bar CLI

Use `omarchy bar set` to dynamically update the refresh interval (e.g., to 15 seconds):

```bash
# Set refresh interval using pollIntervalSec
omarchy bar set asdfsnlr.omarazer pollIntervalSec 15

# Or using the refreshIntervalSec alias
omarchy bar set asdfsnlr.omarazer refreshIntervalSec 15
```

#### 2. Editing `~/.config/omarchy/shell.json`

Add `pollIntervalSec` (or `refreshIntervalSec`) directly to your OmaRazer bar layout entry in `~/.config/omarchy/shell.json`:

```json
{
  "bar": {
    "layout": {
      "right": [
        {
          "id": "asdfsnlr.omarazer",
          "pollIntervalSec": 15,
          "barDisplayMode": "Battery level"
        }
      ]
    }
  }
}
```

#### 3. Manual On-Demand Refresh

To trigger an immediate refresh without waiting for the next polling interval:
- **Bar Widget**: Middle-click the OmaRazer bar icon.
- **Panel Shortcut**: Press <kbd>r</kbd> or <kbd>R</kbd> while the OmaRazer panel is focused.
- **Panel Header**: Click the refresh button (**󰑐**) in the panel header.

## CLI Usage

The plugin includes a standalone Python CLI scanner and management script (`scripts/razer_devices.py` or `main.py`):

```bash
# Print JSON output
python3 scripts/razer_devices.py

# Print human-readable terminal summary
python3 scripts/razer_devices.py --summary

# Set lighting effects (device serial or 'all')
python3 scripts/razer_devices.py --set-effect <serial|all> static "#00ff00"
python3 scripts/razer_devices.py --set-effect <serial|all> spectrum
python3 scripts/razer_devices.py --set-effect <serial|all> wave 1
python3 scripts/razer_devices.py --set-effect <serial|all> breath "#8000ff"
python3 scripts/razer_devices.py --set-effect <serial|all> none

# Set brightness for a specific device or all devices (0-100)
python3 scripts/razer_devices.py --set-brightness <serial|all> 75

# Set polling rate (Hz) for a device
python3 scripts/razer_devices.py --set-poll-rate <serial> 1000

# Set mouse DPI sensitivity (single value or independent X/Y)
python3 scripts/razer_devices.py --set-dpi <serial> 1800
python3 scripts/razer_devices.py --set-dpi <serial> 1200 1600

# Set hardware DPI stages on mouse on-board memory (active_stage + stages list)
python3 scripts/razer_devices.py --set-dpi-stages <serial> 1 800 1200 1800 2400 3200

# Get per-key LED matrix dimensions (rows, cols)
python3 scripts/razer_devices.py --get-matrix-dims <serial>

# Set a single key color in the LED matrix (0-indexed row/col, RGB 0-255)
python3 scripts/razer_devices.py --set-per-key <serial> 0 0 255 0 0

# Set multiple key colors in one batch (JSON array of [row, col, r, g, b])
python3 scripts/razer_devices.py --set-per-key-batch <serial> '[[0,0,255,0,0],[0,1,0,255,0]]'

# Per-key lighting profile management
python3 scripts/razer_devices.py --list-profiles
python3 scripts/razer_devices.py --save-profile "My Profile" '{"name":"My Profile","rows":6,"cols":22,"colors":[...]}'
python3 scripts/razer_devices.py --load-profile "My Profile"
python3 scripts/razer_devices.py --delete-profile "My Profile"

# Mouse DPI profile management
python3 scripts/razer_devices.py --list-dpi-profiles
python3 scripts/razer_devices.py --save-dpi-profile "FPS Pro" '{"name":"FPS Pro","presets":[800,1200,3000],"dpi":1200}'
python3 scripts/razer_devices.py --load-dpi-profile "FPS Pro"
python3 scripts/razer_devices.py --delete-dpi-profile "FPS Pro"
```

## Profile Storage

Profiles are stored as individual JSON files under `~/.config/omarazer/`:

### 1. Per-Key Lighting Profiles (`~/.config/omarazer/profiles/`)
Named `<profile-name>.json` (with unsafe characters sanitized).

```json
{
  "name": "My Profile",
  "rows": 6,
  "cols": 22,
  "colors": [
    "#00ff00", "#00ff00", "#000000", "#ff0000",
    "#000000", "#000000", "#000000", "#000000",
    "... one hex color per LED, row-major order ..."
  ]
}
```

- `rows` / `cols` — the LED matrix dimensions at time of save.
- `colors` — flat array of hex color strings (`#RRGGBB`), one per LED, in row-major order (total length = `rows × cols`).
- Loading a profile validates that the stored dimensions match the device's current matrix before applying.

### 2. Mouse DPI Profiles (`~/.config/omarazer/dpi_profiles/`)
Named `<profile-name>.json` (with unsafe characters sanitized).

```json
{
  "name": "FPS Pro",
  "presets": [800, 1200, 3000],
  "dpi": 1200
}
```

- `presets` — numerically sorted array of DPI step values configured for quick-switching.
- `dpi` — default or active sensitivity in DPI associated with the profile.
- Built-in defaults (*Default*, *FPS*, *Gaming*, *Office*) are seeded automatically.

## Running Tests

Run the test suites and validations:

```bash
# Run Python unit tests
python3 -m unittest discover tests

# Run JavaScript Model tests
node tests/test_model.js

# Validate manifest schema
omarchy plugin validate .

# Lint QML syntax
qmllint -I /usr/share/omarchy/shell ./Panel.qml
```

## Updates

### August 30, 2026 (v1.6.0) — fork
- **Rolled back upstream's broken `ColorPicker` commit**: upstream `main` referenced a `ColorPicker` QML component whose file was never committed, which made the entire bar widget fail to load. Reverted to the last working commit (`0509d18`) and filed [asdfsnlr/omarazer#1](https://github.com/asdfsnlr/omarazer/issues/1) upstream.
- **Bar Display Mode**: Added a `barDisplayMode` setting (`Device count` / `Battery level` / `Icon only`) so the bar text can show the first battery-powered device's charge percentage instead of the connected device count — useful when you only have one device (e.g. just a mouse). Configurable via `omarchy bar set asdfsnlr.omarazer barDisplayMode "<value>"`, `shell.json`, or a new cycle button in the panel header (labeled *Count* / *Battery* / *Icon*, next to Refresh and Notifications).

### August 29, 2026 (v1.5.0)
- **Text-First Interface Redesign**: Streamlined and modernized the user interface by removing non-essential icon glyphs across panel headers, cards, sliders, metric indicators, quick effect controls, action buttons, and modal overlays.
- **Selective Icon Retention**: Preserved icons exclusively for collapsible / dropdown panel indicators (chevron up/down `󰅃` / `󰅀`), the panel header **Refresh** button (`󰑐`), and the **Notification toggle** button (`󰂜` / `󰂛`).
- **Telemetry & Badge Modernization**: Replaced icon-heavy battery and charging glyphs with clean, readable text badges (e.g. `85% (Charging)`).

### August 25, 2026 (v1.4.0)
- **Mouse DPI Quick-Switch Presets**: Direct 1-click DPI step buttons on mouse device cards with reactive active-step accent styling.
- **Dedicated DPI Preset & Profile Editor Window (`DpiEditor.qml`)**: Full modal overlay featuring live sensitivity sliders (100–max DPI), nudge adjustment buttons, custom step addition/removal, and quick templates (*Default*, *FPS*, *Gaming*, *Office*).
- **DPI Profile Management**: Save, load, and delete named DPI profiles in `~/.config/omarazer/dpi_profiles/`.
- **Hardware DPI Stages Backend**: Added driver-level support for programming on-board memory stages (`set_dpi_stages` / `--set-dpi-stages`) on compatible OpenRazer mice.
- **UI State Reactivity**: Added instant local tracking of active DPI across the panel for zero-latency visual feedback on selection.

### August 18, 2026 (v1.3.0)
- Model.js split into 9 sub-modules, then flattened back to single file for QML `import` compatibility
- Panel.qml refactored from ~1500 lines to ~430 lines by extracting 6 components into `ui/` directory: PanelHeader, GlobalControls, ErrorState, EmptyState, DeviceCard, EffectOptions
- Fixed QML directory import issues (`import "ui"` + bare type names, missing `import qs.Ui`)
- Expanded color palette from 10 to 51 colors across 4 tiers: Neutrals, Saturated Spectrum, Pastels, Dark Tones
- Added descriptive comments throughout Panel.qml and Model.js (JSDoc, section headers, property docs)

### August 17, 2026
- Implemented per-key lighting profile system (save / load / delete)
- Profiles section relocated to top of per-key editor (after header, before color palette)
- Profiles row redesigned with Dropdown + New + Save + Delete + Cancel layout
- Added spacing between controls and matrix grid; centered matrix horizontally
- Python backend split into 5 modules: `helpers.py`, `devices.py`, `effects.py`, `perkey.py`, `profiles.py` with `razer_devices.py` as thin CLI wrapper
- Fixed Python module imports with `sys.path.insert` in `razer_devices.py`
- Device connect/disconnect desktop notifications with freedesktop icon names
- Notification toggle button added to panel header

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
