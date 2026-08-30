import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "../Model.js" as Model

RowLayout {
  id: root

  property string barIcon: ""
  property string fontFamily: ""
  property color fg: Color.foreground
  property color dim: Qt.darker(fg, 1.45)
  property var razerData: ({})
  property bool notificationsEnabled: true
  property string barDisplayMode: "Device count"

  signal refreshRequested()
  signal notificationsToggled()
  signal barDisplayModeCycled()

  Layout.fillWidth: true
  spacing: Style.space(10)

  ColumnLayout {
    Layout.fillWidth: true
    spacing: Style.space(2)

    Text {
      text: "OmaRazer"
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.title
      font.bold: true
    }

    Text {
      text: Model.summaryText(root.razerData) + (root.razerData.version ? " • Installed OpenRazer Daemon v" + root.razerData.version : "")
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
      Layout.fillWidth: true
    }
  }

  Button {
    text: Model.barDisplayModeShortLabel(root.barDisplayMode)
    tooltipText: "Bar shows: " + root.barDisplayMode + " (click to cycle)"
    foreground: root.fg
    fontFamily: root.fontFamily
    fontSize: Style.font.body
    horizontalPadding: Style.spacing.controlPaddingX
    verticalPadding: Style.spacing.controlPaddingY
    bordered: true
    onClicked: root.barDisplayModeCycled()
  }

  Button {
    iconText: "󰑐"
    tooltipText: "Refresh (R)"
    foreground: root.fg
    fontFamily: root.fontFamily
    fontSize: Style.font.body
    horizontalPadding: Style.spacing.controlPaddingX
    verticalPadding: Style.spacing.controlPaddingY
    bordered: true
    onClicked: root.refreshRequested()
  }

  Button {
    iconText: root.notificationsEnabled ? "󰂜" : "󰂛"
    tooltipText: root.notificationsEnabled ? "Notifications on" : "Notifications off"
    foreground: root.notificationsEnabled ? Color.accent : root.dim
    fontFamily: root.fontFamily
    fontSize: Style.font.body
    horizontalPadding: Style.spacing.controlPaddingX
    verticalPadding: Style.spacing.controlPaddingY
    bordered: true
    onClicked: root.notificationsToggled()
  }
}
