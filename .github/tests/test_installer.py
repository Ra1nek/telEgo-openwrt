#!/usr/bin/env python3
"""Exercise installer failure handling without connecting to a router."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/install-on-router.sh"

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="telego-installer-")
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.packages = root / "packages with spaces"
        self.packages.mkdir()
        for name in ("telego-pkg", "luci-app-telego", "luci-i18n-telego-ru", "nginx-telego"):
            (self.packages / (name + "-0.6.1-r1.apk")).touch()
        bindir = root / "bin"
        bindir.mkdir()
        self.log = root / "commands.log"
        commands = {
            "ssh": """#!/bin/bash
echo "ssh $*" >> "$TEST_LOG"
case "$2" in
  'mktemp '*) echo /tmp/telego-install.ABC12345 ;;
  'sh -s '*)
    trust=0
    [[ $2 == *"'1'" ]] && trust=1
    sed 's@cd "$1"@cd "$TEST_PACKAGES"@; s@/etc/init.d/rpcd@rpcd@' | sh -s -- unused "$trust"
    ;;
  'rm -f '*) : ;;
  *) exit 99 ;;
esac
""",
            "scp": """#!/bin/sh
echo "scp $*" >> "$TEST_LOG"
exit "${SCP_FAIL:-0}"
""",
            "apk": """#!/bin/sh
echo "apk $*" >> "$TEST_LOG"
[ "$1" != add ] || exit "${APK_FAIL:-0}"
""",
            "rpcd": """#!/bin/sh
echo "rpcd $*" >> "$TEST_LOG"
exit "${RPCD_FAIL:-0}"
""",
        }
        for name, content in commands.items():
            path = bindir / name
            path.write_text(content)
            path.chmod(0o755)
        self.env = dict(os.environ, PATH=str(bindir) + ":" + os.environ["PATH"],
                        TEST_LOG=str(self.log), TEST_PACKAGES=str(self.packages))

    def run_installer(self, *flags, **env):
        return subprocess.run(["bash", str(SCRIPT), *flags, "router.test", str(self.packages)],
                              env=dict(self.env, **env), text=True, capture_output=True)

    def test_trusted_install_is_one_transaction(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.log.read_text()
        self.assertEqual(log.count("apk add "), 1)
        self.assertNotIn("--allow-untrusted", log)
        self.assertIn("rpcd restart", log)
        self.assertIn("Installation complete", result.stdout)

    def test_untrusted_requires_explicit_flag(self):
        result = self.run_installer("--allow-untrusted")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("apk add --allow-untrusted ", self.log.read_text())

    def test_failures_never_report_success(self):
        for failure in ("SCP_FAIL", "APK_FAIL", "RPCD_FAIL"):
            with self.subTest(failure=failure):
                result = self.run_installer(**{failure: "17"})
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("Installation complete", result.stdout)
                self.assertIn("rm -f '/tmp/telego-install.ABC12345'", self.log.read_text())

    def test_missing_or_duplicate_packages_fail_before_ssh(self):
        extra = self.packages / "telego-pkg-0.6.1-r2.apk"
        extra.touch()
        self.assertNotEqual(self.run_installer().returncode, 0)
        extra.unlink()
        next(self.packages.glob("nginx-telego-*.apk")).unlink()
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertFalse(self.log.exists())

if __name__ == "__main__":
    unittest.main()
