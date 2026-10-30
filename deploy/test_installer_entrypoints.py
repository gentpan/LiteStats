"""Installer entrypoint and existing-instance upgrade regressions; no services run."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import litestats as ops


DEPLOY = Path(__file__).resolve().parent


class InstallerEntrypointTests(unittest.TestCase):
    def invoke(self, directory, script, *arguments):
        return subprocess.run(
            [sys.executable, str(directory / script), *arguments],
            cwd=directory,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            capture_output=True,
            text=True,
            timeout=10,
        )

    def test_both_entrypoints_offer_the_same_commands(self):
        current = self.invoke(DEPLOY, "plost.py", "--help")
        legacy = self.invoke(DEPLOY, "litestats.py", "--help")
        self.assertEqual(current.returncode, 0)
        self.assertEqual(legacy.returncode, 0)
        self.assertEqual(current.stderr, "")
        self.assertEqual(legacy.stderr, "")
        self.assertIn("{install,backup,restore,verify}", current.stdout)
        self.assertEqual(
            current.stdout, legacy.stdout.replace("litestats.py", "plost.py")
        )

    def test_invalid_port_rejected_before_creating_an_instance(self):
        with tempfile.TemporaryDirectory() as temporary:
            instance = Path(temporary) / "must-not-exist"
            for script in ("plost.py", "litestats.py"):
                with self.subTest(script=script):
                    result = self.invoke(
                        DEPLOY, script, "install", "--directory", str(instance),
                        "--port", "0",
                    )
                    self.assertEqual(result.returncode, 1)
                    self.assertEqual(result.stderr.strip(), "Plost: Invalid port")
                    self.assertFalse(instance.exists())

    def test_upgrade_copies_working_entrypoints_and_preserves_instance_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            instance = Path(temporary) / "private-instance"
            instance.mkdir(mode=0o700)
            config = instance / ".env"
            identity = {
                "DATABASE_URL": "postgres://fixture:fixture@postgres:5432/existing",
                "CLICKHOUSE_URL": "http://fixture:fixture@clickhouse:8123/existing",
                "POSTGRES_PASSWORD": "existing-pg-fixture",
                "CLICKHOUSE_PASSWORD": "existing-ch-fixture",
                "SESSION_KEY": "existing-session-fixture-" * 3,
                "COMPOSE_PROJECT_NAME": "litestats_existing_fixture",
                "APP_PORT": "3199",
                "OPS_UID": str(os.getuid()),
                "OPS_GID": str(os.getgid()),
                "LITESTATS_OPS_TOKEN": "existing-ops-fixture-" * 3,
            }
            ops.private_write(
                config, "\n".join(f"{key}={value}" for key, value in identity.items())
                + "\nLITESTATS_IMAGE=litestats:old-fixture\n",
            )
            recovery_key = "existing-recovery-fixture-" * 3
            ops.private_write(instance / "backup.key", recovery_key)
            args = argparse.Namespace(directory=instance, port=3100)
            with patch.object(ops, "compose_command", return_value=["docker", "compose"]), \
                    patch.object(ops, "run", return_value=b"") as run, \
                    patch.object(ops, "install_agent") as install_agent, \
                    patch("builtins.print"):
                ops.install(args)

            install_agent.assert_called_once_with(instance.resolve())
            self.assertTrue(any(call.args[0][:2] == ["docker", "build"]
                                for call in run.call_args_list))
            installed = ops.read_env(config)
            for key, value in identity.items():
                with self.subTest(setting=key):
                    self.assertEqual(installed[key], value)
            self.assertEqual((instance / "backup.key").read_text(), recovery_key)
            self.assertEqual(config.stat().st_mode & 0o077, 0)
            for name in ("plost.py", "litestats.py", "ops_agent.py"):
                self.assertEqual((instance / name).read_bytes(), (DEPLOY / name).read_bytes())
                result = self.invoke(instance, name, "--help")
                self.assertEqual(result.returncode, 0, result.stderr)

            # Import from the copied private instance, without the checkout on sys.path.
            imported = subprocess.run(
                [sys.executable, "-c",
                 "import ops_agent, litestats; assert ops_agent.ops is litestats"],
                cwd=instance,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertEqual(imported.returncode, 0, imported.stderr)


if __name__ == "__main__":
    unittest.main()
