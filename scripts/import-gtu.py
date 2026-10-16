"""Import public GTU paper listings. Uses the official ASP.NET search form."""
import concurrent.futures, html, json, re, time, urllib.parse, urllib.request, urllib.error
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
            return urllib.request.urlopen(url,data=data,timeout=40).read().decode('utf-8','replace')
        except urllib.error.HTTPError as error:
            if error.code != 500 or attempt == 1: raise
            time.sleep(0.5)
def options(document,identifier):
    select=re.search(r'<select[^>]+id="'+identifier+r'"[^>]*>(.*?)</select>',document,re.S).group(1)
    return re.findall(r'<option[^>]+value="([A-Z0-9]+)"',select)
def main():
    document=fetch(SOURCE); parser=HiddenFields();parser.feed(document)
    codes=options(document,'ContentPlaceHolder1_drpextype')
    sessions=sorted(options(document,'ContentPlaceHolder1_ddlsession'),key=lambda s:(int(s[1:]),s[0]=='W'),reverse=True)
    errors={}
    def course(code):
        found={};checked=[]
        # Recent sessions first; continue back through the official list for dormant programs.
        for session in sessions:
            fields={**parser.fields,'ctl00$ContentPlaceHolder1$ddlsession':session,'ctl00$ContentPlaceHolder1$drpextype':code,'ctl00$ContentPlaceHolder1$txtsearch':'','ctl00$ContentPlaceHolder1$btnsearch':'Search'}
            try:
                response=fetch(SOURCE,urllib.parse.urlencode(fields).encode())
            except urllib.error.HTTPError as error:
                if error.code != 500: raise
                errors.setdefault(code, []).append({'session': session, 'status': error.code})
                found[session]=[]; checked.append(session); continue
            links=sorted(set(html.unescape(x) for x in re.findall(r'''href=['"](uploads/[^'"]+\.pdf)['"]''',response,re.I)))
            links=[x for x in links if x.split('/')[1].upper()==session and x.split('/')[2]==code]
            found[session]=links;checked.append(session)
            if len(checked)>=2 and any(found.values()):break
        print(code, sum(map(len,found.values())), 'papers',flush=True)
        return code,found
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: result=dict(pool.map(course,codes))
    output={'source':SOURCE,'checkedOn':date.today().isoformat(),'courses':result,'errors':errors}
    (ROOT/'.local').mkdir(exist_ok=True)
    (ROOT/'.local/gtu-listings.json').write_text(json.dumps(output,indent=2),encoding='utf-8')
if __name__=='__main__':main()
