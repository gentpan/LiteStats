import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch,MagicMock
import ops_agent as agent

class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.config=self.root/'app.env';agent.ops.private_write(self.config,'LITESTATS_OPS_TOKEN='+('fixture-'*8)+'\n')
        self.args=SimpleNamespace(config=self.config,backups=self.root/'backups',key_file=self.root/'backup.key',compose_file=None,service='none',health_url=None)
        self.broker=agent.Broker(self.args)
    def tearDown(self):self.temp.cleanup()
    def test_job_ticket_scope_and_archive_path_validation(self):
        job=self.broker.prepare({'kind':'backup'})
        self.assertNotIn('ticketHash',job)
        self.assertNotIn(job['ticket'],(self.broker.jobs/job['id']/'status.json').read_text())
        with self.assertRaises(agent.ops.OpsError):self.broker.read_job(job['id'],'wrong')
        for name in ('../app.env','bad.lsb/..','app.env'):
            with self.assertRaises(agent.ops.OpsError):self.broker.archive(name)
        (self.broker.root/'link.lsb').symlink_to(self.config)
        with self.assertRaises(agent.ops.OpsError):self.broker.archive('link.lsb')
    def test_invalid_restore_does_not_stop_or_rewrite_live_app(self):
        source=self.broker.root/'fixture.lsb';source.write_bytes(b'invalid')
        prepared=self.broker.prepare({'kind':'restore','archive':source.name,'recoveryKey':'fixture-key-'*5})
        folder,job=self.broker.read_job(prepared['id'],prepared['ticket'])
        original=self.config.read_bytes()
        with patch.object(self.broker,'service') as service:
            self.broker.work(folder,job)
            service.assert_not_called()
        self.assertEqual(self.config.read_bytes(),original)
        self.assertFalse((folder/'recovery.key').exists())
        self.assertEqual(job['state'],'failed')
    def test_health_failure_rolls_back_config_and_attempts_restart(self):
        source=self.broker.root/'fixture.lsb';source.write_bytes(b'fixture')
        prepared=self.broker.prepare({'kind':'restore','archive':source.name})
        folder,job=self.broker.read_job(prepared['id'],prepared['ticket'])
        original=self.config.read_bytes();service=MagicMock()
        def operation(kind):
            if kind=='restore':agent.ops.private_write(self.config,'CHANGED=1\n')
        service.operation.side_effect=operation
        service.start.side_effect=[agent.ops.OpsError('health failed'),None]
        manifest={'createdAt':'fixture','postgres':{'sites':1,'users':1},'clickhouse':[]}
        with patch.object(self.broker,'verify',return_value=manifest),patch.object(self.broker,'service',return_value=service):self.broker.work(folder,job)
        self.assertEqual(self.config.read_bytes(),original)
        self.assertEqual(service.start.call_count,2)
        self.assertEqual(job['state'],'failed')
    def test_verification_does_not_control_services(self):
        source=self.broker.root/'fixture.lsb';source.write_bytes(b'fixture')
        prepared=self.broker.prepare({'kind':'verify','archive':source.name})
        folder,job=self.broker.read_job(prepared['id'],prepared['ticket'])
        manifest={'createdAt':'fixture','postgres':{'sites':1,'users':1},'clickhouse':[]}
        with patch.object(self.broker,'verify',return_value=manifest),patch.object(self.broker,'service') as service:
            self.broker.work(folder,job);service.assert_not_called()
        self.assertEqual(job['state'],'succeeded')
    def test_expired_preparation_removes_its_uploaded_key(self):
        source=self.broker.root/'fixture.lsb';source.write_bytes(b'fixture')
        prepared=self.broker.prepare({'kind':'verify','archive':source.name,'recoveryKey':'fixture-key-'*5})
        folder,job=self.broker.read_job(prepared['id'],prepared['ticket'])
        job['expiresAt']=0;self.broker.save(folder,job)
        _,current=self.broker.read_job(prepared['id'],prepared['ticket'])
        self.assertEqual(current['state'],'failed')
        self.assertFalse((folder/'recovery.key').exists())
if __name__=='__main__':unittest.main()
