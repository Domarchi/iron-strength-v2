import unittest
from backup_tools import parse_dump_environment, verify_dump_coverage, empty_storage_listing
REF="abcdefghijklmnopqrst"
class BackupGuards(unittest.TestCase):
 def test_environment_is_literal_and_project_bound(self):
  plan="\n".join(["# generated plan",f'PGHOST="db.{REF}.supabase.co"',"PGPORT=5432","PGUSER=cli_login_postgres","PGPASSWORD='synthetic $(never execute); value'","PGDATABASE=postgres"])
  env=parse_dump_environment(plan,REF)
  self.assertEqual(env["PGPASSWORD"],"synthetic $(never execute); value")
  self.assertEqual(env["PGSSLMODE"],"require")
  for bad in [plan.replace(REF,"other-project"),plan.replace("PGDATABASE=postgres","PGDATABASE=other"),plan.replace("PGPORT=5432","PGPORT=22"),plan.replace("PGUSER=cli_login_postgres","PGUSER=cli_login_postgres\nPGUSER=other"),plan.replace("PGPASSWORD='synthetic $(never execute); value'","")]:
   with self.assertRaises(ValueError):parse_dump_environment(bad,REF)
 def test_schema_and_every_nonempty_table_are_required(self):
  inventory=[{"schema":"auth","table":"schema_migrations","kind":"r"},{"schema":"storage","table":"migrations","kind":"r"},{"schema":"storage","table":"vector_indexes","kind":"r"}]
  hashes=[{"name":"auth.schema_migrations","rows":2},{"name":"storage.migrations","rows":3},{"name":"storage.vector_indexes","rows":0}]
  ddl='CREATE TABLE "auth"."schema_migrations" (version text);\nCREATE TABLE storage.migrations (id int);\nCREATE TABLE storage.vector_indexes(id int);'
  data='COPY "auth"."schema_migrations" (version) FROM stdin;\na\nb\n\\.\nCOPY storage.migrations(id) FROM stdin;\n1\n2\n3\n\\.'
  result=verify_dump_coverage(inventory,hashes,ddl,data)
  self.assertEqual(result["tableCount"],3)
  self.assertEqual(result["emptyTablesWithoutCopy"],["storage.vector_indexes"])
  for schema,body in [(ddl.replace('CREATE TABLE storage.vector_indexes(id int);',''),data),(ddl,data.replace('COPY storage.migrations(id) FROM stdin;',''))]:
   with self.assertRaises(ValueError):verify_dump_coverage(inventory,hashes,schema,body)
  with self.assertRaises(ValueError):verify_dump_coverage(inventory,hashes[:2],ddl,data)
 def test_empty_storage_requires_sql_zero_and_an_exact_known_format(self):
  for raw in [b'progress-photos/\n',b'[]',b'Empty bucket.',b'']:
   self.assertTrue(empty_storage_listing(raw,0,"progress-photos"))
  for raw,count in [(b'progress-photos/\nsecret.jpg',0),(b'progress-photos/',1),(b'other/',0),(b'unknown',0)]:
   self.assertFalse(empty_storage_listing(raw,count,"progress-photos"))



class FullCopyCounts(unittest.TestCase):
 def test_no_partial_copy_or_duplicate_table_is_accepted(self):
  inventory=[{"schema":"auth","table":"schema_migrations","kind":"r"}]
  hashes=[{"name":"auth.schema_migrations","rows":2}]
  ddl='CREATE TABLE auth.schema_migrations(version text);'
  complete='COPY auth.schema_migrations(version) FROM stdin;\nfirst\nsecond\n\\.\n'
  self.assertTrue(verify_dump_coverage(inventory,hashes,ddl,complete)["copyRowCountsVerified"])
  for bad in [complete.replace('second\n',''),complete.replace('\\.\n',''),complete+complete]:
   with self.assertRaises(ValueError):verify_dump_coverage(inventory,hashes,ddl,bad)
 def test_copy_marker_in_value_does_not_start_another_table(self):
  inventory=[{"schema":"public","table":"notes","kind":"r"}]
  hashes=[{"name":"public.notes","rows":1}]
  data='COPY public.notes(body) FROM stdin;\nCOPY public.unknown(body) FROM stdin;\n\\.\n'
  self.assertTrue(verify_dump_coverage(inventory,hashes,'CREATE TABLE public.notes(body text);',data)["copyRowCountsVerified"])
 def test_header_without_from_stdin_is_not_coverage(self):
  with self.assertRaises(ValueError):verify_dump_coverage([{"schema":"public","table":"x"}], [{"name":"public.x","rows":1}], 'CREATE TABLE public.x(n text);', 'COPY public.x(n) TO stdout;')

class CompleteStorageInventory(unittest.TestCase):
 def test_recursive_pagination_names_and_sizes(self):
  from backup_tools import storage_inventory
  requests=[]
  def fetch(prefix,offset,limit):
   requests.append((prefix,offset,limit))
   return {('',0):[{"id":None,"name":"folder"},{"id":"file1","name":"root.webp","metadata":{"size":3}}],('',2):[],('folder',0):[{"id":"file2","name":"x y.webp","metadata":{"size":8}}]}.get((prefix,offset),[])
  self.assertEqual(storage_inventory(fetch,page_size=2),[{"id":"file2","name":"folder/x y.webp","size":8},{"id":"file1","name":"root.webp","size":3}])
  self.assertIn(('',2,2),requests)
 def test_rejects_traversal_malformed_and_duplicate_entries(self):
  from backup_tools import storage_inventory
  for entries in [[{"id":"x","name":"../private","metadata":{"size":1}}],[{"id":"x","name":"a/b","metadata":{"size":1}}],[{"id":"x","name":"a","metadata":{"size":-1}}],[{"id":"x","name":"a","metadata":None}],[{"id":"x","name":"a","metadata":{"size":1}},{"id":"y","name":"a","metadata":{"size":1}}],{"error":"denied"}]:
   with self.assertRaises(ValueError):storage_inventory(lambda *args:entries)
 def test_empty_response_is_valid_but_does_not_claim_photo_bytes(self):
  from backup_tools import storage_inventory
  self.assertEqual(storage_inventory(lambda *args:[]),[])

class StorageCredential(unittest.TestCase):
 def test_service_key_must_match_project_and_role_and_stays_literal(self):
  from backup_tools import storage_project_key
  import base64,json
  def token(body):return 'eyJhbGciOiJIUzI1NiJ9.'+base64.urlsafe_b64encode(json.dumps(body).encode()).decode().rstrip('=')+'.synthetic-signature'
  good=token({'role':'service_role','ref':REF})
  self.assertEqual(storage_project_key([{'name':'service_role','api_key':good}],REF),good)
  for bad in [[],[{'name':'service_role','api_key':'********'}],[{'name':'service_role','api_key':token({'role':'anon','ref':REF})}],[{'name':'service_role','api_key':token({'role':'service_role','ref':'other'})}],[{'name':'service_role','api_key':good}]*2]:
   with self.assertRaises(ValueError):storage_project_key(bad,REF)

if __name__=="__main__":unittest.main()
