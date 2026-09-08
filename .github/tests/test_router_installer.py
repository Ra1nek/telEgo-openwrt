#!/usr/bin/env python3
"""Test the router installer with local downloads and mocked APK/services."""
import hashlib
import os
from pathlib import Path
import pty
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]

class RouterInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="telego-router-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.feed = self.root / "feed"
        self.feed.mkdir()
        self.config = self.root / "telego"
        self.config.write_text("original user configuration\n")
        self.release = self.root / "openwrt_release"
        self.release.write_text("DISTRIB_RELEASE='25.12.5'\n")
        self.log = self.root / "commands"
        self.make_manifest()
        bindir = self.root / "bin"
        bindir.mkdir()
        busybox = os.environ.get("BUSYBOX")
        self.shell = [busybox, "sh"] if busybox else ["sh"]
        if busybox:
            (bindir / "awk").symlink_to(busybox)
        mocks = {
            "id": "#!/bin/sh\necho 0\n",
            "uname": "#!/bin/sh\necho x86_64\n",
            "df": "#!/bin/sh\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 999999 0 999999 0 /\\n'\n",
            "uclient-fetch": """#!/bin/sh
[ "${FETCH_FAIL:-0}" = 0 ] || exit 7
# Installer calls -T 30 -O destination URL.
url=$5
cp "$TEST_FEED/${url##*/}" "$4"
""",
            "apk": """#!/bin/sh
echo "apk $*" >> "$TEST_LOG"
case "$*" in
  *--simulate*) exit "${SIMULATE_FAIL:-0}" ;;
esac
if [ "$1" = add ]; then
    echo replaced-by-package > "$TEST_CONFIG"
    exit "${INSTALL_FAIL:-0}"
fi
""",
            "rpcd": "#!/bin/sh\necho rpcd-restart >> \"$TEST_LOG\"\n",
            "telego-service": "#!/bin/sh\n[ \"$1\" != running ]\n",
        }
        for name, text in mocks.items():
            path = bindir / name
            path.write_text(text)
            path.chmod(0o755)
        script = (ROOT / "install.sh").read_text()
        # ash may prefer internal applets over PATH; keep host checks mocked.
        script = script.replace('$(id -u)', f'$({bindir}/id -u)')
        script = script.replace('$(uname -m)', f'$({bindir}/uname -m)')
        script = script.replace('df -Pk', f'{bindir}/df -Pk')
        for old, new in {
            "/etc/openwrt_release": str(self.release),
            "/etc/config/telego": str(self.config),
            "/etc/telego-backups": str(self.root / "backups"),
            "/etc/init.d/rpcd": str(bindir / "rpcd"),
            "/etc/init.d/telego": str(bindir / "telego-service"),
        }.items():
            script = script.replace(old, new)
        self.script = self.root / "install.sh"
        self.script.write_text(script)
        self.env = dict(os.environ, PATH=str(bindir) + ":" + os.environ["PATH"],
                        TEST_FEED=str(self.feed), TEST_LOG=str(self.log), TEST_CONFIG=str(self.config))

    def make_manifest(self):
        lines = []
        for package in ("telego-pkg", "luci-app-telego", "nginx-telego", "luci-i18n-telego-ru"):
            name = package + "-0.6.1-r1.apk"
            data = package.encode()
            (self.feed / name).write_bytes(data)
            lines.append(hashlib.sha256(data).hexdigest() + "  " + name + "\n")
        self.manifest = self.feed / "telego-install.sha256"
        self.manifest.write_text("".join(lines))

    def run_script(self, *args, **env):
        return subprocess.run([*self.shell, str(self.script), "--yes", *args],
                              env=dict(self.env, **env), capture_output=True, text=True)

    def test_complete_web_set_without_translation_and_config_preserved(self):
        result = self.run_script("--no-ru", "--allow-untrusted")
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.log.read_text()
        self.assertIn("nginx-ssl", log)
        self.assertIn("./nginx-telego-", log)
        self.assertNotIn("./luci-i18n-telego-ru-", log)
        self.assertIn("--simulate", log)
        self.assertEqual(self.config.read_text(), "original user configuration\n")
        self.assertEqual(len(list((self.root / "backups").rglob("telego"))), 1)

    def test_russian_translation(self):
        result = self.run_script("--lang", "ru", "--ru", "--allow-untrusted")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("./luci-i18n-telego-ru-", self.log.read_text())
        self.assertIn("Установка завершена", result.stdout)

    def test_windows_manifest_line_endings(self):
        self.manifest.write_bytes(self.manifest.read_bytes().replace(b"\n", b"\r\n"))
        result = self.run_script("--ru", "--allow-untrusted")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("./telego-pkg-", self.log.read_text())
        self.assertIn("./luci-i18n-telego-ru-", self.log.read_text())

    def test_preview_requires_explicit_trust(self):
        result = self.run_script("--lang", "en")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists())

    def test_signed_release_does_not_bypass_trust(self):
        result = self.run_script("--release", "v0.6.1", "--no-ru")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("--allow-untrusted", self.log.read_text())

    def test_bad_checksum_or_duplicate_manifest_prevents_apk(self):
        (self.feed / "telego-pkg-0.6.1-r1.apk").write_text("tampered")
        self.assertNotEqual(self.run_script("--allow-untrusted").returncode, 0)
        self.assertFalse(self.log.exists())
        self.make_manifest()
        self.manifest.write_text(self.manifest.read_text() * 2)
        self.assertNotEqual(self.run_script("--allow-untrusted").returncode, 0)
        self.assertFalse(self.log.exists())

    def test_failures_do_not_report_success_and_preserve_config(self):
        for failure in ("FETCH_FAIL", "SIMULATE_FAIL", "INSTALL_FAIL"):
            with self.subTest(failure=failure):
                result = self.run_script("--allow-untrusted", **{failure: "17"})
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("Installation complete", result.stdout)
                self.assertEqual(self.config.read_text(), "original user configuration\n")

    def test_interactive_russian_menu(self):
        master, slave = pty.openpty()
        try:
            proc = subprocess.Popen([*self.shell, str(self.script)], stdin=slave,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env)
            os.close(slave)
            slave = None
            os.write(master, b"1\n1\ny\ny\n")
            stdout, stderr = proc.communicate(timeout=10)
            self.assertEqual(proc.returncode, 0, stderr.decode())
            self.assertIn("Установка завершена", stdout.decode())
            self.assertIn("./luci-i18n-telego-ru-", self.log.read_text())
        finally:
            os.close(master)
            if slave is not None:
                os.close(slave)

if __name__ == "__main__":
    unittest.main()
