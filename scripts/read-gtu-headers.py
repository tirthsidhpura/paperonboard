"""Read official PDF headers and cache verified subject/semester metadata locally."""
import concurrent.futures, io, json, logging, re, sys, time, urllib.request
from pathlib import Path
from pypdf import PdfReader
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.local/gtu-subject-metadata.json'
logging.getLogger('pypdf').setLevel(logging.ERROR)
from gtu_headers import parse_header

def main():
    cache = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}
    if not cache and (ROOT/'data/gtu-subjects.json').exists():
        verified = json.loads((ROOT/'data/gtu-subjects.json').read_text(encoding='utf-8'))['subjects']
        cache = {key: {'source': value['source'], 'metadata': {k: value[k] for k in ['periodType', 'period', 'name']}} for key, value in verified.items()}
    CACHE.parent.mkdir(exist_ok=True)
    jobs = {}
    site = json.loads((ROOT/'data/site.json').read_text(encoding='utf-8'))
    for stream in site['streams']:
        catalog = json.loads((ROOT/stream['file']).read_text(encoding='utf-8'))
        groups = [[subject for subject in semester['subjects'] if subject.get('verificationSource') or branch.get('generatedCourse') or branch['id'] in {'official-papers', 'additional-papers'}] for branch in catalog['branches'] for semester in branch['semesters']]
        groups.append(catalog.get('pendingSubjects', []))
        for group in groups:
            for subject in group:
                key = catalog['gtuCourseCode'] + '/' + subject['code']
                if key in cache and cache[key].get('metadata'): continue
                links = ['https://old26.gtu.ac.in/uploads/' + p['path'] for p in subject['papers'] if p.get('path')]
                jobs[key] = links[:2]
    # Complete smaller new programs first, then the larger curated-stream additions.
    jobs = dict(sorted(jobs.items(), key=lambda item: (item[0].split('/')[0] in {'BE', 'DI'}, item[0].split('/')[0] != 'MC', item[0])))
    def read(job):
        key, links = job
        for url in links:
            try:
                with urllib.request.urlopen(url, timeout=18) as response:
                    data = response.read(4 * 1024 * 1024)
                if not data.startswith(b'%PDF-'): continue
                text = PdfReader(io.BytesIO(data)).pages[0].extract_text() or ''
                metadata = parse_header(text)
                if metadata: return key, {'source': url, 'metadata': metadata, 'header': text[:1200]}
            except Exception: pass
        return key, {'source': links[0] if links else None, 'metadata': None}
    print(f'Reading {len(jobs)} subject headers; {len(cache)} already cached.', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for index, (key, value) in enumerate(pool.map(read, jobs.items()), 1):
            cache[key] = value
            if index % 25 == 0 or index == len(jobs):
                CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f'{index}/{len(jobs)} processed; {sum(bool(v.get("metadata")) for v in cache.values())} verified.', flush=True)
if __name__ == '__main__': main()
