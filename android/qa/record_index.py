"""Cross-check all linked identities, not just page counts. Input: signed APK."""
from pathlib import Path
import re,sys,json,zipfile,hashlib
from collections import Counter
from html.parser import HTMLParser
class Links(HTMLParser):
 def __init__(self):super().__init__();self.href=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.href.extend(v for k,v in attrs if k=='href')
p=Path(sys.argv[1]);base='assets/atlas/'
with zipfile.ZipFile(p) as z:
 data=lambda k:json.loads(z.read(base+k));a=data('data/atlas.json');directory=dict(data('data/directory.json'));rows=[r for k in a['plots'] for r in data('data/plots/'+k+'.json')];search={u:r for k in a['shards'] for u,r in data('data/search/'+k+'.json').items()};assert len(rows)==len(search)==len(directory)==len({(r[0],r[1]) for r in rows})==a['total']==300
 for x,y,u,_,d,home in rows:
  r=search[u];assert directory[u]==r['d']==d and r['u']==u and r['c']==[x,y] and r['house']==home and len(r['corners'])==4
  html=z.read(base+'houses/'+u+'/index.html').decode();l=Links();l.feed(html);assert '../../#/u/'+u in l.href and '../../#/plot/'+u in l.href and ('@'+u) in html
 counts=data('data/counts.json');by=Counter(r[4] for r in rows);assert all(by[d['id']]==d['count']==counts[d['name']] for d in a['districts']);files=z.namelist();assert not any('/js/'+k+'.js' in s for s in files for k in ['houses3d','people','roads3d','scenery','surfaceart']);assert not any(s.startswith(base+'data/roads/') for s in files)
 print(json.dumps({'apk':hashlib.sha256(p.read_bytes()).hexdigest(),'distinctAcresRecordsAndSearchResults':len(rows),'districtCounts':len(counts),'verifiedRecordLinksTo3DAnd2D':2*len(rows),'legacySceneryModulesOrRoadGraphs':0},indent=2))
