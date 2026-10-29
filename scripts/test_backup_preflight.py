import importlib.util
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch
from create_backup import main

class Preconditions(unittest.TestCase):
 def test_import_does_not_access_remote_or_create_backups(self):
  with patch('subprocess.run',side_effect=AssertionError('remote call at import')),patch('pathlib.Path.mkdir',side_effect=AssertionError('filesystem mutation at import')):
   spec=importlib.util.spec_from_file_location('backup_import_check',Path(__file__).with_name('create_backup.py'))
   module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 def test_wrong_host_stops_before_inspecting_a_project(self):
  with patch.object(socket,'gethostname',return_value='another-host'):
   with self.assertRaisesRegex(SystemExit,'target_mismatch'):main(repo=Path('/does-not-exist'))
 def test_missing_link_has_a_closed_error(self):
  with tempfile.TemporaryDirectory() as temporary,patch.object(socket,'gethostname',return_value='F.R.I.D.A.Y'):
   with self.assertRaisesRegex(SystemExit,'linked_project_unavailable'):main(repo=Path(temporary))
 def test_missing_tool_does_not_leave_a_started_staging(self):
  with tempfile.TemporaryDirectory() as temporary,patch.object(socket,'gethostname',return_value='F.R.I.D.A.Y'):
   root=Path(temporary);repo=root/'iron-strength-v2';(repo/'supabase/.temp').mkdir(parents=True);(repo/'supabase/.temp/project-ref').write_text('udwhjcnlfqlggblnpchu')
   (repo/'node_modules/.bin').mkdir(parents=True);cli=repo/'node_modules/.bin/supabase';cli.write_text('synthetic');cli.chmod(0o700)
   work=root/'work';work.mkdir(mode=0o700)
   with self.assertRaisesRegex(SystemExit,'native_pg_dump_unavailable'):main(repo=repo)
   self.assertEqual(list(work.iterdir()),[])
