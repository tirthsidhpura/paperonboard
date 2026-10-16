"""Import public GTU paper listings. Uses the official ASP.NET search form."""
import argparse, concurrent.futures, html, json, re, time, urllib.parse, urllib.request, urllib.error
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://old26.gtu.ac.in/Download1.aspx'
class HiddenFields(HTMLParser):
    def __init__(self): super().__init__(); self.fields={}
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='input' and a.get('type')=='hidden': self.fields[a['name']]=a.get('value','')
def fetch(url,data=None):
    for attempt in range(2):
        try:
            return urllib.request.urlopen(url,data=data,timeout=25).read().decode('utf-8','replace')
        except urllib.error.HTTPError as error:
            if error.code != 500 or attempt == 1: raise
            time.sleep(0.5)
def options(document,identifier):
    select=re.search(r'<select[^>]+id="'+identifier+r'"[^>]*>(.*?)</select>',document,re.S).group(1)
    return re.findall(r'<option[^>]+value="([A-Z0-9]+)"',select)
def main():
    arguments=argparse.ArgumentParser(description=__doc__)
    arguments.add_argument('--recent',action='store_true',help='Stop after finding recent papers instead of importing every listed session')
    arguments.add_argument('--resume',type=Path,help='Reuse sessions from a saved snapshot')
    arguments.add_argument('--output',type=Path,default=ROOT/'.local/gtu-listings.json')
    args=arguments.parse_args()
    document=fetch(SOURCE); parser=HiddenFields();parser.feed(document)
    codes=options(document,'ContentPlaceHolder1_drpextype')
    sessions=sorted(options(document,'ContentPlaceHolder1_ddlsession'),key=lambda s:(int(s[1:]),s[0]=='W'),reverse=True)
    previous=json.loads(args.resume.read_text(encoding='utf-8')) if args.resume else {}
    errors=previous.get('errors',{})
    def course(code):
        found=dict(previous.get('courses',{}).get(code,{}));checked=[]
        # Every official session is checked, including years before a new course existed.
        # Only links returned by GTU are recorded; no historical URLs are invented.
        for session in sessions:
            if session in found:
                checked.append(session)
                if args.recent and len(checked)>=2 and any(found.values()):break
                continue
            fields={**parser.fields,'ctl00$ContentPlaceHolder1$ddlsession':session,'ctl00$ContentPlaceHolder1$drpextype':code,'ctl00$ContentPlaceHolder1$txtsearch':'','ctl00$ContentPlaceHolder1$btnsearch':'Search'}
            try:
                response=fetch(SOURCE,urllib.parse.urlencode(fields).encode())
            except (urllib.error.URLError, TimeoutError) as error:
                errors.setdefault(code, []).append({'session': session, 'status': getattr(error,'code',None), 'error':type(error).__name__})
                found[session]=[]; checked.append(session); continue
            links=sorted(set(html.unescape(x) for x in re.findall(r'''href=['"](uploads/[^'"]+\.pdf)['"]''',response,re.I)))
            links=[x for x in links if x.split('/')[1].upper()==session and x.split('/')[2]==code]
            found[session]=links;checked.append(session)
            if args.recent and len(checked)>=2 and any(found.values()):break
        print(code, sum(map(len,found.values())), 'papers',flush=True)
        return code,found
    result={}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(course,code) for code in codes]
        for future in concurrent.futures.as_completed(futures):
            code,found=future.result();result[code]=found
            output={'source':SOURCE,'checkedOn':date.today().isoformat(),'scope':'recent' if args.recent else 'all-listed-sessions','courses':dict(sorted(result.items())),'errors':errors}
            args.output.write_text(json.dumps(output,indent=2),encoding='utf-8')
if __name__=='__main__':main()
