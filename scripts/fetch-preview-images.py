import json,urllib.request,urllib.parse,os
# 取图脚本：从你的 Emby 抓几张真实影片图，供预览页使用
# 用法: VANVY_EMBY=http://host:8096 VANVY_EMBY_KEY=xxx VANVY_EMBY_UID=xxx python3 scripts/fetch-preview-images.py
import os
B = os.environ.get('VANVY_EMBY', '') + '/emby'
TK = os.environ.get('VANVY_EMBY_KEY', '')
UID = os.environ.get('VANVY_EMBY_UID', '')
OUTDIR = os.environ.get('VANVY_PREVIEW_IMG', '/vol1/1001/web/mockup/banner-gallery/img')
if not (B and TK and UID):
    raise SystemExit('请设置 VANVY_EMBY / VANVY_EMBY_KEY / VANVY_EMBY_UID')
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(p,**q):
    q['api_key']=TK
    with op.open(B+p+'?'+urllib.parse.urlencode(q),timeout=30) as r: return json.load(r)
d=api(f'/Users/{UID}/Items', IncludeItemTypes='Movie',Recursive='true',Limit=40,
      SortBy='DateCreated',SortOrder='Descending',Fields='ProductionYear,Overview,CommunityRating,Genres',
      ImageTypes='Backdrop,Primary,Logo',EnableImageTypes='Backdrop,Primary,Logo')
items=[x for x in d.get('Items',[]) if (x.get('BackdropImageTags') or []) or (x.get('ImageTags') or {}).get('Primary')]
print('候选:',len(items))
out=[]
for it in items[:8]:
    imgs={}
    tags=it.get('ImageTags') or {}; bd=it.get('BackdropImageTags') or []
    if 'Primary' in tags: imgs['Primary']=f"{B}/Items/{it['Id']}/Images/Primary?maxWidth=600&tag={tags['Primary']}&api_key={TK}"
    if bd: imgs['Backdrop']=f"{B}/Items/{it['Id']}/Images/Backdrop/0?maxWidth=1280&tag={bd[0]}&api_key={TK}"
    if 'Logo' in tags: imgs['Logo']=f"{B}/Items/{it['Id']}/Images/Logo?maxWidth=500&tag={tags['Logo']}&api_key={TK}"
    out.append({'Id':it['Id'],'Name':it.get('Name'),'OriginalTitle':it.get('OriginalTitle'),
                'ProductionYear':it.get('ProductionYear'),'CommunityRating':it.get('CommunityRating'),
                'Genres':it.get('Genres') or [],'Overview':it.get('Overview') or '',
                'RunTimeTicks':it.get('RunTimeTicks'),'__img':imgs})
os.makedirs(os.path.dirname(OUTDIR) or '.', exist_ok=True)
json.dump(out,open(os.path.join(os.path.dirname(OUTDIR),'items.json'),'w'),ensure_ascii=False,indent=1)
for x in out: print(x['Name'], '|', list(x['__img'].keys()))
