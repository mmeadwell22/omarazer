import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from scripts.helpers import (
    classify_device_type,
    parse_color,
    parse_speed,
    parse_direction,
    normalize_effect_name,
    normalize_battery_level,
)
from scripts.devices import get_device_info

class TestRazerDevices(unittest.TestCase):
    def setUp(self):
        """Point the profile/cache stores at a temp dir so tests never touch
        the real ~/.config/omarazer/."""
        self._tmp = tempfile.TemporaryDirectory()
        self._env = patch.dict(os.environ, {"OMARAZER_CONFIG_DIR": self._tmp.name})
        self._env.start()
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(self._env.stop)

    def test_classify_device_type(self):
        self.assertEqual(classify_device_type("keyboard", "Razer BlackWidow"), "keyboard")
        self.assertEqual(classify_device_type("mouse", "Razer DeathAdder"), "mouse")
        self.assertEqual(classify_device_type("audio", "Razer Nommo Chroma"), "speaker")
        self.assertEqual(classify_device_type("audio", "Razer Kraken V3"), "headset")
        self.assertEqual(classify_device_type("mousemat", "Razer Goliathus"), "mousemat")
        self.assertEqual(classify_device_type("accessory", "Razer Base Station"), "accessory")

    def test_parse_color(self):
        self.assertEqual(parse_color("#ff0000"), (255, 0, 0))
        self.assertEqual(parse_color("00ff00"), (0, 255, 0))
        self.assertEqual(parse_color("0,0,255"), (0, 0, 255))
        with self.assertRaises(ValueError):
            parse_color("invalid")

    def test_parse_speed(self):
        self.assertEqual(parse_speed("fast"), 1)
        self.assertEqual(parse_speed("1"), 1)
        self.assertEqual(parse_speed("normal"), 2)
        self.assertEqual(parse_speed("medium"), 2)
        self.assertEqual(parse_speed("2"), 2)
        self.assertEqual(parse_speed("slow"), 3)
        self.assertEqual(parse_speed("3"), 3)
        self.assertEqual(parse_speed("very_slow"), 4)
        self.assertEqual(parse_speed("4"), 4)
        self.assertEqual(parse_speed(None, default=2), 2)
        self.assertEqual(parse_speed("invalid", default=2), 2)

    def test_parse_direction(self):
        self.assertEqual(parse_direction("left"), 2)
        self.assertEqual(parse_direction("right"), 1)

    def test_normalize_effect_name(self):
        self.assertEqual(normalize_effect_name("breath_single"), "breath_single")
        self.assertEqual(normalize_effect_name("breathing"), "breath_single")
        self.assertEqual(normalize_effect_name("spectrum-cycling"), "spectrum")

    def test_normalize_battery_level_treats_zero_as_no_reading(self):
        # A sleeping device reports 0; a genuinely empty wireless device
        # cannot report at all, so 0 always means "the firmware did not answer".
        self.assertIsNone(normalize_battery_level(0))
        self.assertIsNone(normalize_battery_level(-1))
        self.assertIsNone(normalize_battery_level(None))
        self.assertIsNone(normalize_battery_level("not a number"))

    def test_normalize_battery_level_passes_through_real_readings(self):
        self.assertEqual(normalize_battery_level(97), 97)
        self.assertEqual(normalize_battery_level(1), 1)
        self.assertEqual(normalize_battery_level(100), 100)
        self.assertEqual(normalize_battery_level(92.6), 92)
        self.assertEqual(normalize_battery_level("85"), 85)

    def test_get_device_info(self):
        mock_dev = MagicMock()
        mock_dev.name = "Razer BlackWidow Chroma"
        mock_dev.type = "keyboard"
        mock_dev.serial = "XX123456"
        mock_dev.firmware_version = "v1.0"
        mock_dev.has = MagicMock(return_value=False)
        mock_dev.brightness = 100
        mock_dev.capabilities = {}
        mock_dev.fx = MagicMock()
        mock_dev.fx.advanced = False

        res = get_device_info(mock_dev)
        self.assertEqual(res["name"], "Razer BlackWidow Chroma")
        self.assertEqual(res["serial"], "XX123456")
        self.assertEqual(res["type"], "keyboard")

    def test_get_mouse_device_info(self):
        mock_mouse = MagicMock()
        mock_mouse.name = "Razer Naga Trinity"
        mock_mouse.type = "mouse"
        mock_mouse.serial = "PM1849H"
        mock_mouse.firmware_version = "v1.2"
        mock_mouse.has = MagicMock(return_value=False)
        mock_mouse.brightness = 100
        mock_mouse.dpi = (1800, 1800)
        mock_mouse.max_dpi = 16000
        mock_mouse.poll_rate = 500
        mock_mouse.capabilities = {"dpi": True, "poll_rate": True, "brightness": True}
        mock_mouse.fx = MagicMock()
        mock_mouse.fx.advanced = False

        res = get_device_info(mock_mouse)
        self.assertEqual(res["name"], "Razer Naga Trinity")
        self.assertEqual(res["type"], "mouse")
        self.assertEqual(res["poll_rate"], 500)
        self.assertEqual(res["supported_poll_rates"], [125, 500, 1000])
        self.assertEqual(res["dpi"], [1800, 1800])
        self.assertEqual(res["max_dpi"], 16000)

    def test_config_dir_honours_env_override(self):
        from scripts import profiles

        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {"OMARAZER_CONFIG_DIR": tmp}):
                self.assertTrue(profiles.get_profiles_dir().startswith(tmp))
                self.assertTrue(profiles.get_dpi_profiles_dir().startswith(tmp))
                self.assertTrue(profiles.get_device_presets_path().startswith(tmp))

    def test_config_dir_defaults_to_user_config(self):
        from scripts import profiles

        with tempfile.TemporaryDirectory() as fake_home:
            with patch.dict(os.environ, {"HOME": fake_home}, clear=True):
                self.assertEqual(
                    profiles.get_device_presets_path(),
                    os.path.join(fake_home, ".config", "omarazer", "device_presets.json"),
                )

    def _battery_mouse(self, level, charging=False):
        dev = MagicMock()
        dev.name = "Razer Viper V3 Pro (Wireless)"
        dev.type = "mouse"
        dev.serial = "632505H32239603"
        dev.firmware_version = "v1.14"
        dev.has = MagicMock(return_value=False)
        dev.capabilities = {"battery": True}
        dev.battery_level = level
        dev.is_charging = charging
        dev.fx = MagicMock()
        dev.fx.advanced = False
        return dev

    def test_asleep_device_reports_last_known_battery_level(self):
        from scripts.profiles import save_battery_level

        save_battery_level("Razer Viper V3 Pro (Wireless)", 97)

        res = get_device_info(self._battery_mouse(0))

        self.assertEqual(res["battery_level"], 97)
        self.assertTrue(res["battery_stale"])

    def test_live_battery_reading_wins_and_refreshes_cache(self):
        from scripts.profiles import load_battery_level, save_battery_level

        save_battery_level("Razer Viper V3 Pro (Wireless)", 97)

        res = get_device_info(self._battery_mouse(88))

        self.assertEqual(res["battery_level"], 88)
        self.assertFalse(res["battery_stale"])
        self.assertEqual(load_battery_level("Razer Viper V3 Pro (Wireless)"), 88)

    def test_battery_is_none_when_asleep_with_no_cached_value(self):
        res = get_device_info(self._battery_mouse(0))

        self.assertIsNone(res["battery_level"])
        self.assertFalse(res["battery_stale"])

    def test_charging_state_is_never_restored_from_cache(self):
        # A stale "Charging" badge after unplugging is worse than a missed one.
        from scripts.profiles import save_battery_level

        save_battery_level("Razer Viper V3 Pro (Wireless)", 97)

        res = get_device_info(self._battery_mouse(0, charging=False))

        self.assertEqual(res["battery_level"], 97)
        self.assertFalse(res["is_charging"])

    def test_battery_cache_round_trip(self):
        from scripts.profiles import load_battery_level, save_battery_level

        self.assertIsNone(load_battery_level("Razer Viper V3 Pro (Wireless)"))
        self.assertTrue(save_battery_level("Razer Viper V3 Pro (Wireless)", 97))
        self.assertEqual(load_battery_level("Razer Viper V3 Pro (Wireless)"), 97)

    def test_battery_cache_keeps_devices_separate(self):
        from scripts.profiles import load_battery_level, save_battery_level

        save_battery_level("Razer Viper V3 Pro (Wireless)", 97)
        save_battery_level("Razer Kraken", 40)
        self.assertEqual(load_battery_level("Razer Viper V3 Pro (Wireless)"), 97)
        self.assertEqual(load_battery_level("Razer Kraken"), 40)

    def test_battery_cache_skips_write_when_level_unchanged(self):
        # The panel polls every 30s; rewriting an identical value would churn
        # the disk for no reason.
        from scripts.profiles import get_battery_cache_path, save_battery_level

        save_battery_level("Razer Viper V3 Pro (Wireless)", 97)
        before = os.stat(get_battery_cache_path()).st_mtime_ns

        save_battery_level("Razer Viper V3 Pro (Wireless)", 97)
        self.assertEqual(os.stat(get_battery_cache_path()).st_mtime_ns, before)

        save_battery_level("Razer Viper V3 Pro (Wireless)", 96)
        self.assertNotEqual(os.stat(get_battery_cache_path()).st_mtime_ns, before)

    def test_battery_cache_ignores_unusable_input(self):
        from scripts.profiles import load_battery_level, save_battery_level

        self.assertFalse(save_battery_level("", 97))
        self.assertFalse(save_battery_level("Razer Viper V3 Pro (Wireless)", None))
        self.assertIsNone(load_battery_level("Razer Viper V3 Pro (Wireless)"))

    def test_dpi_profiles_management(self):
        from scripts.profiles import (
            list_dpi_profiles,
            save_dpi_profile,
            load_dpi_profile,
            delete_dpi_profile,
        )

        # Test listing profiles (includes seeded defaults)
        profiles = list_dpi_profiles()
        self.assertIn("Default", profiles)
        self.assertIn("FPS", profiles)

        # Test saving custom DPI profile
        test_data = {"name": "TestDpiProfile", "presets": [800, 1200, 3000], "dpi": 1200}
        success = save_dpi_profile("TestDpiProfile", test_data)
        self.assertTrue(success)

        # Test loading custom DPI profile
        loaded = load_dpi_profile("TestDpiProfile")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["name"], "TestDpiProfile")
        self.assertEqual(loaded["presets"], [800, 1200, 3000])
        self.assertEqual(loaded["dpi"], 1200)

        # Test deleting custom DPI profile
        del_success = delete_dpi_profile("TestDpiProfile")
        self.assertTrue(del_success)
        self.assertIsNone(load_dpi_profile("NonExistentProfile12345"))


if __name__ == "__main__":
    unittest.main()

