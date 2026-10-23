"""Run: python3 -m unittest discover -s deploy -p 'test_*.py'"""
import importlib.util
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("litestats_ops", Path(__file__).with_name("litestats.py"))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.key = "test-only-key-" * 5
        self.config = self.root / ".env"
        ops.private_write(self.config, "DATABASE_URL=postgres://test:fixture@localhost/source\nCLICKHOUSE_URL=http://localhost/source\nSESSION_KEY=" + self.key + "\n")
        self.key_path = self.root / "backup.key"
        ops.private_write(self.key_path, self.key)

    def tearDown(self):
        self.temporary.cleanup()

    def archive(self, *, unsafe=False, bad_checksum=False):
        folder = self.root / "payload"
        folder.mkdir()
        (folder / "postgres.dump").write_bytes(b"fixture database")
        (folder / "runtime.env").write_text(self.config.read_text())
        manifest = {"app":"litestats","version":2,"createdAt":"fixture", "postgres":{"users":1,"sites":1},"clickhouse":[],
                    "files":{p.name:ops.digest(p) for p in folder.iterdir()}}
        if bad_checksum:
            manifest["files"]["postgres.dump"] = "0" * 64
        (folder / "manifest.json").write_text(json.dumps(manifest))
        tar_path = self.root / "payload.tar"
        with tarfile.open(tar_path,"w") as tar:
            for p in folder.iterdir():
                tar.add(p,arcname=("../escape" if unsafe and p.name == "postgres.dump" else p.name))
        destination = self.root / "fixture.lsb"
        ops.seal(tar_path, destination, self.key, self.root)
        return destination

    def unpack(self, archive, key=None):
        work=self.root / "verify"
        work.mkdir()
        return ops.unseal(archive,work,key or self.key)

    def test_authenticated_roundtrip_and_permissions(self):
        archive=self.archive()
        payload,manifest=self.unpack(archive)
        self.assertEqual((payload/"postgres.dump").read_bytes(),b"fixture database")
        self.assertEqual(manifest["version"],2)
        self.assertEqual(archive.stat().st_mode & 0o077,0)
        self.assertNotIn(b"fixture database",archive.read_bytes())

    def test_wrong_key_rejected_before_extraction(self):
        archive=self.archive()
        with self.assertRaisesRegex(ops.OpsError,"authentication failed"):
            self.unpack(archive,"other-fixture-key-"*5)
        self.assertFalse((self.root/"verify/payload").exists())

    def test_tamper_rejected_before_extraction(self):
        archive=self.archive()
        content=bytearray(archive.read_bytes());content[len(content)//2]^=1
        archive.write_bytes(content)
        with self.assertRaisesRegex(ops.OpsError,"authentication failed"):
            self.unpack(archive)

    def test_validly_encrypted_traversal_and_bad_checksums_rejected(self):
        with self.assertRaisesRegex(ops.OpsError,"Invalid archive entry"):
            self.unpack(self.archive(unsafe=True))
        self.assertFalse((self.root/"escape").exists())

    def test_checksum_rejected_even_with_valid_encryption(self):
        with self.assertRaisesRegex(ops.OpsError,"checksum"):
            self.unpack(self.archive(bad_checksum=True))

    def test_failed_stage_preserves_live_configuration(self):
        archive=self.archive()
        original=self.config.read_bytes()
        with patch.object(ops,"psql",side_effect=ops.OpsError("fixture unavailable")):
            with self.assertRaises(ops.OpsError):
                ops.stage_restore(self.config,archive,self.key_path)
        self.assertEqual(self.config.read_bytes(),original)

    def test_runtime_patch_keeps_unrelated_settings_without_shell_expansion(self):
        ops.private_write(self.config, "# comment\nSESSION_KEY='fixture'\nOTHER=literal$()\n")
        ops.patch_env(self.config,{"SESSION_KEY":self.key,"NEW_SETTING":"a b"})
        values=ops.read_env(self.config)
        self.assertEqual(values["OTHER"],"literal$()")
        self.assertEqual(values["NEW_SETTING"],"a b")
        self.assertIn("# comment",self.config.read_text())
        self.assertEqual(self.config.stat().st_mode&0o077,0)

    def test_libpq_credentials_are_environment_only_and_ambient_redirects_removed(self):
        with patch.dict(os.environ,{"PGSERVICE":"unexpected","PGDATABASE":"wrong","PGSSLMODE":"require"}):
            env=ops.pg_env("postgres://fixture:do-not-log@127.0.0.1:55435/target?sslmode=disable")
        self.assertEqual(env["PGPASSWORD"],"do-not-log")
        self.assertEqual(env["PGDATABASE"],"target")
        self.assertEqual(env["PGSSLMODE"],"disable")
        self.assertNotIn("PGSERVICE",env)

if __name__ == "__main__":
    unittest.main()
