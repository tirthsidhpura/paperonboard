"""Merge a reviewed official-repository snapshot into editable stream catalogs."""
import json
import sys
from urllib.parse import quote
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXISTING = {'BE': 'bachelors', 'DI': 'diploma', 'BA': 'architecture', 'BP': 'pharma'}
NAMES = json.loads((ROOT / 'data/gtu-program-names.json').read_text(encoding='utf-8'))['names']

def apply(snapshot):
    site_path = ROOT / 'data/site.json'
    site = json.loads(site_path.read_text(encoding='utf-8'))
    summary = {'source': snapshot['source'], 'checkedOn': snapshot['checkedOn'], 'courses': []}
    added = 0
    for code, sessions in snapshot['courses'].items():
        stream_id = EXISTING.get(code, 'gtu-' + code.lower())
        file = ROOT / f'data/{stream_id}.json'
        catalog = json.loads(file.read_text(encoding='utf-8')) if file.exists() else {
            'id': stream_id, 'name': NAMES.get(code, f'GTU course {code}'),
            'examTemplates': [], 'branches': [], 'imported': True,
        }
        catalog.update(source=snapshot['source'], gtuCourseCode=code, checkedOn=snapshot['checkedOn'])
        subjects = {}
        for branch in catalog['branches']:
            for semester in branch['semesters']:
                for subject in semester['subjects']:
                    subjects.setdefault(subject['code'], []).append(subject)
        for subject in catalog.get('pendingSubjects', []):
            subjects.setdefault(subject['code'], []).append(subject)
        missing = []
        for session, links in sessions.items():
            label = ('Summer ' if session.startswith('S') else 'Winter ') + session[1:]
            for link in links:
                parts = link.split('/')
                if len(parts) != 4 or parts[0] != 'uploads' or parts[2] != code or parts[1].upper() != session:
                    raise ValueError(f'Unexpected official paper path: {link}')
                subject_code = Path(parts[3]).stem
                if subject_code not in subjects:
                    subject = {'code': subject_code, 'name': f'Subject {subject_code}', 'useExamTemplates': False, 'papers': []}
                    missing.append(subject)
                    subjects[subject_code] = [subject]
                for subject in subjects[subject_code]:
                    relative = '/'.join(quote(part, safe='%{}') for part in parts[1:])
                    if not any(p.get('path', '').casefold() == relative.casefold() or p.get('url', '').endswith('/' + link) for p in subject['papers']):
                        subject['papers'].append({'label': label, 'urlVersion': 'v1', 'path': relative, 'type': 'paper'})
                        added += 1
        if missing:
            # A paper is published in the semester flow only after its header is verified.
            catalog.setdefault('pendingSubjects', []).extend(sorted(missing, key=lambda s: s['code']))
        if not any(s['id'] == stream_id for s in site['streams']):
            site['streams'].append({'id': stream_id, 'name': catalog['name'], 'shortName': code,
                                    'description': f'GTU official repository · Course {code}', 'file': f'data/{stream_id}.json'})
        file.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        summary['courses'].append({'code': code, 'id': stream_id, 'papersListed': sum(map(len, sessions.values())),
                                   'sessionsWithListings': [s for s, links in sessions.items() if links],
                                   'sessionsChecked': list(sessions)})
    summary['limitations'] = 'GTU sometimes returns server errors for session/course searches. Zero retrieved listings does not establish that a course has no papers. Subject names, branches and semesters were not inferred from codes. Existing curated catalogs are preserved.'
    (ROOT / 'data/gtu-source.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    site_path.write_text(json.dumps(site, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Registered {len(site["streams"])} courses; merged {added} resource records.')

if __name__ == '__main__':
    apply(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))
