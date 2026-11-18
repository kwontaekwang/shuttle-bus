const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const storage = {
  get(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
};
const state = { data:null, query:'', category:'전체', service:'전체', favoriteOnly:false, manage:false,
  favorites:new Set(storage.get('bus-favorites',[])), addresses:storage.get('bus-addresses',{}) };

const esc = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm = v => String(v||'').toLowerCase().replace(/\s/g,'');
const getAddress = (route, stop) => state.addresses[`${route.id}/${stop.id}`] ?? stop.boardingAddress ?? '';
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1800); }
function makeChip(label, group, active){ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=label; b.dataset.group=group; b.setAttribute('aria-pressed',active); return b; }

async function init(){
  const res=await fetch('data/routes.json',{cache:'no-store'}); if(!res.ok) throw new Error('노선 데이터를 불러오지 못했습니다.');
  state.data=await res.json();
  $('#updatedText').textContent=`노선 데이터 ${state.data.updatedAt} 기준`;
  $('#notice').innerHTML=`<ul>${state.data.generalNotes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`;
  buildFilters(); bind(); render();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
}
function buildFilters(){
  const categories=['전체',...new Set(state.data.routes.map(r=>r.category))];
  $('#categoryChips').replaceChildren(...categories.map(x=>makeChip(x,'category',x===state.category)));
  refreshServiceChips();
}
function refreshServiceChips(){
  const base=state.category==='전체'?state.data.routes:state.data.routes.filter(r=>r.category===state.category);
  const values=['전체',...new Set(base.map(r=>r.service))];
  if(!values.includes(state.service)) state.service='전체';
  $('#serviceChips').replaceChildren(...values.map(x=>makeChip(x,'service',x===state.service)));
}
function bind(){
  $('#searchInput').addEventListener('input',e=>{state.query=e.target.value;render();});
  $('#clearSearch').addEventListener('click',()=>{$('#searchInput').value='';state.query='';render();$('#searchInput').focus();});
  $('#categoryChips').addEventListener('click',e=>{if(!e.target.matches('.chip'))return;state.category=e.target.textContent;refreshServiceChips();buildFilters();render();});
  $('#serviceChips').addEventListener('click',e=>{if(!e.target.matches('.chip'))return;state.service=e.target.textContent;refreshServiceChips();render();});
  $('#favoriteOnly').addEventListener('change',e=>{state.favoriteOnly=e.target.checked;render();});
  $('#manageToggle').addEventListener('click',()=>{state.manage=!state.manage;document.body.classList.toggle('manage-mode',state.manage);$('#manageToggle').setAttribute('aria-pressed',state.manage);$('#adminPanel').hidden=!state.manage;render();});
  $('#routes').addEventListener('click',e=>{
    const fav=e.target.closest('.favorite-button'); if(fav){e.preventDefault();toggleFavorite(fav.dataset.route);return;}
    const save=e.target.closest('.address-save'); if(save){saveAddress(save.dataset.route,save.dataset.stop);}
  });
  $('#routes').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('.address-editor input')){e.preventDefault();e.target.nextElementSibling.click();}});
  $('#exportData').addEventListener('click',exportData);
  $('#resetAddresses').addEventListener('click',()=>{if(confirm('이 기기에 저장된 탑승위치 주소를 모두 지울까요?')){state.addresses={};storage.set('bus-addresses',{});render();toast('주소를 초기화했습니다.');}});
}
function toggleFavorite(id){ state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id); storage.set('bus-favorites',[...state.favorites]); render(); }
function saveAddress(routeId,stopId){
  const key=`${routeId}/${stopId}`, input=$(`input[data-key="${CSS.escape(key)}"]`), value=input.value.trim();
  if(value) state.addresses[key]=value; else delete state.addresses[key]; storage.set('bus-addresses',state.addresses); render(); toast(value?'주소를 저장했습니다.':'주소를 비웠습니다.');
}
function routeMatches(route){
  if(state.category!=='전체'&&route.category!==state.category)return false;
  if(state.service!=='전체'&&route.service!==state.service)return false;
  if(state.favoriteOnly&&!state.favorites.has(route.id))return false;
  if(!state.query.trim())return true;
  const q=norm(state.query), text=[route.category,route.service,route.name,route.notes,...route.departureTimes,...route.stops.flatMap(s=>[s.name,...s.times,getAddress(route,s)])].join(' ');
  return norm(text).includes(q);
}
function routeCard(route){
  const node=$('#routeTemplate').content.firstElementChild.cloneNode(true), details=$('details',node);
  node.dataset.route=route.id; $('.route-heading h2',node).textContent=route.name;
  $('.badges',node).innerHTML=`<span class="badge">${esc(route.service)}</span><span class="badge badge--direction">${esc(route.direction)}</span>`;
  const dep=route.departureTimes.length?`출발 ${route.departureTimes.join(' · ')} · `:'';
  $('.route-meta',node).textContent=`${dep}${route.stops.length}개 정류장 · ${route.operationDays}`;
  const fav=$('.favorite-button',node); fav.dataset.route=route.id; fav.textContent=state.favorites.has(route.id)?'★':'☆'; fav.classList.toggle('is-favorite',state.favorites.has(route.id));
  $('.route-note',node).textContent=route.notes||'';
  const list=$('.stop-list',node);
  route.stops.forEach((stop,i)=>{
    const li=document.createElement('li'); li.className='stop'; const address=getAddress(route,stop), key=`${route.id}/${stop.id}`;
    const times=stop.times.map((t,j)=>`<span class="time"><small>${esc(route.timeLabels[j]||'시간')}</small>${esc(t||'-')}</span>`).join('');
    const mapUrl=address?`https://map.naver.com/p/search/${encodeURIComponent(address)}`:'';
    li.innerHTML=`<span class="stop-index">${i+1}</span><div class="stop-main"><div class="stop-top"><span class="stop-name">${esc(stop.name)}</span><span class="times">${times}</span></div><div class="address-display">${address?`<span>탑승위치 주소</span><a href="${mapUrl}" target="_blank" rel="noopener">${esc(address)}</a>`:''}</div><div class="address-editor"><input data-key="${esc(key)}" value="${esc(address)}" placeholder="탑승위치 주소 입력" aria-label="${esc(stop.name)} 탑승위치 주소"><button class="address-save" type="button" data-route="${esc(route.id)}" data-stop="${esc(stop.id)}">저장</button></div></div>`;
    list.append(li);
  });
  const source=document.createElement('p'); source.className='source-tag'; source.textContent=`원본: ${route.sourceImages.join(', ')}`; $('.route-body',node).append(source);
  if(state.query && routeMatches(route)) details.open=true;
  return node;
}
function render(){
  const routes=state.data.routes.filter(routeMatches), openIds=new Set($$('details[open]', $('#routes')).map(x=>x.closest('.route-card')?.dataset.route));
  $('#routes').replaceChildren(...routes.map(route=>{const n=routeCard(route);if(openIds.has(route.id))$('details',n).open=true;return n;}));
  $('#resultCount').textContent=routes.length; $('#emptyState').hidden=routes.length>0;
  $('#searchSummary').textContent=state.query?`“${state.query}” 검색`:'';
  $$('.chip','#categoryChips').forEach(b=>b.setAttribute('aria-pressed',b.textContent===state.category));
  $$('.chip','#serviceChips').forEach(b=>b.setAttribute('aria-pressed',b.textContent===state.service));
}
function exportData(){
  const copy=structuredClone(state.data); copy.routes.forEach(r=>r.stops.forEach(s=>s.boardingAddress=getAddress(r,s))); copy.updatedAt=new Date().toISOString().slice(0,10);
  const blob=new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`commute-bus-routes-${copy.updatedAt}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); toast('주소가 반영된 데이터를 내보냈습니다.');
}
init().catch(err=>{console.error(err);$('#routes').innerHTML=`<div class="empty"><strong>데이터 로딩 오류</strong><p>${esc(err.message)}</p></div>`;});
