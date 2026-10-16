"""Cache course memberships explicitly printed in GTU syllabus PDF headers."""
import concurrent.futures,io,json,logging,re,urllib.request
from pathlib import Path
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.local/gtu-syllabus-memberships.json'
logging.getLogger('pypdf').setLevel(logging.ERROR)
def parse(text):
 text=text[:5000].replace('\ufffd','-')
 match=re.search(r'\bBranch(?:es)?\s*:\s*(.+?)(?=\s*(?:Course\s*/\s*Subject|Subject\s*(?:Code|Name)|Course\s*(?:Code|Title)|w\.\s*e\.\s*f|Type of course))',text,re.I|re.S)
 if match:
  value=re.sub(r'\s+',' ',match[1]).strip(' :.-')
  if len(value)>260:return None
  if re.match(r'^ALL\b',value,re.I):return ['ALL']
  return [v.strip() for v in value.split(',') if v.strip()]
 match=re.search(r'Diploma\s+programme\s+in\s+which\s+this\s+course\s+is\s+offered\s+Semester\s+in\s+which\s+offered\s+(.+?)(?:\b(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth)\b|\n\s*1\.\s*RATIONALE)',text,re.I|re.S)
 if match:
  value=re.sub(r'\s+',' ',match[1]).strip()
  if re.match(r'^ALL\b',value,re.I):return ['ALL']
  if 3<len(value)<260:return [v.strip() for v in value.split(',') if v.strip()]
 # Some older ME syllabi print the specialization as an unlabelled heading.
 before=re.split(r'SUBJECT\s*CODE',text,flags=re.I)[0]
 lines=[re.sub(r'\s+',' ',line).strip() for line in before.splitlines() if line.strip()]
 for line in lines:
  if re.search(r'Engineering\s*\([^)]+\)',line,re.I) and not re.search('Program Name|Subject|Level|University',line,re.I):return [line]
 return None

def main():
 cache=json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}
 if not cache and (ROOT/'data/gtu-subjects.json').exists():
  verified=json.loads((ROOT/'data/gtu-subjects.json').read_text(encoding='utf-8'))['subjects']
  cache={key:{'courses':[c['name'] for c in item.get('courses',[])], 'source':item['courses'][0]['source']} for key,item in verified.items() if item.get('courses')}
 CACHE.parent.mkdir(exist_ok=True)
 headers=json.loads((ROOT/'.local/gtu-subject-metadata.json').read_text(encoding='utf-8'))
 jobs=[key for key in headers if key not in cache]
 # Read non-standard new curriculum codes first; their branch cannot be decoded from the filename.
 jobs.sort(key=lambda key:(not re.match(r'[A-Z]{2}/[A-Z]{2}\d{8}',key),key))
 def read(key):
  code=key.split('/')[1]
  if not re.fullmatch(r'[A-Z0-9]{6,12}',code):return key,{'courses':None}
  url='https://s3-ap-southeast-1.amazonaws.com/gtusitecirculars/Syallbus/'+code+'.pdf'
  try:
   with urllib.request.urlopen(url,timeout=16) as response:data=response.read(5*1024*1024)
   text=PdfReader(io.BytesIO(data)).pages[0].extract_text() or ''
   return key,{'courses':parse(text),'source':url,'header':text[:1400]}
  except Exception:return key,{'courses':None}
 print('Reading',len(jobs),'syllabus headers',flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
  for index,(key,value) in enumerate(pool.map(read,jobs),1):
   cache[key]=value
   if index%50==0 or index==len(jobs):
    CACHE.write_text(json.dumps(cache,indent=2,ensure_ascii=False),encoding='utf-8')
    print(index,'/',len(jobs),'read;',sum(bool(v['courses']) for v in cache.values()),'course mappings',flush=True)
if __name__=='__main__':main()
