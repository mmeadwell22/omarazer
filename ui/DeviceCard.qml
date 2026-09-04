import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "../Model.js" as Model

ColumnLayout {
  id: root

  property var modelData: ({})
  property string fontFamily: ""
  property color fg: Color.foreground
  property color dim: Qt.darker(fg, 1.45)
  property var bar: null
  property int dataVersion: 0
  property bool isExpanded: false
  property bool perKeyActive: false
  property var deviceEffects: ({})
  property var deviceSpeeds: ({})
  property var deviceDpiPresets: ({})
  property var deviceDpi: ({})

  signal setBrightness(serial: string, value: real)
  signal setEffect(serial: string, effect: string, color: string, color2: string, param: string)
  signal setPollRate(serial: string, value: int)
  signal setDpi(serial: string, value: int)
  signal openPerKeyEditor(device: var)
  signal openDpiEditor(device: var)
  signal toggleExpanded(deviceKey: string)

  readonly property string deviceKey: modelData.serial || modelData.name || "unknown"
  readonly property string currentEffect: (root.deviceEffects[modelData.serial] || modelData.current_effect || "static").toLowerCase()
  readonly property string currentSpeed: root.deviceSpeeds[deviceKey] || ""
  readonly property int activeDpiVal: {
    if (root.deviceDpi && root.deviceDpi[root.modelData.serial] !== undefined && root.deviceDpi[root.modelData.serial] !== null) {
      return Number(root.deviceDpi[root.modelData.serial])
    }
    if (Array.isArray(root.modelData.dpi) && root.modelData.dpi.length > 0) {
      return Number(root.modelData.dpi[0])
    }
    if (typeof root.modelData.dpi === "number") {
      return Number(root.modelData.dpi)
    }
    return 0
  }
  readonly property var currentDpiPresets: {
    var p = root.deviceDpiPresets[root.modelData.serial]
    if (Array.isArray(p) && p.length > 0) return p
    return Model.defaultDpiPresets()
  }



  spacing: Style.space(8)

  // ── Device Title & Type Badge ──
  RowLayout {
    Layout.fillWidth: true
    spacing: Style.space(8)

    Text {
      text: root.modelData.name || "Unknown Razer Device"
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: true
      elide: Text.ElideRight
      Layout.fillWidth: true
      Layout.alignment: Qt.AlignVCenter
    }

    BorderSurface {
      color: Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.08)
      borderSpec: Border.none()
      radius: Style.space(4)
      padding: Style.space(4)
      implicitWidth: typeText.implicitWidth + Style.space(12)
      implicitHeight: typeText.implicitHeight + Style.space(4)
      Layout.alignment: Qt.AlignVCenter

      Text {
        id: typeText
        anchors.centerIn: parent
        text: Model.formatDeviceType(root.modelData.type).toUpperCase()
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        font.letterSpacing: 1.0
      }
    }
  }

  // ── Metadata Badges Row ──
  RowLayout {
    Layout.fillWidth: true
    spacing: Style.space(10)

    Text {
      visible: root.modelData.firmware_version !== ""
      text: "FW " + root.modelData.firmware_version
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    Text {
      visible: root.modelData.serial !== ""
      text: "SN: " + root.modelData.serial
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideMiddle
      Layout.maximumWidth: Style.space(140)
    }

    Item { Layout.fillWidth: true }

    // Battery Indicator (if present)
    RowLayout {
      visible: Model.batteryBadgeText(root.modelData) !== ""
      spacing: Style.space(4)

      Text {
        text: Model.batteryBadgeText(root.modelData)
        color: Model.batteryColor(root.modelData.battery_level, root.modelData.is_charging)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }

    // DPI Indicator (if present)
    Text {
      visible: root.modelData.has_dpi && root.modelData.dpi !== null
      text: Model.formatDpi(root.activeDpiVal > 0 ? root.activeDpiVal : root.modelData.dpi)
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }

    // Poll Rate Indicator (if present)
    Text {
      visible: root.modelData.has_poll_rate && root.modelData.poll_rate !== null
      text: Model.formatPollRate(root.modelData.poll_rate)
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
  }

  // ── Brightness Slider (if supported) ──
  RowLayout {
    visible: root.modelData.has_brightness && root.modelData.brightness !== null
    Layout.fillWidth: true
    spacing: Style.space(8)

    Text {
      text: "Brightness"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      Layout.alignment: Qt.AlignVCenter
    }

    PanelSlider {
      id: brightnessSlider
      bar: root.bar
      Layout.fillWidth: true
      minimum: 0
      maximum: 100
      step: 5
      integer: true
      value: root.modelData.brightness !== null ? root.modelData.brightness : 0
      onReleased: function(v) {
        root.setBrightness(root.modelData.serial, v)
      }
    }

    Text {
      text: Model.formatBrightness(brightnessSlider.liveValue)
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
      horizontalAlignment: Text.AlignRight
      Layout.minimumWidth: Style.space(36)
      Layout.alignment: Qt.AlignVCenter
    }
  }

  // ── Polling Rate Selector (if supported) ──
  RowLayout {
    visible: root.modelData.has_poll_rate && root.modelData.poll_rate !== null
    Layout.fillWidth: true
    spacing: Style.space(8)

    Text {
      text: "Polling Rate"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      Layout.alignment: Qt.AlignVCenter
    }

    Item { Layout.fillWidth: true }

    Repeater {
      model: Model.supportedPollRates(root.modelData)

      delegate: Button {
        required property int modelData
        readonly property bool isSelected: root.modelData.poll_rate === modelData

        text: modelData + " Hz"
        foreground: isSelected ? Color.accent : root.fg
        background: isSelected ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.22) : "transparent"
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: true
        selected: isSelected
        active: isSelected
        horizontalPadding: Style.space(6)
        verticalPadding: Style.space(3)
        onClicked: {
          root.setPollRate(root.modelData.serial, modelData)
        }
      }
    }
  }

  // ── DPI Sensitivity & Preset Steps (if supported) ──
  ColumnLayout {
    visible: root.modelData.has_dpi && root.modelData.dpi !== null
    Layout.fillWidth: true
    spacing: Style.space(6)

    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(8)

      Text {
        text: "DPI Sensitivity"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        Layout.alignment: Qt.AlignVCenter
      }

      Item { Layout.fillWidth: true }

      Text {
        text: Model.formatDpi(root.activeDpiVal > 0 ? root.activeDpiVal : root.modelData.dpi)
        color: Color.accent
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        Layout.alignment: Qt.AlignVCenter
      }

      Button {
        text: "Presets"
        foreground: Color.accent
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: true
        horizontalPadding: Style.space(6)
        verticalPadding: Style.space(3)
        onClicked: root.openDpiEditor(root.modelData)
      }
    }

    // Preset Steps Quick-Switch Row
    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(4)

      Repeater {
        model: root.currentDpiPresets

        delegate: Button {
          required property int modelData
          readonly property bool isSelected: root.activeDpiVal === modelData

          text: String(modelData)
          foreground: isSelected ? Color.accent : root.fg
          background: isSelected ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.22) : "transparent"
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          bordered: true
          selected: isSelected
          active: isSelected
          horizontalPadding: Style.space(6)
          verticalPadding: Style.space(3)
          Layout.fillWidth: true
          onClicked: {
            root.setDpi(root.modelData.serial, modelData)
          }
        }
      }
    }
  }


  // ── Lighting Effects Section ──
  ColumnLayout {
    visible: root.modelData.has_lighting && Model.availableEffects(root.modelData).length > 0
    Layout.fillWidth: true
    spacing: Style.space(6)

    // Lighting section header
    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(6)

      Text {
        text: "Lighting Effect"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        Layout.alignment: Qt.AlignVCenter
      }

      Item { Layout.fillWidth: true }

      Button {
        id: effectDropdownBtn
        text: root.perKeyActive ? "Per-Key" : Model.effectDisplayName(root.modelData.current_effect)
        iconText: root.isExpanded ? "󰅃" : "󰅀"
        foreground: Color.accent
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        bordered: true
        selected: root.isExpanded
        horizontalPadding: Style.space(8)
        verticalPadding: Style.space(4)
        onClicked: root.toggleExpanded(root.deviceKey)

        Rectangle {
          visible: Model.needsColor(root.modelData.current_effect)
          anchors.right: parent.right
          anchors.top: parent.top
          anchors.margins: -4
          width: Style.space(8)
          height: Style.space(8)
          radius: width / 2
          color: Model.primaryColor(root.modelData)
          border.width: 1
          border.color: "#ffffff"
        }

        Rectangle {
          visible: Model.needsSecondaryColor(root.modelData.current_effect)
          anchors.right: parent.right
          anchors.bottom: parent.top
          anchors.margins: -4
          width: Style.space(8)
          height: Style.space(8)
          radius: width / 2
          color: Model.secondaryColor(root.modelData)
          border.width: 1
          border.color: "#ffffff"
        }
      }
    }

    // Collapsible Per-Device Effect Options
    EffectOptions {
      visible: root.isExpanded
      Layout.fillWidth: true
      modelData: root.modelData
      fontFamily: root.fontFamily
      fg: root.fg
      dim: root.dim
      bar: root.bar
      perKeyActive: root.perKeyActive
      deviceEffects: root.deviceEffects
      deviceSpeeds: root.deviceSpeeds
      deviceKey: root.deviceKey
      currentEffect: root.currentEffect
      currentSpeed: root.currentSpeed
      onSetBrightness: function(serial, value) { root.setBrightness(serial, value) }
      onSetEffect: function(serial, effect, color, color2, param) { root.setEffect(serial, effect, color, color2, param) }
      onOpenPerKeyEditor: function(device) { root.openPerKeyEditor(device) }
    }
  }
}
