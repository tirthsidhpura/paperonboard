"""One-time import of the original subject pages. Run before archiving legacy files."""
import html
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT if (ROOT / 'coarse').exists() else ROOT / 'legacy-private'
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)

def clean(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', value))).strip()

labels = {
    'computer': 'Computer Engineering', 'computerengineer': 'Computer Engineering',
    'automobile': 'Automobile Engineering', 'automobileengineer': 'Automobile Engineering',
    'aeronauticals': 'Aeronautical Engineering', 'civilengineering': 'Civil Engineering',
    'electricalengineeriing': 'Electrical Engineering', 'electricalengineer': 'Electrical Engineering',
    'informationtechnology': 'Information & Communication Technology',
    'information&technology': 'Information & Communication Technology',
    'electronics&communication': 'Electronics & Communication Engineering',
    'electronics&communicationengineering': 'Electronics & Communication Engineering',
    'electronicsengineer': 'Electronics Engineering', 'mechanicalengineering': 'Mechanical Engineering',
    'mechanicalengineer': 'Mechanical Engineering', 'chemicalengineering': 'Chemical Engineering',
    'bio-medicalengineering': 'Biomedical Engineering', 'bio-technology': 'Biotechnology',
    'architecture': 'Architecture', 'B-pharm': 'Pharmacy',
}
streams = [('diploma', 'Diploma', 'DI'), ('bachelors', 'Bachelor of Engineering', 'BE'),
           ('architecture', 'Bachelor of Architecture', None), ('pharma', 'Bachelor of Pharmacy', 'BP')]
report = {'subjects': 0, 'directLinks': 0, 'skipped': [], 'sourcePages': []}
for stream, title, folder in streams:
    catalog = {'id': stream, 'name': title, 'examTemplates': [], 'branches': []}
    if folder:
        sessions = [('Winter 2025', 'w2025'), ('Summer 2025', 's2025'), ('Winter 2024', 'W2024' if folder != 'DI' else 'w2024'),
                    ('Summer 2024', 'S2024' if folder != 'DI' else 's2024'), ('Winter 2023', 'W2023' if folder != 'DI' else 'w2023'),
                    ('Summer 2023', 'S2023' if folder != 'DI' else 's2023'), ('Winter 2022', 'W2022' if folder != 'DI' else 'w2022')]
        if folder != 'BP':
            sessions += [('Summer 2022', 'S2022'), ('Winter 2021', 'W2021')]
        catalog['examTemplates'] = [{'label': label, 'url': f'https://old26.gtu.ac.in/uploads/{session}/{folder}/{{code}}.pdf'} for label, session in sessions]
    for path in sorted((SOURCE / 'coarse' / stream).glob('*.html')):
        text = path.read_text(encoding='utf-8', errors='replace')
        branch = {'id': re.sub('[^a-z0-9]+', '-', path.stem.lower()).strip('-'), 'name': labels.get(path.stem, path.stem), 'semesters': []}
        sections = list(re.finditer(r'<section\b[^>]*\bid=["\'](sem\d+)["\'][^>]*>', text, re.I))
        buttons = list(re.finditer(r'<button\b[^>]*class=["\']sub["\'][^>]*>(.*?)</button>', text, re.S | re.I))
        for i, button in enumerate(buttons):
            preceding = [s for s in sections if s.start() < button.start()]
            if not preceding:
                report['skipped'].append(f'{path.name}: {clean(button[1])}')
                continue
            section = preceding[-1]
            number = re.search(r'\d+', section[1])[0]
            section_end = next((s.start() for s in sections if s.start() > section.start()), len(text))
            heading = clean(text[section.end():button.start()])
            combined = number == '1' and bool(re.search(r'(?:Sem\s*)?1\s*&\s*2', heading, re.I))
            semid = '1-2' if combined else number
            semester = next((s for s in branch['semesters'] if s['id'] == semid), None)
            if semester is None:
                semester = {'id': semid, 'name': 'Semesters 1 & 2' if combined else f'Semester {number}', 'subjects': []}
                branch['semesters'].append(semester)
            body = text[button.end():min(buttons[i+1].start() if i+1 < len(buttons) else len(text), section_end)]
            anchors = re.findall(r'<a\b[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', body, re.S | re.I)
            raw_name = clean(button[1])
            code_match = re.search(r'([A-Za-z0-9]*\d[A-Za-z0-9]*)\s*$', raw_name)
            code = code_match[1] if code_match else ''
            latest = False
            papers = []
            for href, label in anchors:
                href = html.unescape(href).strip()
                if 'questionpaper' in href and '.php' in href:
                    latest = True
                    query = parse_qs(urlsplit(href).query)
                    code = query.get('qpid', [code])[0].strip()
                elif href.startswith(('https://', 'http://')) and href not in [p['url'] for p in papers]:
                    papers.append({'label': clean(label) or 'Question paper', 'url': href, 'type': 'paper'})
            if not code:
                # Some original headings omit a code that is present in their paper labels.
                for paper in papers:
                    inferred = re.search(r'\b([A-Z0-9]{7,10})\s*$', paper['label'])
                    if inferred and any(char.isdigit() for char in inferred[1]):
                        code = inferred[1]
                        break
            if not code:
                report['skipped'].append(f'{path.name}: {raw_name}')
                continue
            name = re.sub(r'\s*[-–:]?\s*[A-Za-z0-9]*\d[A-Za-z0-9]*\s*$', '', raw_name).strip(' -–:') or raw_name
            existing = next((s for s in semester['subjects'] if s['code'] == code), None)
            if existing:
                for paper in papers:
                    if paper['url'] not in [p['url'] for p in existing['papers']]:
                        existing['papers'].append(paper)
                existing['useExamTemplates'] |= latest
            else:
                semester['subjects'].append({'code': code, 'name': name, 'useExamTemplates': latest, 'papers': papers})
            report['subjects'] += 1
            report['directLinks'] += len(papers)
        if branch['semesters']:
            catalog['branches'].append(branch)
        report['sourcePages'].append(path.relative_to(SOURCE).as_posix())
    (DATA / f'{stream}.json').write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
(DATA / 'migration-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
