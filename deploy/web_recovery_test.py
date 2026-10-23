"""Real compiled app + Unix supervisor + isolated PG/CH recovery. Private fixture directory only.
Usage: python3 deploy/web_recovery_test.py /path/to/private/test-instance
"""
import base64
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
from types import SimpleNamespace
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
import ops_agent as agent
ops=agent.ops
root=Path(sys.argv[1]).resolve();source=ops.read_env(root/'.env')
source['DATABASE_URL']=source['DATABASE_URL'].replace('@postgres:5432','@127.0.0.1:55435')
source['CLICKHOUSE_URL']=source['CLICKHOUSE_URL'].replace('@clickhouse:8123','@127.0.0.1:58123')
assert urlsplit(source['DATABASE_URL']).netloc.split('@')[-1]=='127.0.0.1:55435'
assert urlsplit(source['CLICKHOUSE_URL']).netloc.split('@')[-1]=='127.0.0.1:58123'
work=root/'web-test';work.mkdir(mode=0o700,exist_ok=True)
config=work/'app.env';socket=work/'ops.sock'
source.update(LITESTATS_OPS_TOKEN=secrets.token_urlsafe(48),LITESTATS_OPS_SOCKET=str(socket),NODE_ENV='production',HOST='127.0.0.1',PORT='3316')
ops.private_write(config,'\n'.join(k+'='+json.dumps(v) for k,v in source.items())+'\n')
key=work/'backup.key';ops.backup_key(key,create=True)
app=Path(__file__).resolve().parent.parent/'app'
password='web-fixture-password'
hashed=subprocess.check_output(['bun','-e',"import bcrypt from 'bcryptjs';process.stdout.write(await bcrypt.hash('web-fixture-password',10))"],cwd=app).decode()
# Match fixture server/client major versions using the test database container's tools.
original_run=ops.run
def fixture_run(args,*,env=None,output=None,input_data=None):
    if args[0] in ('psql','pg_dump','pg_restore'):
        assert env['PGHOST']=='127.0.0.1' and env['PGPORT']=='55435'
        env={**env,'PGHOST':'127.0.0.1','PGPORT':'5432'}
        if args[0]=='pg_restore':input_data=Path(args[-1]).read_bytes();args=args[:-1]
        command=['docker','exec','-i']
        for name in ('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'):command+=['--env',name]
        return original_run(command+['litestats-postgres-1']+args,env=env,output=output,input_data=input_data)
    return original_run(args,env=env,output=output,input_data=input_data)
ops.run=fixture_run

ops.psql(source['DATABASE_URL'],"UPDATE users SET type='admin',password_hash='"+hashed+"',session_version=0 WHERE id=1")
ops.psql(source['DATABASE_URL'],"INSERT INTO sites(domain,name,timezone) VALUES ('web-recovery.test','Backup fixture','Asia/Shanghai') ON CONFLICT DO NOTHING")
original_name=ops.psql(source['DATABASE_URL'],'SELECT name FROM sites ORDER BY id LIMIT 1')
log=open(work/'app.log','ab');process=None
class TestService(ops.Service):
    def stop(self):
        global process
        if process and process.poll() is None:process.terminate();process.wait(timeout=40)
    def start(self):
        global process
        if process and process.poll() is None:return
        env={**os.environ,**ops.read_env(config)}
        process=subprocess.Popen(['node',str(app/'.output/start.mjs')],cwd=app,env=env,stdout=log,stderr=log)
        for _ in range(200):
            try:
                with urlopen('http://127.0.0.1:3316/api/health',timeout=1) as response:
                    if response.status==200:return
            except (OSError,ValueError):pass
            time.sleep(.1)
        raise ops.OpsError('fixture health failed')
agent.ops.Service=TestService
args=SimpleNamespace(config=config,backups=work/'backups',key_file=key,compose_file=None,service='fixture',health_url='http://127.0.0.1:3316/api/health')
broker=agent.Broker(args)
if socket.exists():socket.unlink()
server=agent.Server(str(socket),agent.Handler);server.broker=broker
threading.Thread(target=server.serve_forever,daemon=True).start()
service=broker.service(work/'unused.lsb',key);service.start()
def cookie():
    raw=base64.urlsafe_b64encode(json.dumps({'uid':1,'ver':0,'exp':int(time.time()*1000)+3600000},separators=(',',':')).encode()).decode().rstrip('=')
    signature=base64.urlsafe_b64encode(hmac.new(ops.read_env(config)['SESSION_KEY'].encode(),('litestats_session:'+raw).encode(),hashlib.sha256).digest()).decode().rstrip('=')
    return 'litestats_session='+raw+'.'+signature

def api(action,data=None,*,ticket=None,auth=True,raw=None):
    headers={'Origin':'http://127.0.0.1:3316'}
    if auth:headers['Cookie']=cookie()
    if ticket:headers['X-Backup-Ticket']=ticket
    body=raw if raw is not None else json.dumps(data).encode() if data is not None else None
    if body is not None:headers['Content-Type']='application/octet-stream' if raw else 'application/json'
    with urlopen(Request('http://127.0.0.1:3316/api/instance-backups?action='+action,data=body,headers=headers),timeout=20) as response:
        payload=response.read()
        return json.loads(payload) if 'application/json' in response.headers.get('Content-Type','') else payload

def job(kind,archive='',recovery=''):
    prepared=api('prepare',{'kind':kind,'archive':archive,'recoveryKey':recovery,'password':password,'confirmation':'RESTORE'})
    try:api('activate',{'id':prepared['id'],'ticket':prepared['ticket']})
    except (URLError,TimeoutError,http.client.RemoteDisconnected):pass
    for _ in range(600):
        try:
            current=api('status&id='+prepared['id'],ticket=prepared['ticket'],auth=False)
            if current['state'] in ('succeeded','failed'):return current
        except (OSError,http.client.HTTPException):pass
        time.sleep(.1)
    raise AssertionError('job timeout')
try:
    assert api('list')['available']
    created=job('backup');assert created['state']=='succeeded',created
    content=api('archive&id='+created['archive']);assert content.startswith(ops.MAGIC)
    assert api('key',{'password':password}).decode().strip()==key.read_text().strip()
    uploaded=api('upload',raw=content)
    wrong=job('verify',uploaded['id'],'deliberately-wrong-key-'*3);assert wrong['state']=='failed'
    verified=job('verify',uploaded['id']);assert verified['state']=='succeeded'
    old_url=ops.read_env(config)['DATABASE_URL'];old_ch=ops.read_env(config)['CLICKHOUSE_URL']
    ops.psql(old_url,"UPDATE sites SET name='web-restore-marker' WHERE id=(SELECT min(id) FROM sites)")
    # Force a different runtime key before recovery; status must work without the old login.
    ops.patch_env(config,{'SESSION_KEY':secrets.token_urlsafe(48)})
    service.stop();service.start()
    restored=job('restore',uploaded['id']);assert restored['state']=='succeeded',restored
    current=ops.read_env(config)
    assert current['DATABASE_URL']!=old_url and current['CLICKHOUSE_URL']!=old_ch
    assert current['SESSION_KEY']==source['SESSION_KEY']
    assert ops.psql(current['DATABASE_URL'],'SELECT name FROM sites ORDER BY id LIMIT 1')==original_name
    assert ops.psql(old_url,'SELECT name FROM sites ORDER BY id LIMIT 1')=='web-restore-marker'
    assert current['LITESTATS_OPS_TOKEN']==source['LITESTATS_OPS_TOKEN']
    assert restored['summary']==verified['summary']
    assert any(p.name.startswith('before-restore-') for p in broker.root.glob('*.lsb'))
    print('PASS: compiled authenticated API creates/downloads/uploads/verifies/restores both databases, restarts application, restores session key, retains old data and safety archive; job status survives session changes')
finally:
    service.stop();server.shutdown();server.server_close();socket.unlink(missing_ok=True);log.close()
