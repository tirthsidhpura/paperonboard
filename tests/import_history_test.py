"""Historical enrichment must not invent sessions or erase curated resources."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs

spec = importlib.util.spec_from_file_location('apply_import', Path(__file__).resolve().parents[1] / 'scripts/apply-gtu-import.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
reader_spec = importlib.util.spec_from_file_location('read_import', Path(__file__).resolve().parents[1] / 'scripts/import-gtu.py')
reader = importlib.util.module_from_spec(reader_spec)
reader_spec.loader.exec_module(reader)


class HistoricalImportTests(unittest.TestCase):
    def test_default_reader_keeps_searching_after_recent_results(self):
        scratch = importer.ROOT / '.local'
        scratch.mkdir(exist_ok=True)
        requested = []
        def fetch(_url, data=None):
            if data is None:
                return '''<select id="ContentPlaceHolder1_drpextype"><option value="BE">BE</option></select>
                <select id="ContentPlaceHolder1_ddlsession"><option value="S2026">S2026</option>
                <option value="W2025">W2025</option><option value="S2017">S2017</option></select>'''
            session = parse_qs(data.decode())['ctl00$ContentPlaceHolder1$ddlsession'][0]
            requested.append(session)
            return f'<a href="uploads/{session}/BE/OLD.pdf">Paper</a>'
        with tempfile.TemporaryDirectory(dir=scratch) as folder:
            output = Path(folder) / 'snapshot.json'
            with patch.object(reader, 'fetch', side_effect=fetch), patch('sys.argv', ['import-gtu.py', '--output', str(output)]), contextlib.redirect_stdout(io.StringIO()):
                reader.main()
            snapshot = json.loads(output.read_text())
            self.assertEqual(requested, ['S2026', 'W2025', 'S2017'])
            self.assertEqual(snapshot['scope'], 'all-listed-sessions')
            self.assertEqual(snapshot['courses']['BE']['S2017'], ['uploads/S2017/BE/OLD.pdf'])

    def test_old_sessions_are_added_only_where_the_subject_is_listed(self):
        scratch = importer.ROOT / '.local'
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as folder:
            original_root = importer.ROOT
            importer.ROOT = root = Path(folder)
            self.addCleanup(setattr, importer, 'ROOT', original_root)
            (root / 'data').mkdir()
            (root / 'data/site.json').write_text(json.dumps({'streams': [{'id': 'bachelors'}]}))
            catalog = {'id': 'bachelors', 'name': 'BE', 'examTemplates': [], 'branches': [
                {'id': 'electrical', 'name': 'Electrical Engineering', 'semesters': [
                    {'id': '1', 'name': 'Semester 1', 'subjects': [
                        {'code': 'OLD', 'name': 'Existing subject', 'useExamTemplates': True,
                         'papers': [{'label': 'Notes', 'url': 'https://example.edu/notes.pdf', 'type': 'material'}]},
                        {'code': 'NEW', 'name': 'New subject', 'useExamTemplates': True, 'papers': []},
                    ]},
                ]},
            ]}
            path = root / 'data/bachelors.json'
            path.write_text(json.dumps(catalog))
            snapshot = {'source': 'https://old26.gtu.ac.in/Download1.aspx', 'checkedOn': '2026-10-16',
                        'scope': 'all-listed-sessions', 'courses': {'BE': {
                            'S2026': ['uploads/s2026/BE/OLD.pdf', 'uploads/s2026/BE/NEW.pdf'],
                            'W2020': ['uploads/W2020/BE/OLD.pdf', 'uploads/W2020/BE/RETIRED.pdf'],
                            'S2017': [],
                        }}, 'errors': {'BE': [{'session': 'S2017', 'status': 500}]}}
            with contextlib.redirect_stdout(io.StringIO()):
                importer.apply(snapshot, existing_only=True)
                first = path.read_text(encoding='utf-8')
                importer.apply(snapshot, existing_only=True)
            self.assertEqual(first, path.read_text(encoding='utf-8'))
            result = json.loads(first)
            self.assertEqual(result['archivePolicy'], 'listed-only')
            old, new = result['branches'][0]['semesters'][0]['subjects']
            self.assertFalse(old['useExamTemplates'])
            self.assertFalse(new['useExamTemplates'])
            self.assertEqual([p['label'] for p in old['papers']], ['Notes', 'Summer 2026', 'Winter 2020'])
            self.assertEqual([p['label'] for p in new['papers']], ['Summer 2026'])
            self.assertNotIn('pendingSubjects', result)
            coverage = json.loads((root / 'data/gtu-source.json').read_text())
            self.assertEqual(coverage['courses'][0]['sessionErrors'], snapshot['errors']['BE'])


if __name__ == '__main__':
    unittest.main()
