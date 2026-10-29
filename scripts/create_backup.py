import os,sys,json,hashlib,subprocess,socket,datetime,uuid,re,shutil
from backup_tools import parse_dump_environment,verify_dump_coverage,storage_inventory,storage_project_key
from pathlib import Path,PurePosixPath
def main(repo=None,purpose="manual"):
 os.umask(0o077)
 REPO=(repo or Path(__file__).resolve().parent.parent).resolve()
 WORK=REPO.parent/'work'; REF='udwhjcnlfqlggblnpchu'; CLI=REPO/'node_modules/.bin/supabase'
 if socket.gethostname()!='F.R.I.D.A.Y':raise SystemExit('target_mismatch')
 try:linked=(REPO/'supabase/.temp/project-ref').read_text().strip()
 except OSError:raise SystemExit('linked_project_unavailable') from None
 if linked!=REF:raise SystemExit('target_mismatch')
 env={**os.environ,'SUPABASE_EXPERIMENTAL_STACK':'1','SUPABASE_STORAGE_VECTOR_ENABLED':'false'}
 PG_DUMP=WORK/'supabase-home/cache/stack/slim-services/postgres/17.11.0.004-r1/linux-amd64/bin/pg_dump'
 if not PG_DUMP.is_file():raise SystemExit('native_pg_dump_unavailable')
 try:version=subprocess.run([str(PG_DUMP),'--version'],capture_output=True,text=True,timeout=10)
 except (OSError,subprocess.TimeoutExpired):raise SystemExit('native_pg_dump_unavailable') from None
 if version.returncode or not re.search(r'PostgreSQL\) 17\.',version.stdout):raise SystemExit('native_pg_dump_version_mismatch')
 if not CLI.is_file() or not os.access(CLI,os.X_OK):raise SystemExit('supabase_cli_unavailable')
 if not (REPO/'scripts/package-backup.py').is_file():raise SystemExit('backup_packager_unavailable')
 if not WORK.is_dir() or WORK.is_symlink() or WORK.stat().st_uid!=os.getuid():raise SystemExit('private_workspace_unavailable')
 identifier='backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
 stage=WORK/identifier;stage.mkdir(mode=0o700)
 (STAGE_RECORD:=WORK/(identifier+'-state.json')).write_text(json.dumps({'stage':str(stage),'status':'started','remoteWrites':False}))

 def native_dump(name,options):
  if (REPO/'supabase/.temp/project-ref').read_text().strip()!=REF:raise RuntimeError('target_changed')
  fresh_plan=run(name+'-connection-plan',['db','dump','--linked','--project-ref',REF,'--schema','auth,storage,extensions','--dry-run']).decode()
  pg_env=parse_dump_environment(fresh_plan,REF)
  del fresh_plan
  output=stage/(name+'.sql')
  with output.open('wb') as target:
   result=subprocess.run([str(PG_DUMP),'--no-password','--role=postgres','--quote-all-identifiers',*options],env={**env,**pg_env},cwd=REPO,stdout=target,stderr=subprocess.PIPE,timeout=180)
  save(name+'-native.log',result.stderr)
  if result.returncode:raise RuntimeError(name+'_native_failed')
  if not output.is_file() or output.stat().st_size==0 or output.stat().st_size>40*1024*1024:raise RuntimeError(name+'_size_invalid')
  output.chmod(0o600)

 def save(name,data):
  p=stage/name;p.write_bytes(data if isinstance(data,bytes) else data.encode());p.chmod(0o600);return p
 def run(name,args,maximum=40*1024*1024):
  if (REPO/'supabase/.temp/project-ref').read_text().strip()!=REF:raise RuntimeError('target_changed')
  result=subprocess.run([str(CLI),*args],cwd=REPO,env=env,capture_output=True,timeout=180)
  save(name+'.log',result.stderr)
  if len(result.stdout)>maximum:raise RuntimeError(name+'_output_limit')
  if result.returncode!=0:
   save(name+'-failed-output.txt',result.stdout);raise RuntimeError(name+'_failed')
  return result.stdout

 def query(name,sql):
  p=save(name+'.sql',sql)
  raw=run(name,['db','query','--linked','--project-ref',REF,'--file',str(p),'--output','json'])
  save(name+'.json',raw)
  result=json.loads(raw)
  if not isinstance(result,dict) or 'rows' not in result:raise RuntimeError(name+'_format')
  return result

 def one(name,sql,key):
  rows=query(name,sql)['rows']
  if len(rows)!=1 or key not in rows[0]:raise RuntimeError(name+'_shape')
  return rows[0][key]

 def load_storage_key():
  if (REPO/'supabase/.temp/project-ref').read_text().strip()!=REF:raise RuntimeError('target_changed')
  result=subprocess.run([str(CLI),'projects','api-keys','--project-ref',REF,'--reveal','--output','json'],cwd=REPO,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=60)
  if result.returncode or len(result.stdout)>4*1024*1024:raise RuntimeError('storage_credentials_unavailable')
  try:return storage_project_key(json.loads(result.stdout),REF)
  except (ValueError,TypeError):raise RuntimeError('storage_credentials_invalid') from None

 def storage_page(prefix,offset,limit):
  import urllib.request
  class NoRedirect(urllib.request.HTTPRedirectHandler):
   def redirect_request(self,*args,**kwargs):return None
  request=urllib.request.Request('https://'+REF+'.supabase.co/storage/v1/object/list/progress-photos',method='POST',data=json.dumps({'prefix':prefix,'offset':offset,'limit':limit,'sortBy':{'column':'name','order':'asc'}}).encode(),headers={'apikey':storage_key,'Authorization':'Bearer '+storage_key,'Content-Type':'application/json'})
  try:
   with urllib.request.build_opener(NoRedirect).open(request,timeout=60) as response:
    if response.status!=200:raise RuntimeError('storage_inventory_failed')
    data=response.read(4*1024*1024+1)
    if len(data)>4*1024*1024:raise RuntimeError('storage_inventory_too_large')
    return json.loads(data)
  except Exception:raise RuntimeError('storage_inventory_failed') from None

 scopes="('public','auth','storage','supabase_migrations')"
 inventory_sql=f'''select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'kind',c.relkind) order by n.nspname,c.relname),'[]'::jsonb) as inventory
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname in {scopes} and c.relkind in ('r','p');'''
 policies_sql=f'''select jsonb_build_object(
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname),'[]'::jsonb) from pg_catalog.pg_policies p where schemaname in {scopes}),
 'tables',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'owner',r.rolname,'acl',c.relacl::text) order by n.nspname,c.relname),'[]'::jsonb) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_roles r on r.oid=c.relowner where n.nspname in {scopes} and c.relkind in ('r','p','v','m','S')),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'number',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) order by n.nspname,c.relname,a.attnum),'[]'::jsonb) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in {scopes} and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',x.conname,'definition',pg_catalog.pg_get_constraintdef(x.oid,true)) order by n.nspname,c.relname,x.conname),'[]'::jsonb) from pg_catalog.pg_constraint x join pg_catalog.pg_class c on c.oid=x.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in {scopes}),
 'indexes',(select coalesce(jsonb_agg(to_jsonb(i) order by i.schemaname,i.tablename,i.indexname),'[]'::jsonb) from pg_catalog.pg_indexes i where i.schemaname in {scopes}),
 'functions',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',pg_catalog.pg_get_function_identity_arguments(p.oid),'owner',r.rolname,'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,'definitionHash',md5(pg_catalog.pg_get_functiondef(p.oid))) order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)),'[]'::jsonb) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace join pg_catalog.pg_roles r on r.oid=p.proowner where n.nspname in {scopes} and p.prokind in ('f','p')),
 'schemas',(select coalesce(jsonb_agg(jsonb_build_object('name',n.nspname,'owner',r.rolname,'acl',n.nspacl::text) order by n.nspname),'[]'::jsonb) from pg_catalog.pg_namespace n join pg_catalog.pg_roles r on r.oid=n.nspowner where n.nspname in {scopes})
 ) as jsonb_build_object;'''
 audit_sql='''select jsonb_build_object('migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'buckets',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'public',public) order by id),'[]'::jsonb) from storage.buckets),
 'objects',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'name',name,'metadata',metadata) order by bucket_id,name),'[]'::jsonb) from storage.objects),
 'vaultSecrets',(select count(*) from vault.secrets),
 'databaseMetadata',(select jsonb_build_object('owner',pg_get_userbyid(datdba),'collation',datcollate,'ctype',datctype,'serverVersion',current_setting('server_version')) from pg_database where datname=current_database()),
 'publicTablesWithoutRls',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity)) as audit;'''
 try:
  projects=json.loads(run('projects',['projects','list','--output-format','json']))
  projects=projects if isinstance(projects,list) else projects.get('projects',projects.get('rows',[]))
  matches=[p for p in projects if p.get('id')==REF or p.get('ref')==REF]
  if len(matches)!=1 or matches[0].get('name')!='iron-strength':raise RuntimeError('project_identity_mismatch')
  inventory=one('inventory',inventory_sql,'inventory')
  if not inventory:raise RuntimeError('empty_inventory')
  before_policies=one('remote-policies',policies_sql,'jsonb_build_object')
  audit=one('audit',audit_sql,'audit')
  if not audit['databaseMetadata']['serverVersion'].startswith('17.'):raise RuntimeError('remote_postgres_version_mismatch')
  local_versions={p.name.split('_',1)[0] for p in (REPO/'supabase/migrations').glob('*.sql')}
  if not set(audit['migrations']).issubset(local_versions):raise RuntimeError('unrecognized_migration')
  bucket=[b for b in audit['buckets'] if b['id']=='progress-photos']
  if len(bucket)!=1 or bucket[0]['public'] is not False:raise RuntimeError('storage_not_private')
  if audit['publicTablesWithoutRls']!=0:raise RuntimeError('public_table_without_rls')
  if audit['vaultSecrets']!=0:raise RuntimeError('uncovered_vault_secrets')
  if any(o['bucket']!='progress-photos' for o in audit['objects']):raise RuntimeError('uncovered_storage_bucket')
  def quoted(value):return '"'+value.replace('"','""')+'"'
  pieces=[]
  for item in inventory:
   schema,name=item['schema'],item['table'];literal=(schema+'.'+name).replace("'","''")
   pieces.append(f"select '{literal}' as name,count(*)::integer as rows,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as hash from {quoted(schema)}.{quoted(name)} t")
  hashes_sql='select jsonb_agg(x order by x.name) as jsonb_agg from ('+'\nunion all\n'.join(pieces)+') x;'
  before=one('remote-hashes',hashes_sql,'jsonb_agg')
  if {i['name'] for i in before}!={i['schema']+'.'+i['table'] for i in inventory}:raise RuntimeError('uncovered_table')
  for excluded in ['storage.buckets_vectors','storage.vector_indexes']:
   if any(i['name']==excluded and i['rows']!=0 for i in before):raise RuntimeError('uncovered_vector_data')
  print(json.dumps({'phase':'inventory_verified','tables':len(before),'migrations':len(audit['migrations']),'objects':len(audit['objects'])}),flush=True)
  commands=[('roles',['--role-only']),('schema',[]),('managed-schema',['--schema','auth,storage,extensions']),('data',['--data-only','--use-copy','-x','storage.buckets_vectors,storage.vector_indexes']),('history-schema',['--schema','supabase_migrations']),('history-data',['--schema','supabase_migrations','--data-only','--use-copy'])]
  manifest=[]
  for name,args in commands:
   output=stage/(name+'.sql')
   if name=='managed-schema':native_dump(name,['--schema-only','--schema=auth','--schema=storage','--schema=extensions'])
   elif name=='data':native_dump(name,['--data-only','--schema=public','--schema=auth','--schema=storage'])
   else:run(name,['db','dump','--linked','--project-ref',REF,*args,'-f',str(output)])
   if not output.is_file() or output.is_symlink() or output.stat().st_size==0:raise RuntimeError(name+'_empty')
   output.chmod(0o600);data=output.read_bytes();manifest.append({'name':output.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
   print(json.dumps({'phase':name,'status':'saved'}),flush=True)
  coverage=verify_dump_coverage(inventory,before,'\n'.join((stage/(name+'.sql')).read_text() for name in ['schema','managed-schema','history-schema']),'\n'.join((stage/(name+'.sql')).read_text() for name in ['data','history-data']))
  save('coverage.json',json.dumps(coverage,indent=2)+'\n')
  print(json.dumps({'phase':'coverage_verified','tables':coverage['tableCount'],'allNonemptyTablesCovered':coverage['allNonemptyTablesCovered']}),flush=True)
  save('manifest.json',json.dumps(manifest,indent=2)+'\n')
  # Fetch the actual Storage API inventory, independently of SQL and CLI text formatting.
  storage_key=load_storage_key()
  objects=audit['objects']
  listed=storage_inventory(storage_page)
  expected_inventory=sorted([{'id':o['id'],'name':o['name'],'size':int(o['metadata']['size'])} for o in objects],key=lambda o:o['name'])
  if listed!=expected_inventory:raise RuntimeError('storage_inventory_mismatch')
  save('storage-api-before.json',json.dumps(listed,indent=2)+'\n')
  photo_hashes=[]
  for index,obj in enumerate(objects):
   path=PurePosixPath(obj['name'])
   if path.is_absolute() or '..' in path.parts or '\\' in obj['name'] or str(path)!=obj['name']:raise RuntimeError('unsafe_object_path')
   target=stage/'photos'/Path(*path.parts);target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
   verify=stage/'photo-verification'/Path(*path.parts);verify.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
   source='ss:///progress-photos/'+obj['name']
   for suffix,destination in [('download',target),('verify',verify)]:
    run('photo-'+str(index)+'-'+suffix,['storage','cp','--linked','--project-ref',REF,'--experimental',source,str(destination)])
    destination.chmod(0o600)
   data=target.read_bytes();digest=hashlib.sha256(data).hexdigest()
   if digest!=hashlib.sha256(verify.read_bytes()).hexdigest():raise RuntimeError('photo_bytes_changed')
   expected=(obj.get('metadata') or {}).get('size')
   if expected is not None and len(data)!=int(expected):raise RuntimeError('photo_size_mismatch')
   photo_hashes.append({'name':obj['name'],'bytes':len(data),'sha256':digest})
  inventory_after=one('inventory-after',inventory_sql,'inventory')
  after_policies=one('remote-policies-after',policies_sql,'jsonb_build_object')
  after_audit=one('audit-after',audit_sql,'audit')
  after=one('remote-hashes-after',hashes_sql,'jsonb_agg')
  listed_after=storage_inventory(storage_page)
  save('storage-api-after.json',json.dumps(listed_after,indent=2)+'\n')
  if inventory_after!=inventory or after_policies!=before_policies or after_audit!=audit or after!=before or listed_after!=listed:raise RuntimeError('changed_during_backup')
  del storage_key
  storage={'bucket':'progress-photos','remoteObjects':len(objects),'verified':True,'sqlInventoryMatched':True,'storageApiInventoryMatched':True,'secondDownloadHashesMatched':True if objects else None,'photos':photo_hashes}
  save('storage-verification.json',json.dumps(storage,indent=2)+'\n')
  # Include complete current schema/grant evidence in the encrypted audit, not only the old fixed table list.
  audit_file=json.loads((stage/'audit.json').read_text());audit_file['currentInventory']=inventory;audit_file['schemaPermissionsBeforeAfterIdentical']=True
  audit_file['allCurrentTablesCovered']=True;audit_file['coverage']=coverage;save('audit.json',json.dumps(audit_file,indent=2)+'\n')
  print(json.dumps({'phase':'consistency_verified','tables':len(before),'rows':sum(i['rows'] for i in before),'objects':len(objects)}),flush=True)
  result=subprocess.run([sys.executable,'scripts/package-backup.py',str(stage)],cwd=REPO,capture_output=True,timeout=180)
  save('package.log',result.stderr)
  if result.returncode:save('package-failed.txt',result.stdout);raise RuntimeError('packaging_failed')
  proof=json.loads(result.stdout)
  private_proof=json.loads((stage/'encrypted-copy-proof.json').read_text())
  cipher=Path(proof['destination'])/proof['cipherFile'];manifest_path=cipher.with_name(cipher.name.replace('.tar.gz.gpg','.json'))
  if json.loads(manifest_path.read_text())!=private_proof or hashlib.sha256(cipher.read_bytes()).hexdigest()!=proof['cipherSha256']:raise RuntimeError('final_manifest_mismatch')
  proof.update({'projectRef':REF,'declaredPurpose':purpose,'scheduledWeeklyExecution':None,'migrations':len(audit['migrations']),'currentTablesCovered':True,'schemaPermissionsStable':True,'storageInventoryStable':True,'newDatabaseRestorePerformed':False,'stagingRemoved':False})
  proof_path=WORK/(identifier+'-proof.json');proof_path.write_text(json.dumps(proof,indent=2)+'\n');proof_path.chmod(0o600)
  # Only this newly created private staging is eligible for cleanup; never historical work folders.
  if stage.parent!=WORK or stage.name!=identifier or not identifier.startswith('backup-') or stage.is_symlink():raise RuntimeError('cleanup_scope')
  shutil.rmtree(stage)
  proof['stagingRemoved']=True;proof_path.write_text(json.dumps(proof,indent=2)+'\n')
  STAGE_RECORD.write_text(json.dumps({'status':'complete','proof':str(proof_path),'stagingRemoved':True,'remoteWrites':False})+'\n')
  print(json.dumps({'status':'complete','cipherFile':proof['cipherFile'],'createdAt':proof['createdAt'],'expiresAt':proof['expiresAt'],'tables':proof['tables'],'rows':proof['rows'],'objects':proof['remoteObjects'],'filesVerified':proof['filesVerified'],'sqlRestorePerformed':False,'stagingRemoved':True,'proofFile':str(proof_path)}),flush=True)
 except Exception as exc:
  message=str(exc);code=message if isinstance(exc,(RuntimeError,ValueError)) and re.fullmatch(r'[a-z_][a-z0-9_]{0,100}',message) else type(exc).__name__
  STAGE_RECORD.write_text(json.dumps({'stage':str(stage),'status':'failed','code':code,'remoteWrites':False})+'\n')
  print(json.dumps({'status':'failed','code':code,'stagingRetained':True,'stateFile':str(STAGE_RECORD)}),flush=True)
  sys.exit(1)

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser(description='Respaldo privado de Iron Strength en F.R.I.D.A.Y.; solo lecturas remotas.')
 parser.add_argument('--purpose',choices=['manual','pre-migration','weekly'],default='manual')
 main(purpose=parser.parse_args().purpose)
