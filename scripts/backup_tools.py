import json,re,shlex

def parse_dump_environment(plan,project_ref):
 names={"PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE"};values={}
 for line in plan.splitlines():
  match=re.match(r"^\s*(?:export\s+)?(PG[A-Z_]+)=(.*)$",line)
  if not match or match.group(1) not in names:continue
  name,raw=match.groups()
  if name in values:raise ValueError("duplicate_connection_field")
  raw=raw.rstrip()
  if raw.endswith("\\"):raw=raw[:-1].rstrip()
  parts=shlex.split(raw,posix=True)
  if len(parts)!=1 or not parts[0]:raise ValueError("invalid_connection_field")
  values[name]=parts[0]
 if set(values)!=names:raise ValueError("missing_connection_field")
 host=values["PGHOST"]
 if not host.endswith((".supabase.co",".supabase.com")):raise ValueError("connection_host_mismatch")
 if project_ref not in host.split(".") and not values["PGUSER"].endswith("."+project_ref):raise ValueError("connection_project_mismatch")
 if values["PGDATABASE"]!="postgres" or values["PGPORT"] not in ("5432","6543"):raise ValueError("connection_database_mismatch")
 return {**values,"PGSSLMODE":"require","PGCONNECT_TIMEOUT":"15","PGOPTIONS":"-c default_transaction_read_only=on -c statement_timeout=120000"}

# pg_dump quotes identifiers predictably; escaped quotes are preserved when mapping to catalog names.
_identifier=r'(?:"((?:[^"]|"")*)"|([a-zA-Z_][a-zA-Z_0-9$]*))'
def relation_names(sql,command):
 pattern=re.compile(r"^\s*"+command+r"\s+"+_identifier+r"\s*\.\s*"+_identifier+r"(?=\s|\()",re.I|re.M)
 return {(m.group(1) if m.group(1) is not None else m.group(2)).replace('""','"')+"."+(m.group(3) if m.group(3) is not None else m.group(4)).replace('""','"') for m in pattern.finditer(sql)}
def copy_row_counts(sql):
 pattern=re.compile(r"^COPY\s+"+_identifier+r"\s*\.\s*"+_identifier+r"\s*\(.*\)\s+FROM\s+stdin;$",re.I)
 counts={};active=None
 for raw in sql.splitlines():
  if active is not None:
   if raw==r"\.":active=None
   else:counts[active]+=1
   continue
  match=pattern.match(raw.strip())
  if match:
   name=(match.group(1) if match.group(1) is not None else match.group(2)).replace('""','"')+"."+(match.group(3) if match.group(3) is not None else match.group(4)).replace('""','"')
   if name in counts:raise ValueError("duplicate_copy_table")
   counts[name]=0;active=name
  elif re.match(r"^\s*COPY\s",raw,re.I):raise ValueError("unsupported_copy_header")
 if active is not None:raise ValueError("unterminated_copy")
 return counts

def verify_dump_coverage(inventory,hashes,schema_sql,data_sql):
 expected={r["schema"]+"."+r["table"] for r in inventory}
 rows={r["name"]:r["rows"] for r in hashes}
 if len(expected)!=len(inventory) or set(rows)!=expected or len(rows)!=len(hashes):raise ValueError("inventory_hash_mismatch")
 if any(type(count) is not int or count<0 for count in rows.values()):raise ValueError("invalid_inventory_count")
 definitions=relation_names(schema_sql,r"CREATE TABLE(?: IF NOT EXISTS)?")
 counts=copy_row_counts(data_sql);copied=set(counts)
 if expected-definitions:raise ValueError("uncovered_schema_definitions")
 if any(count and name not in copied for name,count in rows.items()):raise ValueError("uncovered_nonempty_tables")
 if copied-expected:raise ValueError("unrecognized_dump_tables")
 if any(rows[name]!=count for name,count in counts.items()):raise ValueError("copy_row_count_mismatch")
 return {"tableCount":len(expected),"definedTables":len(expected&definitions),"copiedTables":len(copied),"emptyTablesWithoutCopy":sorted(expected-copied),"allNonemptyTablesCovered":True,"copyRowCountsVerified":True}

def storage_inventory(fetch,page_size=1000):
 if type(page_size) is not int or not 1<=page_size<=1000:raise ValueError("invalid_storage_page_size")
 pending=[""];visited=set();objects={};ids=set()
 while pending:
  prefix=pending.pop()
  if prefix in visited:raise ValueError("duplicate_storage_folder")
  visited.add(prefix);offset=0;names=set()
  while True:
   rows=fetch(prefix,offset,page_size)
   if not isinstance(rows,list) or len(rows)>page_size:raise ValueError("invalid_storage_inventory")
   for row in rows:
    if not isinstance(row,dict):raise ValueError("invalid_storage_entry")
    name=row.get("name")
    if not isinstance(name,str) or not name or name in (".","..") or any(c in name for c in ("/","\\","\x00")):raise ValueError("unsafe_storage_path")
    if name in names:raise ValueError("duplicate_storage_entry")
    names.add(name);full=prefix+"/"+name if prefix else name
    if "id" not in row:raise ValueError("missing_storage_id")
    if row["id"] is None:pending.append(full);continue
    oid=row["id"];metadata=row.get("metadata")
    if not isinstance(oid,str) or not oid or oid in ids or not isinstance(metadata,dict) or type(metadata.get("size")) is not int or metadata["size"]<0:raise ValueError("invalid_storage_object")
    if full in objects:raise ValueError("duplicate_storage_object")
    ids.add(oid);objects[full]={"id":oid,"name":full,"size":metadata["size"]}
   if len(rows)<page_size:break
   offset+=page_size
 return [objects[name] for name in sorted(objects)]

def empty_storage_listing(raw,remote_objects,bucket):
 if remote_objects!=0:return False
 value=raw.decode().strip()
 if value==bucket+"/" or value.lower() in ("","empty bucket","empty bucket.","no objects found","no objects found."):return True
 try:return json.loads(value) in ([],{},None)
 except (ValueError,TypeError):return False

def storage_project_key(rows,project_ref):
 import base64
 if not isinstance(rows,list):raise ValueError('invalid_storage_credentials')
 selected=[r for r in rows if isinstance(r,dict) and r.get('name')=='service_role']
 if len(selected)!=1:raise ValueError('missing_storage_credential')
 value=selected[0].get('api_key')
 if not isinstance(value,str) or len(value)>8192 or value.count('.')!=2:raise ValueError('invalid_storage_credential')
 try:
  part=value.split('.')[1];payload=json.loads(base64.urlsafe_b64decode(part+'='*((-len(part))%4)))
 except (ValueError,TypeError):raise ValueError('invalid_storage_credential') from None
 # This checks the destination of a key supplied by the authenticated CLI. It is
 # not a JWT verifier for authorizing end users.
 if not isinstance(payload,dict) or payload.get('role')!='service_role' or payload.get('ref')!=project_ref:raise ValueError('storage_credential_project_mismatch')
 return value
