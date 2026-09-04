// ──────────────────────────────────────────────────────────────────────────────
// OmaRazer — Panel.qml
// Main bar-widget panel for the OmaRazer Omarchy shell plugin.
// Connects to the OpenRazer daemon via Python CLI scripts, manages device state,
// and composes the full panel UI from extracted components in ui/.
// ──────────────────────────────────────────────────────────────────────────────

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "ui"

Panel {
  id: root
  moduleName: "omaRazer"
  ipcTarget: "omaRazer"

  // ── Core State ────────────────────────────────────────────────────────────

  /** Live data from the OpenRazer daemon (parsed JSON). */
  property var razerData: ({ daemon_running: false, version: "", device_count: 0, devices: [], error: null })

  /** Map of serial -> true for devices whose effect-options panel is expanded. */
  property var expandedSerials: ({})

  /** Map of deviceKey -> speed value ("1"-"4") for per-device speed overrides. */
  property var deviceSpeeds: ({})

  /** Global brightness slider value (applied to all devices when changed). */
  property int globalBrightness: 100

  /** Incremented on every data update to force QML bindings to re-evaluate. */
  property int dataVersion: 0

  /** True while waiting for the daemon status process to finish. */
  property bool loading: false

  // ── Per-Key Editor State ──────────────────────────────────────────────────

  /** Whether the per-key lighting editor overlay is currently visible. */
  property bool perKeyEditorOpen: false

  /** Serial of the device being edited in the per-key editor. */
  property string perKeyDeviceSerial: ""

  /** Display name of the device being edited (shown in editor header). */
  property string perKeyDeviceName: ""

  /** LED matrix dimensions for the per-key editor grid. */
  property int perKeyMatrixRows: 0
  property int perKeyMatrixCols: 0

  /** Map of serial -> true for devices that have had per-key lighting applied. */
  property var perKeyApplied: ({})

  // ── DPI Editor State ──────────────────────────────────────────────────────

  /** Whether the DPI presets editor overlay is currently visible. */
  property bool dpiEditorOpen: false

  /** Serial of the device being edited in the DPI editor. */
  property string dpiDeviceSerial: ""

  /** Display name of the device being edited (shown in DPI editor header). */
  property string dpiDeviceName: ""

  /** Current DPI of the device being edited. */
  property int dpiDeviceCurrent: 800

  /** Max DPI of the device being edited. */
  property int dpiDeviceMax: 16000

  /** Map of serial -> array of DPI preset steps (e.g. [800, 1200, 3000]). */
  property var deviceDpiPresets: ({})

  /** Map of serial -> current active DPI value (for reactive UI selection). */
  property var deviceDpi: ({})

  /** Map of serial -> true when the mouse keeps DPI presets in on-board memory. */
  property var deviceStageCapable: ({})

  /** Remaining fast retries for a device that reports stage support but no
      stages yet — a wireless mouse is often not ready on the first poll. */
  property int stageReadRetries: 5

  /** Map of serial -> effect name for locally-selected effects (before apply). */
  property var deviceEffects: ({})


  /** Previous device serial->name map, used for connect/disconnect detection. */
  property var prevDeviceMap: ({})

  /** True until the first daemon response arrives (suppresses initial notifications). */
  property bool initialLoad: true

  /** Session toggle for desktop notifications (persists until panel close). */
  property bool notificationsEnabled: root.enableNotifications

  // ── Derived / Read-Only Properties ────────────────────────────────────────

  readonly property string barIcon: "󰾰"
  readonly property color fg: root.bar ? root.bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(fg, 1.45)
  readonly property string fontFamily: root.bar ? root.bar.fontFamily : Style.font.family

  /** Poll interval in seconds while the panel is open (from user settings, default 30). */
  readonly property int pollInterval: Model.getPollInterval(root.settings, 30)

  /** Interval the poll timer actually uses: the full rate while the panel is
      open, backed off to idlePollIntervalSec (default 300s) while it is closed.
      The bar only needs a battery level and a device count, so polling the
      hardware every 30s around the clock buys nothing. */
  readonly property int activePollInterval: Model.effectivePollInterval(root.settings, root.opened)

  /** What to display next to the icon in the bar button: "Device count", "Battery level", or "Icon only". */
  readonly property string barDisplayMode: {
    var v = settings ? settings.barDisplayMode : undefined
    return (v === undefined || v === null || v === "") ? "Device count" : v
  }

  /** Whether connect/disconnect notifications are enabled in settings. */
  readonly property bool enableNotifications: {
    var v = settings ? settings.enableNotifications : undefined
    return v === undefined || v === null ? true : v === true
  }

  /** Tooltip text shown on bar button hover. */
  readonly property string tooltipText: Model.summaryText(root.razerData)

  // ── Data Fetching ─────────────────────────────────────────────────────────

  /** Kick off the daemon status fetch (if not already running). */
  function refresh() {
    if (!razerProc.running) {
      loading = true
      razerProc.running = true
    }
  }

  /** Parse raw JSON from the daemon, detect device changes, update state. */
  function updateData(raw) {
    var parsed = Model.parseData(raw)
    // On subsequent loads, compare device maps and fire notifications for changes
    if (!initialLoad && notificationsEnabled && parsed.daemon_running) {
      var changes = Model.detectDeviceChanges(prevDeviceMap, parsed.devices || [])
      for (var i = 0; i < changes.length; i++)
        sendDeviceNotification(changes[i])
    }
    prevDeviceMap = Model.buildDeviceMap(parsed.devices || [])
    // Sync DPI and presets from the daemon. A mouse with on-board stage memory
    // is the source of truth for its own presets, so the firmware list wins.
    if (parsed && Array.isArray(parsed.devices)) {
      var dMap = Object.assign({}, root.deviceDpi)
      var pMap = Object.assign({}, root.deviceDpiPresets)
      var sMap = Object.assign({}, root.deviceStageCapable)
      var stagesPending = false
      for (var j = 0; j < parsed.devices.length; j++) {
        var d = parsed.devices[j]
        if (!d || !d.serial) continue
        if (d.has_dpi && d.dpi) {
          var dpiVal = Array.isArray(d.dpi) ? d.dpi[0] : d.dpi
          dMap[d.serial] = Number(dpiVal)
        }
        if (d.has_dpi_stages && Array.isArray(d.hardware_dpi_stages)
            && d.hardware_dpi_stages.length > 0) {
          sMap[d.serial] = true
          pMap[d.serial] = d.hardware_dpi_stages.slice()
        } else if (d.has_dpi_stages && !pMap[d.serial]) {
          // Capability is advertised but the list came back empty — the device
          // is not awake yet. Retry soon rather than showing generic defaults
          // for a whole poll interval.
          stagesPending = true
        }
      }
      root.deviceDpi = dMap
      root.deviceDpiPresets = pMap
      root.deviceStageCapable = sMap

      if (stagesPending && root.stageReadRetries > 0) {
        root.stageReadRetries--
        stageRetryTimer.restart()
      }
    }
    razerData = parsed
    dataVersion++
    loading = false
    initialLoad = false
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Cycle the bar's display mode (count → battery → icon only → …) and persist it. */
  function cycleBarDisplayMode() {
    var next = Model.nextBarDisplayMode(root.barDisplayMode)
    barModeProc.command = ["omarchy-bar", "set", "asdfsnlr.omarazer", "barDisplayMode", next]
    barModeProc.running = true
  }

  /** Send a freedesktop desktop notification for a device connect/disconnect event. */
  function sendDeviceNotification(change) {
    var urgency = change.type === "connected" ? "low" : "normal"
    var title = change.type === "connected" ? "Device Connected" : "Device Disconnected"
    notifyProc.command = ["notify-send", "-a", "OmaRazer", "-u", urgency, title, change.name]
    notifyProc.running = true
  }

  // ── Device Control Functions ──────────────────────────────────────────────

  /**
   * Set brightness for a single device or all devices ("all").
   * Optimistically updates local state, then sends the CLI command.
   */
  function setBrightness(serial, value) {
    if (!serial) return
    var valNum = Number(value)
    if (serial === "all") {
      root.globalBrightness = valNum
    }
    // Optimistic UI update: clone device list with updated brightness
    if (root.razerData && Array.isArray(root.razerData.devices)) {
      var copy = Object.assign({}, root.razerData)
      copy.devices = root.razerData.devices.map(function(d) {
        if (!d) return d
        if (serial === "all" || (d.serial && String(d.serial).toLowerCase() === String(serial).toLowerCase())) {
          var dc = Object.assign({}, d)
          if (dc.has_brightness) {
            dc.brightness = valNum
          }
          return dc
        }
        return d
      })
      root.razerData = copy
      root.dataVersion++
    }
    actionProc.command = ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), "--set-brightness", String(serial), String(value)]
    actionProc.running = true
  }

  /** Set polling rate for a specific device. */
  function setPollRate(serial, rate) {
    if (!serial || !rate) return
    actionProc.command = ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), "--set-poll-rate", String(serial), String(rate)]
    actionProc.running = true
  }

  /** Set DPI for a specific device. */
  function setDpi(serial, dpiX, dpiY) {
    if (!serial || !dpiX) return
    var valX = Number(dpiX)
    var valY = dpiY !== undefined && dpiY !== null ? Number(dpiY) : valX

    // Track active DPI immediately for instant reactive UI highlight
    var dMap = Object.assign({}, root.deviceDpi)
    dMap[serial] = valX
    root.deviceDpi = dMap

    // Optimistic UI update: clone device list with updated DPI
    if (root.razerData && Array.isArray(root.razerData.devices)) {
      var copy = Object.assign({}, root.razerData)
      copy.devices = root.razerData.devices.map(function(d) {
        if (!d) return d
        if (d.serial && String(d.serial).toLowerCase() === String(serial).toLowerCase()) {
          var dc = Object.assign({}, d)
          dc.dpi = [valX, valY]
          return dc
        }
        return d
      })
      root.razerData = copy
      root.dataVersion++
    }

    // On a stage-capable mouse, commit the preset list and the active stage to
    // firmware in the same call so the selection survives a reboot unaided.
    var stages = root.deviceDpiPresets[serial]
    if (root.deviceStageCapable[serial] && Array.isArray(stages) && stages.length > 0) {
      var stageArgs = ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), "--apply-dpi-preset", String(serial), String(valX)]
      for (var k = 0; k < stages.length; k++) stageArgs.push(String(stages[k]))
      actionProc.command = stageArgs
      actionProc.running = true
      return
    }

    var args = ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), "--set-dpi", String(serial), String(valX)]
    if (dpiY !== undefined && dpiY !== null) {
      args.push(String(valY))
    }
    actionProc.command = args
    actionProc.running = true
  }



  /** Toggle the expanded/collapsed state of a device card's effect options. */
  function toggleDeviceExpanded(serial) {
    if (!serial) return
    var copy = Object.assign({}, expandedSerials)
    if (copy[serial]) {
      delete copy[serial]
    } else {
      copy[serial] = true
    }
    expandedSerials = copy
  }

  /** Get the current speed override for a device (defaults to "2" = normal). */
  function getDeviceSpeed(deviceKey) {
    if (!deviceKey) return "2"
    var s = deviceSpeeds[deviceKey]
    return s !== undefined && s !== null ? String(s) : "2"
  }

  /** Store a speed override for a specific device. */
  function setDeviceSpeed(deviceKey, speed) {
    if (!deviceKey) return
    var copy = Object.assign({}, deviceSpeeds)
    copy[deviceKey] = String(speed)
    deviceSpeeds = copy
  }

  /**
   * Apply a lighting effect to a device or all devices ("all").
   * @param serial  - Device serial, or "all" for global apply
   * @param effect  - Effect name (e.g. "static", "wave", "breath_single")
   * @param color   - Primary hex color (optional)
   * @param color2  - Secondary hex color (optional, for dual effects)
   * @param param   - Extra parameter: speed value or wave direction
   */
  function setEffect(serial, effect, color, color2, param) {
    if (!serial || !effect) return
    // Track locally-selected effect per device
    if (serial !== "all") {
      var ec = Object.assign({}, root.deviceEffects)
      ec[serial] = effect
      root.deviceEffects = ec
    }
    var args = ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), "--set-effect", String(serial), String(effect)]
    if (color) args.push(String(color))
    if (color2) args.push(String(color2))
    if (param) args.push(String(param))
    if (actionProc.running) {
      actionProc.running = false
    }
    actionProc.command = args
    actionProc.running = true
    // Clear per-key applied flag for this device (effect overrides per-key)
    if (serial !== "all") {
      var copy = {}
      var keys = Object.keys(root.perKeyApplied)
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] !== serial) copy[keys[i]] = root.perKeyApplied[keys[i]]
      }
      root.perKeyApplied = copy
    }
  }

  /** Restart the openrazer-daemon systemd user service. */
  function restartDaemon() {
    actionProc.command = ["systemctl", "--user", "restart", "openrazer-daemon"]
    actionProc.running = true
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Convert a file:// URL to a local filesystem path. */
  function pathFromUrl(url) {
    var value = String(url || "")
    if (value.indexOf("file://") === 0)
      return decodeURIComponent(value.substring(7))
    return value
  }

  /** Handle bar button press: middle-click = refresh, left-click = toggle panel. */
  function triggerPress(button) {
    if (button === Qt.MiddleButton) {
      refresh()
      return
    }
    if (opened) close()
    else {
      open()
      refresh()
    }
  }

  // ── Per-Key Editor ────────────────────────────────────────────────────────

  /** Open the per-key lighting editor for a keyboard device. */
  function openPerKeyEditor(device) {
    if (!device) return
    perKeyDeviceSerial = device.serial || ""
    perKeyDeviceName = device.name || "Keyboard"
    perKeyMatrixRows = device.matrix_rows || 0
    perKeyMatrixCols = device.matrix_cols || 0
    perKeyEditorOpen = true
  }

  /** Close the per-key editor and refresh device data (to pick up applied changes). */
  function closePerKeyEditor() {
    perKeyEditorOpen = false
    perKeyDeviceSerial = ""
    perKeyDeviceName = ""
    perKeyMatrixRows = 0
    perKeyMatrixCols = 0
    refresh()
  }

  // ── DPI Editor ────────────────────────────────────────────────────────────

  /** Open the DPI presets editor for a mouse device. */
  function openDpiEditor(device) {
    if (!device) return
    dpiDeviceSerial = device.serial || ""
    dpiDeviceName = device.name || "Mouse"
    var dVal = 800
    if (Array.isArray(device.dpi) && device.dpi.length > 0) dVal = Number(device.dpi[0])
    else if (typeof device.dpi === "number") dVal = Number(device.dpi)
    dpiDeviceCurrent = dVal
    dpiDeviceMax = device.max_dpi || 16000
    dpiEditorOpen = true
  }

  /** Close the DPI presets editor and refresh device data. */
  function closeDpiEditor() {
    dpiEditorOpen = false
    dpiDeviceSerial = ""
    dpiDeviceName = ""
    dpiDeviceCurrent = 800
    dpiDeviceMax = 16000
    refresh()
  }

  /** Update the active presets list for a device and persist it.

      Stage-capable mice commit their list to firmware when a DPI is applied;
      anything else is written to the on-disk store so it survives a restart. */
  function setDeviceDpiPresets(serial, presets) {
    if (!serial) return
    var copy = Object.assign({}, root.deviceDpiPresets)
    copy[serial] = presets
    root.deviceDpiPresets = copy

    if (!root.deviceStageCapable[serial] && Array.isArray(presets) && presets.length > 0) {
      var args = ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), "--save-device-presets", String(serial)]
      for (var i = 0; i < presets.length; i++) args.push(String(presets[i]))
      presetSaveProc.command = args
      presetSaveProc.running = true
    }
  }

  /** Merge the on-disk preset store in, leaving firmware-backed devices alone. */
  function mergeStoredPresets(raw) {
    if (!raw) return
    var stored = null
    try {
      stored = JSON.parse(raw)
    } catch (e) {
      return
    }
    if (!stored || typeof stored !== "object") return
    var copy = Object.assign({}, root.deviceDpiPresets)
    var changed = false
    for (var serial in stored) {
      if (root.deviceStageCapable[serial]) continue
      if (Array.isArray(stored[serial]) && stored[serial].length > 0) {
        copy[serial] = stored[serial]
        changed = true
      }
    }
    if (changed) root.deviceDpiPresets = copy
  }


  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onOpenedChanged: {
    if (opened) {
      refresh()
    }
  }

  Component.onCompleted: {
    presetLoadProc.running = true
    refresh()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // ── Background Processes ──────────────────────────────────────────────────

  /** Fetches daemon status JSON. Runs on open and via poll timer. */
  Process {
    id: razerProc
    command: ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py"))]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.updateData(text)
    }
  }

  /** Runs one-shot CLI commands (brightness, effects, poll rate, daemon restart). */
  Process {
    id: actionProc
    onExited: function(code, status) {
      Qt.callLater(root.refresh)
    }
  }

  /** Runs notify-send for desktop notifications. */
  Process { id: notifyProc }

  /** Persists a bar display mode change via the omarchy-bar CLI. */
  Process { id: barModeProc }

  /** Persists per-device DPI presets for mice without on-board stage memory. */
  Process { id: presetSaveProc }

  /** Loads the on-disk per-device preset store at startup. */
  Process {
    id: presetLoadProc
    command: ["python3", pathFromUrl(Qt.resolvedUrl("scripts/razer_devices.py")), "--get-device-presets"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.mergeStoredPresets(text)
    }
  }

  /** Short retry after a poll that found a stage-capable mouse still asleep. */
  Timer {
    id: stageRetryTimer
    interval: 2000
    repeat: false
    onTriggered: root.refresh()
  }

  /** Periodic refresh timer — polls the daemon at the configured interval,
      backing off automatically while the panel is closed. */
  Timer {
    id: pollTimer
    interval: root.activePollInterval * 1000
    running: true
    repeat: true
    onTriggered: root.refresh()
  }

  // ── Bar Button ────────────────────────────────────────────────────────────

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: Model.formatBarText(root.razerData, root.barDisplayMode)
    fixedWidth: root.barDisplayMode !== "Icon only" ? -1 : (root.bar && root.bar.vertical ? -1 : Style.space(27))
    fixedHeight: root.barDisplayMode !== "Icon only" ? -1 : (root.bar && root.bar.vertical ? Style.space(26) : -1)
    tooltipText: root.tooltipText
    onPressed: function(b) { root.triggerPress(b) }
  }

  // ── Panel Overlay ─────────────────────────────────────────────────────────
  // The floating panel anchored to the bar button, containing all device UI.

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(500))
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTextKey: function(t) {
        if (t === "r" || t === "R") root.refresh()
      }

      ColumnLayout {
        id: contentColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        spacing: Style.space(12)

        // ── Header: Title, summary text, refresh & notification buttons ──
        PanelHeader {
          barIcon: root.barIcon
          fontFamily: root.fontFamily
          fg: root.fg
          razerData: root.razerData
          notificationsEnabled: root.notificationsEnabled
          barDisplayMode: root.barDisplayMode
          Layout.fillWidth: true
          onRefreshRequested: root.refresh()
          onNotificationsToggled: root.notificationsEnabled = !root.notificationsEnabled
          onBarDisplayModeCycled: root.cycleBarDisplayMode()
        }

        // ── Global Controls: Quick-effect buttons + global brightness slider ──
        GlobalControls {
          razerData: root.razerData
          globalBrightness: root.globalBrightness
          fontFamily: root.fontFamily
          fg: root.fg
          dim: root.dim
          dataVersion: root.dataVersion
          bar: root.bar
          Layout.fillWidth: true
          onSetEffect: function(serial, effect, color, color2, param) { root.setEffect(serial, effect, color, color2, param) }
          onSetBrightness: function(serial, value) { root.setBrightness(serial, value) }
        }

        PanelSeparator {
          Layout.fillWidth: true
          foreground: root.fg
        }

        // ── Error State: Shown when the daemon is not running ──
        ErrorState {
          razerData: root.razerData
          loading: root.loading
          fontFamily: root.fontFamily
          fg: root.fg
          dim: root.dim
          Layout.fillWidth: true
          onRestartDaemon: root.restartDaemon()
          onRefreshRequested: root.refresh()
        }

        // ── Empty State: Shown when daemon is running but no devices found ──
        EmptyState {
          razerData: root.razerData
          loading: root.loading
          fontFamily: root.fontFamily
          fg: root.fg
          dim: root.dim
          Layout.fillWidth: true
        }

        // ── Device List: Scrollable list of per-device cards ──
        Flickable {
          id: deviceScroll
          visible: root.razerData.devices.length > 0
          Layout.fillWidth: true
          Layout.topMargin: Style.space(8)
          Layout.bottomMargin: Style.space(8)
          implicitHeight: Math.min(devicesColumn.implicitHeight, Style.space(520))
          contentHeight: devicesColumn.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds

          ColumnLayout {
            id: devicesColumn
            width: deviceScroll.width
            spacing: Style.space(10)

            Repeater {
              // Sort devices alphabetically by name for consistent ordering
              model: root.dataVersion >= 0 ? (root.razerData.devices || []).slice().sort(function(a, b) {
                return (a.name || "").localeCompare(b.name || "")
              }) : []

              delegate: BorderSurface {
                id: deviceCard
                required property var modelData
                required property int index

                readonly property string deviceKey: deviceCard.modelData.serial || deviceCard.modelData.name || ("dev_" + deviceCard.index)
                readonly property bool isExpanded: !!root.expandedSerials[deviceCard.deviceKey]
                readonly property bool perKeyActive: !!root.perKeyApplied[deviceCard.modelData.serial]
                readonly property string currentEffect: (root.deviceEffects[deviceCard.modelData.serial] || deviceCard.modelData.current_effect || "static").toLowerCase()
                readonly property string currentSpeed: root.getDeviceSpeed(deviceCard.deviceKey)

                Layout.fillWidth: true
                color: Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.05)
                borderSpec: Border.flat(Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.08), 1)
                radius: Style.cornerRadius
                padding: Style.space(10)
                implicitHeight: cardDeviceCard.implicitHeight + contentTopInset + contentBottomInset

                DeviceCard {
                  id: cardDeviceCard
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.top: parent.top
                  anchors.topMargin: parent.contentTopInset
                  anchors.rightMargin: parent.contentRightInset
                  anchors.bottomMargin: parent.contentBottomInset
                  anchors.leftMargin: parent.contentLeftInset
                  modelData: deviceCard.modelData
                  fontFamily: root.fontFamily
                  fg: root.fg
                  dim: root.dim
                  bar: root.bar
                  dataVersion: root.dataVersion
                  isExpanded: deviceCard.isExpanded
                  perKeyActive: deviceCard.perKeyActive
                  deviceEffects: root.deviceEffects
                  deviceSpeeds: root.deviceSpeeds
                  deviceDpiPresets: root.deviceDpiPresets
                  deviceDpi: root.deviceDpi
                  onSetBrightness: function(serial, value) { root.setBrightness(serial, value) }
                  onSetEffect: function(serial, effect, color, color2, param) { root.setEffect(serial, effect, color, color2, param) }
                  onSetPollRate: function(serial, value) { root.setPollRate(serial, value) }
                  onSetDpi: function(serial, value) { root.setDpi(serial, value) }
                  onOpenPerKeyEditor: function(device) { root.openPerKeyEditor(device) }
                  onOpenDpiEditor: function(device) { root.openDpiEditor(device) }
                  onToggleExpanded: function(deviceKey) { root.toggleDeviceExpanded(deviceKey) }
                }
              }
            }
          }
        }

        PanelSeparator {
          Layout.fillWidth: true
          foreground: root.fg
        }

        // ── Keyboard Shortcut Hints ──
        Text {
          Layout.fillWidth: true
          horizontalAlignment: Text.AlignHCenter
          textFormat: Text.RichText
          text: "<span style='background-color: " + Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.12) + "; color: " + root.fg + "; border-radius: 3px; padding: 1px 4px;'><b>&nbsp;Esc&nbsp;</b></span> to close, and <span style='background-color: " + Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.12) + "; color: " + root.fg + "; border-radius: 3px; padding: 1px 4px;'><b>&nbsp;r&nbsp;</b></span> to refresh."
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }

  // ── Per-Key Lighting Editor (standalone centered window) ──────────────────

  PerKeyEditor {
    id: perKeyEditor
    deviceSerial: root.perKeyEditorOpen ? root.perKeyDeviceSerial : ""
    deviceName: root.perKeyDeviceName
    matrixRows: root.perKeyMatrixRows
    matrixCols: root.perKeyMatrixCols
    onCloseRequested: root.closePerKeyEditor()
    onApplied: function(serial) {
      var copy = {}
      var keys = Object.keys(root.perKeyApplied)
      for (var i = 0; i < keys.length; i++) copy[keys[i]] = root.perKeyApplied[keys[i]]
      copy[serial] = true
      root.perKeyApplied = copy
    }
  }

  // ── DPI Presets Editor (standalone centered window) ───────────────────────

  DpiEditor {
    id: dpiEditor
    deviceSerial: root.dpiEditorOpen ? root.dpiDeviceSerial : ""
    deviceName: root.dpiDeviceName
    currentDpi: root.dpiDeviceCurrent
    maxDpi: root.dpiDeviceMax
    activePresets: root.deviceDpiPresets[root.dpiDeviceSerial] || Model.defaultDpiPresets()
    onCloseRequested: root.closeDpiEditor()
    onApplied: function(serial, dpi, presets) {
      // Presets first: setDpi reads the map to build the firmware stage write.
      if (presets) root.setDeviceDpiPresets(serial, presets)
      root.setDpi(serial, dpi)
    }
    onPresetsUpdated: function(serial, presets) {
      root.setDeviceDpiPresets(serial, presets)
    }
  }
}

