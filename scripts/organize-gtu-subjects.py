"""Publish imported papers only under named courses and verified academic periods."""
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY_CODES = {
'DI': {'automobile':'02','chemicalengineering':'05','civilengineering':'06','computer':'07','electricalengineeriing':'09','electronics-communication':'11','informationtechnology':'16','mechanicalengineering':'19'},
'BE': {'aeronauticals':'01','automobileengineer':'02','bio-medicalengineering':'03','bio-technology':'04','civilengineering':'06','computerengineer':'07','electricalengineer':'09','electronics-communicationengineering':'11','electronicsengineer':'10','information-technology':'16','mechanicalengineer':'19'},
}
MULTI_COURSE = {'BE', 'DI', 'ME', 'BV', 'DV', 'MP'}

def normalize(value):
    value = re.sub(r'^(?:diploma(?:\s+in)?|branch(?:\s+name)?)\s*:?\s*', '', value, flags=re.I)
    value = re.sub(r'\(\d+\)', '', value)
    value = re.sub(r'\bengi\.?\b', 'engineering', value, flags=re.I)
    value = re.sub(r'\bengineering\b', '', value.casefold().replace('&', 'and'))
    value = re.sub(r'[^a-z0-9]', '', value)
    return {'roboticsandautomation':'automationandrobotics','textiledesign':'textiledesigning','textiledesigncourse':'textiledesigning','plastics':'plastictechnology','ict':'informationandcommunicationtechnology','cacddm':'computeraidedcostumedesignanddressmaking','bfsi':'bankingfinancialservicesandinsurance','bankingfinanceservicesandinsurance':'bankingfinancialservicesandinsurance'}.get(value,value)

def code_branch(subject_code, period):
    value = re.sub(r'^[CN](?=\d)', '', subject_code)
    if re.fullmatch(r'\d{7}', value) and int(value[2]) == period:
        return value[3:5]
    if re.fullmatch(r'\d{6}', value) and int(value[1]) == period:
        return value[2:4]
    if re.fullmatch(r'\d{8}', value) and int(value[3]) == period:
        return value[4:6]
    return None

def organize():
    cache = json.loads((ROOT/'.local/gtu-subject-metadata.json').read_text(encoding='utf-8'))
    syllabus_path = ROOT/'.local/gtu-syllabus-memberships.json'
    syllabi = json.loads(syllabus_path.read_text(encoding='utf-8')) if syllabus_path.exists() else {}
    registry = json.loads((ROOT/'data/gtu-course-map.json').read_text(encoding='utf-8'))
    for key, value in json.loads((ROOT/'data/gtu-subject-overrides.json').read_text(encoding='utf-8')).items():
        cache[key] = {'source':value['source'], 'metadata':{field:value[field] for field in ['periodType','period','name']}}
    site = json.loads((ROOT/'data/site.json').read_text(encoding='utf-8'))
    verified = {}
    pending_count = 0
    for stream in site['streams']:
        file = ROOT/stream['file']
        catalog = json.loads(file.read_text(encoding='utf-8'))
        course_code = catalog.get('gtuCourseCode', '')
        subjects = {s['code']:s for s in catalog.get('pendingSubjects', [])}
        retained = []
        for branch in catalog['branches']:
            imported_branch = branch['id'] in {'official-papers','additional-papers'} or branch.get('generatedCourse') or (catalog.get('directSemesters') and branch['id'] == 'course')
            for semester in branch['semesters']:
                keep = []
                for subject in semester['subjects']:
                    if imported_branch or subject.get('verificationSource'):
                        subjects.setdefault(subject['code'], subject)
                    else: keep.append(subject)
                semester['subjects'] = keep
            if not imported_branch: retained.append(branch)
        catalog['branches'] = retained
        catalog.pop('directSemesters', None)
        names = dict(registry['branches'].get(course_code, {}))
        for branch in retained:
            code = LEGACY_CODES.get(course_code, {}).get(branch['id'])
            if code:
                branch['gtuBranchCode'] = code
                if code == '16' and course_code in {'DI','BE'}: branch['name'] = 'Information Technology'
        def get_course(name, code=None, source=None):
            name = re.sub(r'\s+', ' ', name).strip()
            name = re.sub(r'\s+([,)])', r'\1', name)
            for branch in catalog['branches']:
                if (code and branch.get('gtuBranchCode') == code) or normalize(branch['name']) == normalize(name): return branch
            identifier = re.sub(r'[^a-z0-9]+', '-', name.casefold()).strip('-')
            branch = {'id':identifier, 'name':name, 'generatedCourse':True, 'semesters':[]}
            if code: branch['gtuBranchCode'] = code
            if source: branch['source'] = source
            catalog['branches'].append(branch)
            return branch
        def syllabus_courses(key):
            # Single-program streams retain their real program name as the course.
            if course_code not in MULTI_COURSE: return []
            result = []
            raw_names = syllabi.get(key, {}).get('courses') or []
            for name in [part.strip() for raw in raw_names for part in re.split(r'\s+/\s+|\s+&\s+(?=Mechanical)', raw)]:
                if name == 'ALL': result.append(name); continue
                matching = next((n for n in names.values() if normalize(n) == normalize(name)), None)
                if matching: result.append(matching); continue
                # Reject malformed PDF table fragments, semester-specific lists and headings.
                if re.search(r'\d|\b(?:sem|semester|subject|code|branch|course|minor|honours|hons|cadets)\b', name, re.I): continue
                if name.count('(') != name.count(')') or len(name) > 100: continue
                if '/' in name.replace('CAD/CAM', '').replace('CAD/Cam', '').replace('Cad/Cam', ''): continue
                if re.search(r'Engineering|Technology|Science|Management|Security|Pharma|Production|CAD/CAM|Instrumentation|Design|Development|Accounting|Marketing|Energy|Insurance|Fintech|Innovation|Business', name, re.I):
                    result.append(name)
            return result
        # Make the official directory available for subjects marked Branch: All.
        for code, name in names.items(): get_course(name, code, registry['sources'].get(course_code))
        if not names and course_code not in MULTI_COURSE:
            get_course(catalog['name'], source=catalog.get('source'))
        # Create every verified course before expanding a shared Branch: All subject.
        for code in sorted(subjects):
            for name in syllabus_courses(course_code+'/'+code):
                if name != 'ALL': get_course(name, source=syllabi[course_code+'/'+code]['source'])
        pending = []
        for code, subject in sorted(subjects.items()):
            key = course_code+'/'+code
            record = cache.get(key, {})
            metadata = record.get('metadata')
            if not metadata:
                pending.append(subject); continue
            memberships = []
            syllabus = syllabi.get(key, {})
            for name in syllabus_courses(key):
                if name == 'ALL':
                    memberships.extend([(branch, syllabus['source']) for branch in catalog['branches'] if branch.get('gtuBranchCode') not in {'NA','NB','NC'}])
                else:
                    memberships.append((get_course(name, source=syllabus['source']), syllabus['source']))
            for item in registry['subjectBranches'].get(key, []):
                memberships.append((get_course(item['name'], item.get('branchCode'), item['source']), item['source']))
            if not memberships:
                branch_code = code_branch(code, metadata['period'])
                if branch_code in names:
                    memberships = [(get_course(names[branch_code], branch_code), registry['sources'].get(course_code, record['source']))]
                elif course_code not in MULTI_COURSE:
                    memberships = [(get_course(catalog['name']), catalog.get('source', record['source']))]
            if not memberships:
                pending.append(subject); continue
            period = metadata['period']
            kind = metadata['periodType']
            semester_id = str(period) if kind == 'semester' else f'year-{period}'
            subject['name'] = metadata['name']
            subject['verificationSource'] = record['source']
            assigned = {}
            for branch, source in memberships:
                if branch['id'] in assigned: continue
                assigned[branch['id']] = {'name':branch['name'], 'source':source}
                semester = next((s for s in branch['semesters'] if s['id'] == semester_id), None)
                if semester is None:
                    semester = {'id':semester_id,'name':f'{"Semester" if kind == "semester" else "Year"} {period}','subjects':[]}
                    branch['semesters'].append(semester)
                target = next((s for s in semester['subjects'] if s['code'] == code), None)
                if target is None: semester['subjects'].append(copy.deepcopy(subject))
                else:
                    for paper in subject['papers']:
                        if paper not in target['papers']: target['papers'].append(paper)
            verified[key] = {**metadata,'source':record['source'],'courses':list(assigned.values())}
        for branch in catalog['branches']:
            branch['semesters'].sort(key=lambda s:(s['id'].startswith('year-'),int(re.sub(r'\D.*','',s['id'].replace('year-','')) or 0)))
            for semester in branch['semesters']:
                semester['subjects'].sort(key=lambda s:(s['name'].casefold(),s['code']))
        # Keep only real course choices with available papers; retain curated empty semesters.
        catalog['branches'] = [b for b in catalog['branches'] if b['semesters']]
        if pending: catalog['pendingSubjects'] = pending
        else: catalog.pop('pendingSubjects', None)
        pending_count += len(pending)
        file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report={'sourceType':'Official GTU paper headers, syllabus headers and course timetable tables','checkedOn':'2026-10-16','subjects':dict(sorted(verified.items())),'pendingSubjects':pending_count,'note':'Subject names and periods are read from official papers. Course memberships use official syllabus/timetable records or known numeric subject-code branch segments matched against the official course registry. Unresolved records remain pending.'}
    (ROOT/'data/gtu-subjects.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Organized {len(verified)} subjects by named course and semester; {pending_count} pending.')

if __name__=='__main__': organize()
