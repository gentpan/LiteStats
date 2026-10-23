#!/usr/bin/env python3
"""Private Unix-socket broker for administrator-initiated full backup/recovery jobs.
No shell commands, service names or filesystem paths are accepted from HTTP clients.
"""
import argparse
import datetime
import fcntl
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socketserver
import stat
import threading
import time
import tempfile
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
import litestats as ops

LIMIT=10*1024**3
NAME=re.compile(r"[A-Za-z0-9_-]+\.lsb\Z")
JOB=re.compile(r"[a-f0-9]{32}\Z")

class Broker:
    def __init__(self,args):
        self.args=args
        self.root=args.backups.resolve()
        self.root.mkdir(parents=True,mode=0o700,exist_ok=True)
        self.jobs=self.root/'.jobs';self.jobs.mkdir(mode=0o700,exist_ok=True)
        self.token=ops.read_env(args.config)['LITESTATS_OPS_TOKEN']
        if len(self.token)<32:raise ops.OpsError('Missing operations authentication token')
        self.lock=threading.Lock()
        self.active=None
        # A crashed worker must not leave the application offline or on an unverified switch.
        for folder in self.jobs.iterdir():
            if not folder.is_dir():continue
            try:
                job=json.loads((folder/'status.json').read_text())
                if job['state']=='prepared' and job['expiresAt']<time.time():
                    (folder/'recovery.key').unlink(missing_ok=True)
                    self.save(folder,job,state='failed',phase='failed',error='准备任务已过期，请重新发起操作')
                if job['state']=='running':
                    original=folder/'original.env'
                    if original.exists():
                        ops.private_write(args.config,original.read_bytes())
                        self.service(folder/'unused.lsb',args.key_file).start()
                    job.update(state='failed',phase='interrupted',error='作业中断，已尝试恢复原连接；旧数据库保留')
                    ops.private_write(folder/'status.json',json.dumps(job))
            except Exception:pass

    def service(self,archive,key):
        return ops.Service(SimpleNamespace(config=self.args.config,compose_file=self.args.compose_file,
            service=self.args.service,health_url=self.args.health_url,engine=False,archive=archive,key_file=key))

    def archive(self,name):
        if not NAME.fullmatch(name):raise ops.OpsError('Invalid archive ID')
        path=self.root/name
        if path.is_symlink() or not path.is_file():raise ops.OpsError('Archive not found')
        return path

    def read_job(self,identifier,ticket):
        if not JOB.fullmatch(identifier):raise ops.OpsError('Invalid job ID')
        folder=self.jobs/identifier
        job=json.loads((folder/'status.json').read_text())
        if not hmac.compare_digest(job['ticketHash'],hashlib.sha256(ticket.encode()).hexdigest()):
            raise ops.OpsError('Invalid job ticket')
        if job['state']=='prepared' and job['expiresAt']<time.time():
            (folder/'recovery.key').unlink(missing_ok=True)
            self.save(folder,job,state='failed',phase='failed',error='准备任务已过期，请重新发起操作')
        return folder,job

    def public_job(self,job):
        return {key:value for key,value in job.items() if key not in {'ticketHash'}}

    def save(self,folder,job,**patch):
        job.update(patch,updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        ops.private_write(folder/'status.json',json.dumps(job))

    def expire_prepared(self,folder):
        try:
            job=json.loads((folder/'status.json').read_text())
            if job['state']=='prepared' and job['expiresAt']<time.time():
                (folder/'recovery.key').unlink(missing_ok=True)
                self.save(folder,job,state='failed',phase='failed',error='准备任务已过期，请重新发起操作')
        except (OSError,ValueError,KeyError):pass

    def prepare(self,data):
        kind=data.get('kind')
        if kind not in ('backup','verify','restore'):raise ops.OpsError('Invalid operation')
        archive=data.get('archive','')
        if kind!='backup':self.archive(archive)
        recovery=data.get('recoveryKey','')
        if not isinstance(recovery,str) or len(recovery)>512 or (recovery and len(recovery.strip())<32):raise ops.OpsError('Invalid recovery key')
        identifier=secrets.token_hex(16);ticket=secrets.token_urlsafe(32)
        folder=self.jobs/identifier;folder.mkdir(mode=0o700)
        if recovery:ops.private_write(folder/'recovery.key',recovery.strip())
        job={'id':identifier,'kind':kind,'archive':archive,'state':'prepared','phase':'prepared',
             'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'expiresAt':time.time()+600,
             'ticketHash':hashlib.sha256(ticket.encode()).hexdigest()}
        self.save(folder,job)
        expiry=threading.Timer(601,self.expire_prepared,args=(folder,));expiry.daemon=True;expiry.start()
        return {**self.public_job(job),'ticket':ticket}

    def activate(self,identifier,ticket):
        folder,job=self.read_job(identifier,ticket)
        with self.lock:
            if job['state']!='prepared':return self.public_job(job)
            if job['expiresAt']<time.time():raise ops.OpsError('Job expired')
            if self.active:raise ops.OpsError('Another operation is running')
            self.active=identifier
            self.save(folder,job,state='running',phase='validating')
            threading.Thread(target=self.work,args=(folder,job),daemon=True).start()
        return self.public_job(job)

    def verify(self,source,key):
        with tempfile.TemporaryDirectory(prefix='litestats-web-verify-') as temporary:
            _,manifest=ops.unseal(source,Path(temporary),ops.backup_key(key))
            return manifest

    def summary(self,manifest):
        return {'createdAt':manifest['createdAt'],'sites':manifest['postgres'].get('sites',0),
                'users':manifest['postgres'].get('users',0),
                'events':sum(table['rows'] for table in manifest['clickhouse'] if table['name']=='events_v2'),
                'release':manifest.get('release','')}

    def work(self,folder,job):
        original=None;service=None;stopped=False
        try:
            # The caller already has its job ticket before this second, activating request.
            time.sleep(.3)
            source=self.archive(job['archive']) if job['kind']!='backup' else None
            key=folder/'recovery.key' if (folder/'recovery.key').exists() else self.args.key_file
            if source:
                manifest=self.verify(source,key)
                ops.private_write(str(source)+'.meta.json',json.dumps(self.summary(manifest)))
                if job['kind']=='verify':
                    self.save(folder,job,state='succeeded',phase='completed',summary=self.summary(manifest));return
            with open(self.args.config.parent/'.litestats-ops.lock','a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                original=self.args.config.read_bytes()
                ops.private_write(folder/'original.env',original)
                service=self.service(source or self.root/('full-'+job['id']+'.lsb'),key)
                self.save(folder,job,phase='pausing')
                stopped=True;service.stop()
                if job['kind']=='backup':
                    destination=self.root/('full-'+job['id']+'.lsb')
                    self.save(folder,job,phase='backing-up')
                    backup_service=self.service(destination,self.args.key_file)
                    backup_service.operation('backup')
                    manifest=self.verify(destination,self.args.key_file)
                    ops.private_write(str(destination)+'.meta.json',json.dumps(self.summary(manifest)))
                    job['archive']=destination.name
                else:
                    safety=self.root/('before-restore-'+job['id']+'.lsb')
                    self.save(folder,job,phase='safety-backup')
                    self.service(safety,self.args.key_file).operation('backup')
                    self.save(folder,job,phase='restoring')
                    service.operation('restore')
                self.save(folder,job,phase='restarting')
                service.start();stopped=False
                self.save(folder,job,state='succeeded',phase='completed',summary=self.summary(manifest))
        except Exception as error:
            if stopped and original is not None and job['kind']=='restore':ops.private_write(self.args.config,original)
            if stopped and service:
                try:service.start()
                except Exception:pass
            message='操作失败，原连接配置和旧数据库已保留'
            if isinstance(error,ops.OpsError) and any(term in str(error) for term in ('authentication','checksum','archive','key','Incomplete','manifest')):
                message='备份密钥不正确、文件损坏或备份不完整'
            self.save(folder,job,state='failed',phase='failed',error=message)
        finally:
            (folder/'recovery.key').unlink(missing_ok=True)
            with self.lock:self.active=None

    def listing(self):
        entries=[]
        for file in sorted(self.root.glob('*.lsb'),key=lambda p:p.stat().st_mtime,reverse=True)[:100]:
            if file.is_symlink() or not NAME.fullmatch(file.name):continue
            item={'id':file.name,'bytes':file.stat().st_size,'createdAt':datetime.datetime.fromtimestamp(file.stat().st_mtime,datetime.timezone.utc).isoformat()}
            metadata=Path(str(file)+'.meta.json')
            if metadata.is_file():
                try:item['summary']=json.loads(metadata.read_text())
                except (ValueError,OSError):pass
            entries.append(item)
        active=self.active
        if active:
            try:
                if json.loads((self.jobs/active/'status.json').read_text())['state']!='running':active=None
            except (OSError,ValueError,KeyError):pass
        return {'available':True,'items':entries,'active':active,'maxUploadBytes':LIMIT}

class Handler(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,*args):pass
    def reply(self,status,value):
        body=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def authorize(self):
        supplied=self.headers.get('Authorization','')
        if not hmac.compare_digest(supplied,'Bearer '+self.server.broker.token):
            self.reply(403,{'error':'Forbidden'});return False
        return True
    def stream(self,path,content_type,filename):
        self.send_response(200);self.send_header('Content-Type',content_type);self.send_header('Content-Disposition','attachment; filename="'+filename+'"');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(path.stat().st_size));self.end_headers()
        with open(path,'rb') as stream:shutil.copyfileobj(stream,self.wfile,ops.BLOCK)
    def do_GET(self):
        if not self.authorize():return
        broker=self.server.broker;url=urlsplit(self.path);query=parse_qs(url.query)
        try:
            if url.path=='/list':return self.reply(200,broker.listing())
            if url.path=='/status':
                _,job=broker.read_job(query.get('id',[''])[0],self.headers.get('X-Job-Ticket',''))
                return self.reply(200,broker.public_job(job))
            if url.path=='/archive':return self.stream(broker.archive(query.get('id',[''])[0]),'application/octet-stream',query['id'][0])
            if url.path=='/key':return self.stream(broker.args.key_file,'text/plain','litestats-recovery.key')
            self.reply(404,{'error':'Not found'})
        except (OSError,ValueError,KeyError,ops.OpsError):self.reply(400,{'error':'Invalid backup request'})
    def do_POST(self):
        if not self.authorize():return
        broker=self.server.broker;path=urlsplit(self.path).path
        try:
            size=int(self.headers.get('Content-Length','-1'))
            if path=='/upload':
                if size<len(ops.MAGIC) or size>LIMIT:raise ops.OpsError('Invalid upload size')
                if shutil.disk_usage(broker.root).free<size+64*1024**2:raise ops.OpsError('Insufficient backup storage space')
                name='upload-'+secrets.token_hex(16)+'.lsb';target=broker.root/name;partial=Path(str(target)+'.partial')
                try:
                    with open(partial,'xb') as output:
                        prefix=self.rfile.read(len(ops.MAGIC))
                        if prefix!=ops.MAGIC:raise ops.OpsError('Invalid archive')
                        output.write(prefix);remaining=size-len(prefix)
                        while remaining:
                            block=self.rfile.read(min(ops.BLOCK,remaining))
                            if not block:raise ops.OpsError('Incomplete upload')
                            output.write(block);remaining-=len(block)
                    os.replace(partial,target)
                finally:partial.unlink(missing_ok=True)
                return self.reply(201,{'id':name,'bytes':size})
            if not 0<=size<=16384:raise ops.OpsError('Invalid request size')
            data=json.loads(self.rfile.read(size))
            if path=='/prepare':return self.reply(201,broker.prepare(data))
            if path=='/activate':return self.reply(202,broker.activate(data['id'],data['ticket']))
            self.reply(404,{'error':'Not found'})
        except (OSError,ValueError,KeyError,ops.OpsError):
            self.close_connection=True;self.reply(400,{'error':'Invalid backup request or operation already running'})

class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads=True

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config',type=Path,required=True);p.add_argument('--socket',type=Path,required=True)
    p.add_argument('--backups',type=Path,required=True);p.add_argument('--key-file',type=Path,required=True)
    p.add_argument('--compose-file',type=Path);p.add_argument('--service');p.add_argument('--health-url')
    p.add_argument('--operator-env',type=Path)
    args=p.parse_args();os.umask(0o077)
    args.config=args.config.resolve();args.backups=args.backups.resolve();args.key_file=args.key_file.resolve()
    if args.operator_env:
        # Operator-only database access never enters the web application's environment.
        values=ops.read_env(args.operator_env)
        for name in ('PGADMIN_URL','PGADMIN_OS_USER','CLICKHOUSE_ADMIN_URL','CLICKHOUSE_USERS_CONFIG'):
            if name in values:os.environ[name]=values[name]
    broker=Broker(args)
    args.socket.parent.mkdir(parents=True,mode=0o755,exist_ok=True)
    if args.socket.exists():
        if not stat.S_ISSOCK(args.socket.stat().st_mode):raise ops.OpsError('Socket path is not a socket')
        args.socket.unlink()
    with Server(str(args.socket),Handler) as server:
        server.broker=broker
        # The socket directory is mounted into the unprivileged application container.
        # Every request additionally needs the private operations bearer token.
        os.chmod(args.socket,0o666)
        server.serve_forever(poll_interval=.2)

if __name__=='__main__':main()
