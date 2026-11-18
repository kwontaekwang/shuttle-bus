import json,re,sys
from pathlib import Path
p=Path(__file__).parents[1]/'data/routes.json'; data=json.loads(p.read_text(encoding='utf-8'))
errors=[]; route_ids=set(); stop_ids=set(); count=0
for r in data.get('routes',[]):
 if r['id'] in route_ids: errors.append(f"중복 route id: {r['id']}")
 route_ids.add(r['id'])
 labels=r.get('timeLabels',[])
 for s in r.get('stops',[]):
  count+=1
  if s['id'] in stop_ids: errors.append(f"중복 stop id: {s['id']}")
  stop_ids.add(s['id'])
  if len(s.get('times',[]))!=len(labels): errors.append(f"시간 열 불일치: {r['id']} / {s['name']}")
  if 'boardingAddress' not in s: errors.append(f"주소 필드 없음: {s['id']}")
print(f"routes={len(route_ids)}, stops={count}, errors={len(errors)}")
if errors: print('\n'.join(errors)); sys.exit(1)
