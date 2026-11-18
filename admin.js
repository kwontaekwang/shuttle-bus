(function () {
  'use strict';
  const Core = window.AdminCore;
  const ROUTES_URL = 'data/routes.json';
  const DRAFT_KEY = 'commuteBusAdminDraftV2';
  const MAX_HISTORY = 40;
  const state = { model: null, deployed: null, selectedId: null, history: [], future: [], dirty: false, draftFound: false };
  const el = (id) => document.getElementById(id);
  const refs = {};
  let saveTimer;
  let toastTimer;

  function cacheRefs() {
    ['save-state','summary','route-list','route-search','active-filter','add-route-btn','import-btn','restore-btn','reset-btn','file-input','empty-state','editor-content','editor-title','route-form','stops-body','mobile-stops','stop-count','add-stop-btn','duplicate-route-btn','delete-route-btn','undo-btn','redo-btn','validate-btn','export-btn','validation-dialog','validation-result','toast'].forEach((id) => refs[id] = el(id));
  }

  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 2600);
  }

  function setStatus(text, tone) {
    refs['save-state'].textContent = text;
    refs['save-state'].style.color = tone === 'good' ? '#b7f1c8' : tone === 'warn' ? '#ffe098' : '';
  }

  function snapshot() { return JSON.stringify(Core.cleanForStorage(state.model)); }
  function restoreSnapshot(serialized) {
    state.model = JSON.parse(serialized);
    if (!state.model.routes.some((route) => route.id === state.selectedId)) state.selectedId = state.model.routes[0]?.id || null;
    state.dirty = true;
    scheduleDraft();
    renderAll();
  }

  function recordHistory() {
    if (!state.model) return;
    const snap = snapshot();
    if (state.history[state.history.length - 1] !== snap) state.history.push(snap);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.future.length = 0;
    updateHistoryButtons();
  }

  function mutate(action, options) {
    recordHistory();
    action();
    state.dirty = true;
    scheduleDraft();
    if (!options || options.render !== false) renderAll();
    else updateStatus();
  }

  function undo() {
    if (!state.history.length) return;
    state.future.push(snapshot());
    restoreSnapshot(state.history.pop());
    updateHistoryButtons();
  }
  function redo() {
    if (!state.future.length) return;
    state.history.push(snapshot());
    restoreSnapshot(state.future.pop());
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    refs['undo-btn'].disabled = !state.history.length;
    refs['redo-btn'].disabled = !state.future.length;
  }

  function currentRoute() { return state.model?.routes.find((route) => route.id === state.selectedId) || null; }
  function routeLabel(route) { return [route.region, route.direction, route.service].filter(Boolean).join(' · '); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }

  function updateStatus() {
    const routeCount = state.model?.routes.length || 0;
    const stopCount = state.model?.routes.reduce((sum, route) => sum + route.stops.length, 0) || 0;
    refs.summary.textContent = `${routeCount}개 노선 · ${stopCount}개 정류장`;
    refs['export-btn'].disabled = !state.model;
    setStatus(state.dirty ? '로컬 초안 저장됨 · 게시 전' : '배포본과 동일', state.dirty ? 'warn' : 'good');
    updateHistoryButtons();
  }

  function filteredRoutes() {
    const query = refs['route-search'].value.trim().toLowerCase();
    const filter = refs['active-filter'].value;
    return (state.model?.routes || []).filter((route) => {
      const matchesQuery = !query || [route.name, route.region, route.direction, route.service, route.id].join(' ').toLowerCase().includes(query);
      const matchesActive = filter === 'all' || (filter === 'active' ? route.active : !route.active);
      return matchesQuery && matchesActive;
    });
  }

  function renderRouteList() {
    const routes = filteredRoutes();
    refs['route-list'].innerHTML = routes.length ? routes.map((route) => `
      <button class="route-item ${route.id === state.selectedId ? 'active' : ''}" type="button" role="option" aria-selected="${route.id === state.selectedId}" data-route-id="${escapeHtml(route.id)}">
        <span class="route-item-top"><span class="route-name">${escapeHtml(route.name || '(이름 없음)')}${route.active ? '' : '<span class="inactive-badge">미운영</span>'}</span><span class="route-count">${route.stops.length}곳</span></span>
        <span class="route-meta">${escapeHtml(routeLabel(route) || route.id)}</span>
      </button>`).join('') : '<div class="empty-state"><p>검색 조건에 맞는 노선이 없습니다.</p></div>';
  }

  function fieldInput(name, value, index, extraClass) {
    return `<input class="${extraClass || ''}" data-stop-index="${index}" data-stop-field="${name}" value="${escapeHtml(value)}" ${name === 'time' ? 'inputmode="numeric" placeholder="HH:MM" maxlength="5"' : ''}>`;
  }

  function renderStops(route) {
    refs['stop-count'].textContent = `${route.stops.length}개 정류장`;
    refs['stops-body'].innerHTML = route.stops.map((stop, index) => `
      <tr>
        <td><div class="order-controls"><button class="mini-btn" type="button" data-stop-action="up" data-stop-index="${index}" aria-label="위로 이동" ${index === 0 ? 'disabled' : ''}>↑</button><button class="mini-btn" type="button" data-stop-action="down" data-stop-index="${index}" aria-label="아래로 이동" ${index === route.stops.length - 1 ? 'disabled' : ''}>↓</button></div></td>
        <td>${fieldInput('time', stop.time, index)}</td><td>${fieldInput('name', stop.name, index)}</td><td>${fieldInput('address', stop.address, index)}</td><td>${fieldInput('id', stop.id, index)}</td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-stop-action="duplicate" data-stop-index="${index}" aria-label="정류장 복제">⧉</button><button class="mini-btn delete" type="button" data-stop-action="delete" data-stop-index="${index}" aria-label="정류장 삭제">×</button></div></td>
      </tr>`).join('');

    refs['mobile-stops'].innerHTML = route.stops.map((stop, index) => `
      <article class="mobile-stop">
        <div class="mobile-stop-head"><strong>${index + 1}. ${escapeHtml(stop.name || '새 정류장')}</strong><div class="row-actions"><button class="mini-btn" type="button" data-stop-action="up" data-stop-index="${index}" aria-label="위로 이동" ${index === 0 ? 'disabled' : ''}>↑</button><button class="mini-btn" type="button" data-stop-action="down" data-stop-index="${index}" aria-label="아래로 이동" ${index === route.stops.length - 1 ? 'disabled' : ''}>↓</button><button class="mini-btn delete" type="button" data-stop-action="delete" data-stop-index="${index}" aria-label="삭제">×</button></div></div>
        <div class="mobile-stop-grid"><label class="field"><span>시간</span>${fieldInput('time', stop.time, index)}</label><label class="field"><span>정류장명</span>${fieldInput('name', stop.name, index)}</label><label class="field wide"><span>탑승위치 주소</span>${fieldInput('address', stop.address, index)}</label><label class="field wide"><span>정류장 ID</span>${fieldInput('id', stop.id, index)}</label></div>
      </article>`).join('');
  }

  function renderEditor() {
    const route = currentRoute();
    refs['empty-state'].hidden = Boolean(route);
    refs['editor-content'].hidden = !route;
    if (!route) return;
    refs['editor-title'].textContent = route.name || '노선 편집';
    for (const name of ['id','name','region','direction','service','days','notes']) refs['route-form'].elements[name].value = route[name] || '';
    refs['route-form'].elements.active.checked = Boolean(route.active);
    renderStops(route);
  }

  function renderAll() { renderRouteList(); renderEditor(); updateStatus(); }

  function scheduleDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!state.model) return;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), model: state.model }));
        setStatus('로컬 초안 저장됨 · 게시 전', 'warn');
      } catch (error) { setStatus('초안 저장 실패', 'warn'); }
    }, 350);
  }

  async function loadDeployed() {
    setStatus('배포본 불러오는 중…');
    const response = await fetch(`${ROUTES_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`data/routes.json을 불러오지 못했습니다 (${response.status}).`);
    const doc = await response.json();
    const model = Core.normalizeDocument(doc);
    state.deployed = Core.clone(model);
    state.model = model;
    state.selectedId = model.routes[0]?.id || null;
    state.history = []; state.future = []; state.dirty = false;
    checkDraft();
    renderAll();
  }

  function checkDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      state.draftFound = Boolean(saved?.model?.routes);
      refs['restore-btn'].hidden = !state.draftFound;
      if (state.draftFound) refs['restore-btn'].textContent = `로컬 초안 복원 (${new Date(saved.savedAt).toLocaleString('ko-KR')})`;
    } catch (_) { state.draftFound = false; refs['restore-btn'].hidden = true; }
  }

  function importDocument(doc, label) {
    const model = Core.normalizeDocument(doc);
    state.model = model; state.selectedId = model.routes[0]?.id || null;
    state.history = []; state.future = []; state.dirty = true;
    scheduleDraft(); renderAll(); showToast(`${label || 'JSON'}을 불러왔습니다.`);
  }

  function restoreDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!saved?.model?.routes) throw new Error('복원할 초안이 없습니다.');
      state.model = saved.model; state.selectedId = state.model.routes[0]?.id || null;
      state.history = []; state.future = []; state.dirty = true; renderAll(); showToast('로컬 초안을 복원했습니다.');
    } catch (error) { alert(error.message); }
  }

  function resetToDeployed() {
    if (!confirm('로컬 수정 내용을 모두 버리고 현재 배포본으로 되돌릴까요?')) return;
    localStorage.removeItem(DRAFT_KEY);
    state.model = Core.clone(state.deployed); state.selectedId = state.model.routes[0]?.id || null;
    state.history = []; state.future = []; state.dirty = false; checkDraft(); renderAll(); showToast('배포본으로 초기화했습니다.');
  }

  function downloadJson() {
    const result = Core.validate(state.model);
    if (!result.valid && !confirm(`오류 ${result.errors.length}건이 있습니다. 그래도 내보낼까요?`)) { showValidation(result); return; }
    const doc = Core.denormalizeDocument(state.model);
    const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'routes.json'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('routes.json을 내보냈습니다. GitHub 파일을 교체해 주세요.');
  }

  function showValidation(result) {
    const section = (title, items, className) => items.length ? `<section class="result-section ${className}"><h3>${title} ${items.length}건</h3><ul>${items.slice(0,100).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>${items.length > 100 ? `<p>외 ${items.length - 100}건</p>` : ''}</section>` : '';
    refs['validation-result'].innerHTML = result.valid && !result.warnings.length
      ? '<p class="result-good">✓ 오류나 경고를 찾지 못했습니다. 내보내기 가능합니다.</p>'
      : `${result.valid ? '<p class="result-good">✓ 내보내기를 막는 오류는 없습니다.</p>' : ''}${section('오류', result.errors, 'error')}${section('경고', result.warnings, 'warning')}`;
    refs['validation-dialog'].showModal();
  }

  function addRoute() {
    mutate(() => { const route = Core.createRoute(state.model); state.model.routes.push(route); state.selectedId = route.id; });
    refs['route-editor'].focus();
  }

  function duplicateRoute() {
    const route = currentRoute(); if (!route) return;
    mutate(() => {
      const copy = Core.clone(route); const usedRoutes = new Set(state.model.routes.map((item) => item.id));
      copy.id = Core.uniqueId(`${route.id}-copy`, usedRoutes); copy.name = `${route.name} 복사본`; copy._isNew = true; copy._raw = {};
      const usedStops = new Set(state.model.routes.flatMap((item) => item.stops.map((stop) => stop.id)));
      copy.stops = copy.stops.map((stop, index) => ({ ...stop, id: Core.uniqueId(`${copy.id}-stop-${index + 1}`, usedStops), _isNew: true, _raw: {} }));
      state.model.routes.push(copy); state.selectedId = copy.id;
    });
  }

  function deleteRoute() {
    const route = currentRoute(); if (!route || !confirm(`“${route.name}” 노선을 삭제할까요?`)) return;
    mutate(() => { const index = state.model.routes.indexOf(route); state.model.routes.splice(index, 1); state.selectedId = state.model.routes[Math.min(index, state.model.routes.length - 1)]?.id || null; });
  }

  function addStop() {
    const route = currentRoute(); if (!route) return;
    mutate(() => route.stops.push(Core.createStop(state.model, route)));
    const inputs = refs['stops-body'].querySelectorAll('[data-stop-field="time"]'); inputs[inputs.length - 1]?.focus();
  }

  function stopAction(action, index) {
    const route = currentRoute(); if (!route || !route.stops[index]) return;
    if (action === 'delete' && !confirm(`“${route.stops[index].name || '새 정류장'}”을 삭제할까요?`)) return;
    mutate(() => {
      if (action === 'up' && index > 0) [route.stops[index - 1], route.stops[index]] = [route.stops[index], route.stops[index - 1]];
      if (action === 'down' && index < route.stops.length - 1) [route.stops[index + 1], route.stops[index]] = [route.stops[index], route.stops[index + 1]];
      if (action === 'delete') route.stops.splice(index, 1);
      if (action === 'duplicate') {
        const copy = Core.clone(route.stops[index]);
        const used = new Set(state.model.routes.flatMap((item) => item.stops.map((stop) => stop.id)));
        copy.id = Core.uniqueId(`${copy.id}-copy`, used); copy._isNew = true; copy._raw = {};
        route.stops.splice(index + 1, 0, copy);
      }
    });
  }

  function bindEvents() {
    refs['route-list'].addEventListener('click', (event) => { const button = event.target.closest('[data-route-id]'); if (button) { state.selectedId = button.dataset.routeId; renderAll(); refs['route-editor'].focus(); } });
    refs['route-search'].addEventListener('input', renderRouteList); refs['active-filter'].addEventListener('change', renderRouteList);
    refs['add-route-btn'].addEventListener('click', addRoute); refs['duplicate-route-btn'].addEventListener('click', duplicateRoute); refs['delete-route-btn'].addEventListener('click', deleteRoute); refs['add-stop-btn'].addEventListener('click', addStop);
    refs['undo-btn'].addEventListener('click', undo); refs['redo-btn'].addEventListener('click', redo);
    refs['validate-btn'].addEventListener('click', () => showValidation(Core.validate(state.model)));
    refs['export-btn'].addEventListener('click', downloadJson); refs['restore-btn'].addEventListener('click', restoreDraft); refs['reset-btn'].addEventListener('click', resetToDeployed);
    refs['import-btn'].addEventListener('click', () => refs['file-input'].click());
    refs['file-input'].addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; try { importDocument(JSON.parse(await file.text()), file.name); } catch (error) { alert(`JSON을 불러오지 못했습니다.\n${error.message}`); } event.target.value = ''; });

    refs['route-form'].addEventListener('change', (event) => {
      const route = currentRoute(); const field = event.target.name; if (!route || !field || !(field in route)) return;
      const previousId = route.id;
      mutate(() => { route[field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; if (field === 'id') state.selectedId = route.id; }, { render: false });
      if (field === 'name' || field === 'id' || field === 'active' || previousId !== route.id) renderAll();
    });

    function stopChange(event) {
      const input = event.target.closest('[data-stop-field]'); if (!input) return;
      const route = currentRoute(); const index = Number(input.dataset.stopIndex); const field = input.dataset.stopField;
      if (!route?.stops[index] || !(field in route.stops[index])) return;
      mutate(() => route.stops[index][field] = input.value, { render: false });
      if (field === 'name') renderRouteList();
    }
    refs['stops-body'].addEventListener('change', stopChange); refs['mobile-stops'].addEventListener('change', stopChange);
    function stopClick(event) { const button = event.target.closest('[data-stop-action]'); if (button) stopAction(button.dataset.stopAction, Number(button.dataset.stopIndex)); }
    refs['stops-body'].addEventListener('click', stopClick); refs['mobile-stops'].addEventListener('click', stopClick);
    window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  }

  async function init() {
    cacheRefs(); bindEvents();
    try { await loadDeployed(); }
    catch (error) {
      setStatus('배포본 불러오기 실패', 'warn');
      refs['route-list'].innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p><p>“다른 JSON 불러오기”로 routes.json을 선택하세요.</p></div>`;
      refs['empty-state'].querySelector('h2').textContent = 'routes.json을 불러와 주세요';
      refs['empty-state'].querySelector('p').textContent = '왼쪽의 “다른 JSON 불러오기” 버튼으로 기존 data/routes.json을 선택할 수 있습니다.';
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
