(() => {
  'use strict';

  const APP_VERSION = '20261118-2';
  const DATA_URL = `data/routes.json?v=${APP_VERSION}`;
  const FAVORITES_KEY = 'eumseong-bus-favorites-v2';
  const ADDRESS_KEY = 'eumseong-bus-addresses-v2';

  const state = {
    source: null,
    sourceRoutes: [],
    routes: [],
    primary: 'all',
    secondary: 'all',
    query: '',
    favoriteOnly: false,
    favorites: readJsonStorage(FAVORITES_KEY, []),
    addresses: readJsonStorage(ADDRESS_KEY, {}),
    allOpen: false
  };

  const el = {};
  let toastTimer;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();
    registerServiceWorker();
    await loadRoutes();
  }

  function cacheElements() {
    el.dataDate = document.getElementById('dataDate');
    el.searchInput = document.getElementById('searchInput');
    el.clearSearch = document.getElementById('clearSearch');
    el.primaryFilters = document.getElementById('primaryFilters');
    el.secondaryFilters = document.getElementById('secondaryFilters');
    el.favoriteOnly = document.getElementById('favoriteOnly');
    el.exportData = document.getElementById('exportData');
    el.resetAddresses = document.getElementById('resetAddresses');
    el.expandAll = document.getElementById('expandAll');
    el.visibleCount = document.getElementById('visibleCount');
    el.statusBox = document.getElementById('statusBox');
    el.routeList = document.getElementById('routeList');
    el.toast = document.getElementById('toast');
  }

  function bindEvents() {
    el.searchInput.addEventListener('input', () => {
      state.query = normalizeText(el.searchInput.value);
      render();
    });

    el.clearSearch.addEventListener('click', () => {
      el.searchInput.value = '';
      state.query = '';
      el.searchInput.focus();
      render();
    });

    el.primaryFilters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-primary]');
      if (!button) return;
      state.primary = button.dataset.primary;
      setActiveChip(el.primaryFilters, button);
      render();
    });

    el.secondaryFilters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-secondary]');
      if (!button) return;
      state.secondary = button.dataset.secondary;
      setActiveChip(el.secondaryFilters, button);
      render();
    });

    el.favoriteOnly.addEventListener('change', () => {
      state.favoriteOnly = el.favoriteOnly.checked;
      render();
    });

    el.routeList.addEventListener('click', handleRouteListClick);
    el.routeList.addEventListener('change', handleRouteListChange);
    el.exportData.addEventListener('click', exportMergedData);
    el.resetAddresses.addEventListener('click', resetLocalAddresses);
    el.expandAll.addEventListener('click', toggleAllRoutes);
  }

  async function loadRoutes() {
    showLoading();
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

      let payload;
      try {
        payload = await response.json();
      } catch (parseError) {
        throw new Error(`routes.json 문법을 확인해 주세요: ${parseError.message}`);
      }

      const sourceRoutes = extractRouteArray(payload);
      if (!sourceRoutes.length) throw new Error('routes.json에서 노선 배열을 찾지 못했습니다.');

      state.source = payload;
      state.sourceRoutes = sourceRoutes;
      state.routes = sourceRoutes.map(normalizeRoute);
      updateDataDate(payload, state.routes);
      el.statusBox.hidden = true;
      render();
    } catch (error) {
      console.error('[통근버스] 데이터 로딩 실패:', error);
      showError(error);
    }
  }

  function extractRouteArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const preferredKeys = ['routes', 'data', 'items', 'routeList', 'busRoutes'];
    for (const key of preferredKeys) {
      if (Array.isArray(payload[key])) return payload[key];
      if (payload[key] && Array.isArray(payload[key].routes)) return payload[key].routes;
    }

    const firstArray = Object.values(payload).find((value) => Array.isArray(value));
    return firstArray || [];
  }

  function normalizeRoute(route, routeIndex) {
    const raw = route && typeof route === 'object' ? route : {};
    const id = cleanString(firstValue(raw, ['id', 'routeId', 'route_id', 'key'])) || `route-${routeIndex + 1}`;
    const name = cleanString(firstValue(raw, ['name', 'routeName', 'route_name', 'title', 'label'])) || `노선 ${routeIndex + 1}`;
    const region = cleanString(firstValue(raw, ['region', 'area', 'city', 'zone', 'group'])) || inferRegion(name);
    const direction = cleanString(firstValue(raw, ['direction', 'commuteType', 'commute_type', 'operationType', 'type', 'category'])) || inferDirection(name);
    const shift = cleanString(firstValue(raw, ['shift', 'workTime', 'work_time', 'timeBand', 'schedule', 'subCategory', 'serviceType']));
    const days = normalizeDays(firstValue(raw, ['days', 'serviceDays', 'service_days', 'operationDays', 'operation_days', 'weekdays']));
    const active = normalizeActive(raw);
    const stopSource = firstArrayValue(raw, ['stops', 'stations', 'stopList', 'stop_list', 'points', 'schedules', 'routeStops']);
    const stops = stopSource.map((stop, stopIndex) => normalizeStop(stop, stopIndex, id));
    const haystack = normalizeText([name, region, direction, shift, days.join(' '), ...stops.flatMap((stop) => [stop.name, stop.time, stop.address])].join(' '));

    return { id, name, region, direction, shift, days, active, stops, haystack, raw, routeIndex };
  }

  function normalizeStop(stop, stopIndex, routeId) {
    if (Array.isArray(stop)) {
      const id = `${routeId}-stop-${stopIndex + 1}`;
      return {
        id,
        time: cleanString(stop[0]),
        name: cleanString(stop[1]) || `정류장 ${stopIndex + 1}`,
        address: cleanString(stop[2]),
        raw: stop,
        arrayShape: true,
        stopIndex
      };
    }

    const raw = stop && typeof stop === 'object' ? stop : {};
    const id = cleanString(firstValue(raw, ['id', 'stopId', 'stop_id', 'key'])) || `${routeId}-stop-${stopIndex + 1}`;
    const time = cleanString(firstValue(raw, ['time', 'departureTime', 'departure_time', 'arrivalTime', 'boardingTime', 'pickupTime']));
    const name = cleanString(firstValue(raw, ['name', 'stopName', 'stop_name', 'station', 'title', 'location'])) || `정류장 ${stopIndex + 1}`;
    const address = cleanString(firstValue(raw, ['boardingAddress', 'boarding_address', 'address', 'boardingLocation', 'pickupAddress', 'locationAddress']));
    return { id, time, name, address, raw, arrayShape: false, stopIndex };
  }

  function firstValue(object, keys) {
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
    }
    return '';
  }

  function firstArrayValue(object, keys) {
    for (const key of keys) {
      if (Array.isArray(object[key])) return object[key];
    }
    return [];
  }

  function cleanString(value) {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.map(cleanString).filter(Boolean).join(', ');
    if (typeof value === 'object') return cleanString(value.name || value.label || value.value || '');
    return String(value).trim();
  }

  function normalizeText(value) {
    return cleanString(value).toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
  }

  function normalizeDays(value) {
    if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
    const text = cleanString(value);
    return text ? text.split(/[,/·|]+/).map((item) => item.trim()).filter(Boolean) : [];
  }

  function normalizeActive(route) {
    const candidate = firstValue(route, ['active', 'enabled', 'isActive', 'is_active', 'operating', 'status']);
    if (candidate === '') return true;
    if (typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') return candidate !== 0;
    const text = normalizeText(candidate);
    return !['false', '0', 'inactive', 'disabled', '미운영', '운영중지', '중지'].includes(text);
  }

  function inferRegion(name) {
    const areas = ['청주', '충주', '음성', '금왕', '맹동', '진천', '이천', '죽산'];
    return areas.find((area) => name.includes(area)) || '';
  }

  function inferDirection(name) {
    if (name.includes('출근')) return '출근';
    if (name.includes('퇴근')) return '퇴근';
    if (name.includes('토요일')) return '토요일';
    return '';
  }

  function updateDataDate(payload, routes) {
    const candidate = !Array.isArray(payload) && payload && typeof payload === 'object'
      ? firstValue(payload, ['updatedAt', 'updated_at', 'lastUpdated', 'date', 'versionDate'])
      : '';
    const text = cleanString(candidate);
    el.dataDate.textContent = text ? `노선 데이터 ${formatDateText(text)} 기준` : `노선 데이터 · ${routes.length}개 노선`;
  }

  function formatDateText(value) {
    const match = value.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : value;
  }

  function setActiveChip(container, activeButton) {
    safeQueryAll('.chip', container).forEach((button) => button.classList.toggle('is-active', button === activeButton));
  }

  // root가 DOM 노드인지 먼저 검사합니다. 기존 오류의 직접 원인이었던 잘못된 querySelectorAll 호출을 차단합니다.
  function safeQueryAll(selector, root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    return Array.from(scope.querySelectorAll(selector));
  }

  function getFilteredRoutes() {
    return state.routes.filter((route) => {
      if (!route.active) return false;
      if (state.favoriteOnly && !state.favorites.includes(route.id)) return false;
      if (!matchesPrimary(route, state.primary)) return false;
      if (!matchesSecondary(route, state.secondary)) return false;
      if (state.query && !route.haystack.includes(state.query)) return false;
      return true;
    });
  }

  function routeText(route) {
    return normalizeText([route.name, route.region, route.direction, route.shift, route.days.join(' ')].join(' '));
  }

  function matchesPrimary(route, filter) {
    if (filter === 'all') return true;
    const text = routeText(route);
    const isCheongju = text.includes('청주');
    if (filter === 'cheongju-in') return isCheongju && text.includes('출근') && !text.includes('토요일');
    if (filter === 'cheongju-out') return isCheongju && text.includes('퇴근') && !text.includes('토요일');
    if (filter === 'cheongju-sat') return isCheongju && text.includes('토요일');
    if (filter === 'regional') return !isCheongju;
    return true;
  }

  function matchesSecondary(route, filter) {
    if (filter === 'all') return true;
    const text = routeText(route);
    if (filter === '조간 출근') return text.includes('조간') && text.includes('출근');
    if (filter === '주간 출근') return text.includes('주간') && text.includes('출근');
    if (filter === '석간 출근') return text.includes('석간') && text.includes('출근');
    if (filter === '야간 출근 19') return text.includes('야간') && text.includes('출근') && (text.includes('19') || text.includes('19시'));
    if (filter === '야간 출근 22') return text.includes('야간') && text.includes('출근') && (text.includes('22') || text.includes('22시'));
    if (filter === '04:20 22:20 퇴근') return text.includes('퇴근') && (text.includes('04:20') || text.includes('22:20'));
    if (filter === '07:20 16:20 퇴근') return text.includes('퇴근') && (text.includes('07:20') || text.includes('16:20'));
    if (filter === '17:45 19:20 퇴근') return text.includes('퇴근') && (text.includes('17:45') || text.includes('19:20'));
    if (filter === '토요일') return text.includes('토요일') || text.includes('토');
    return true;
  }

  function render() {
    const routes = getFilteredRoutes();
    el.visibleCount.textContent = String(routes.length);
    el.routeList.replaceChildren();

    if (!routes.length) {
      const empty = document.createElement('div');
      empty.className = 'no-results';
      empty.innerHTML = '<strong>조건에 맞는 노선이 없습니다.</strong><br><span>검색어 또는 필터를 변경해 주세요.</span>';
      el.routeList.append(empty);
      el.expandAll.hidden = true;
      return;
    }

    const fragment = document.createDocumentFragment();
    routes.forEach((route) => fragment.append(createRouteCard(route)));
    el.routeList.append(fragment);
    el.expandAll.hidden = false;
    el.expandAll.textContent = state.allOpen ? '모두 접기' : '모두 펼치기';
  }

  function createRouteCard(route) {
    const card = document.createElement('details');
    card.className = 'route-card';
    card.dataset.routeId = route.id;
    card.open = state.allOpen || Boolean(state.query);

    const summary = document.createElement('summary');
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = `favorite-button${state.favorites.includes(route.id) ? ' is-favorite' : ''}`;
    favorite.dataset.action = 'favorite';
    favorite.dataset.routeId = route.id;
    favorite.setAttribute('aria-label', `${route.name} 즐겨찾기 ${state.favorites.includes(route.id) ? '해제' : '추가'}`);
    favorite.textContent = state.favorites.includes(route.id) ? '★' : '☆';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'route-title-wrap';
    const title = document.createElement('h2');
    title.className = 'route-title';
    title.textContent = route.name;
    const meta = document.createElement('div');
    meta.className = 'route-meta';
    [route.region, route.direction, route.shift, route.days.join('·')].filter(Boolean).forEach((value) => {
      const badge = document.createElement('span');
      badge.className = 'meta-badge';
      badge.textContent = value;
      meta.append(badge);
    });
    titleWrap.append(title, meta);

    const count = document.createElement('span');
    count.className = 'stop-count';
    count.textContent = `${route.stops.length}개 정류장`;
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    summary.append(favorite, titleWrap, count, chevron);

    const body = document.createElement('div');
    body.className = 'route-body';
    if (!route.stops.length) {
      const empty = document.createElement('p');
      empty.className = 'route-empty';
      empty.textContent = '등록된 정류장이 없습니다.';
      body.append(empty);
    } else {
      const list = document.createElement('ol');
      list.className = 'stop-list';
      route.stops.forEach((stop) => list.append(createStopRow(route, stop)));
      body.append(list);
    }

    card.append(summary, body);
    return card;
  }

  function createStopRow(route, stop) {
    const row = document.createElement('li');
    row.className = 'stop-row';
    const time = document.createElement('span');
    time.className = 'stop-time';
    time.textContent = stop.time || '--:--';
    const name = document.createElement('span');
    name.className = 'stop-name';
    name.textContent = stop.name;
    const field = document.createElement('label');
    field.className = 'address-field';
    const label = document.createElement('span');
    label.className = 'sr-only';
    label.textContent = `${route.name} ${stop.name} 탑승위치 주소`;
    const input = document.createElement('input');
    input.className = 'address-input';
    input.type = 'text';
    input.autocomplete = 'street-address';
    input.placeholder = '탑승위치 주소 입력';
    input.value = getAddress(route.id, stop);
    input.dataset.routeId = route.id;
    input.dataset.stopId = stop.id;
    field.append(label, input);
    row.append(time, name, field);
    return row;
  }

  function handleRouteListClick(event) {
    const favorite = event.target.closest('[data-action="favorite"]');
    if (!favorite) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(favorite.dataset.routeId);
  }

  function handleRouteListChange(event) {
    const input = event.target.closest('.address-input');
    if (!input) return;
    const key = addressKey(input.dataset.routeId, input.dataset.stopId);
    const value = input.value.trim();
    if (value) state.addresses[key] = value;
    else delete state.addresses[key];
    writeJsonStorage(ADDRESS_KEY, state.addresses);
    showToast('탑승위치 주소를 이 기기에 저장했습니다.');
    refreshRouteHaystack(input.dataset.routeId);
  }

  function refreshRouteHaystack(routeId) {
    const route = state.routes.find((item) => item.id === routeId);
    if (!route) return;
    route.haystack = normalizeText([
      route.name, route.region, route.direction, route.shift, route.days.join(' '),
      ...route.stops.flatMap((stop) => [stop.name, stop.time, getAddress(route.id, stop)])
    ].join(' '));
  }

  function toggleFavorite(routeId) {
    const set = new Set(state.favorites);
    if (set.has(routeId)) set.delete(routeId);
    else set.add(routeId);
    state.favorites = Array.from(set);
    writeJsonStorage(FAVORITES_KEY, state.favorites);
    render();
  }

  function getAddress(routeId, stop) {
    return state.addresses[addressKey(routeId, stop.id)] ?? stop.address ?? '';
  }

  function addressKey(routeId, stopId) {
    return `${routeId}::${stopId}`;
  }

  function toggleAllRoutes() {
    state.allOpen = !state.allOpen;
    safeQueryAll('.route-card', el.routeList).forEach((card) => { card.open = state.allOpen; });
    el.expandAll.textContent = state.allOpen ? '모두 접기' : '모두 펼치기';
  }

  function exportMergedData() {
    if (!state.sourceRoutes.length) return;
    const mergedRoutes = state.sourceRoutes.map((route, routeIndex) => {
      const copy = deepClone(route);
      const normalized = state.routes[routeIndex];
      if (!normalized) return copy;
      const stopKey = findStopArrayKey(copy);
      if (!stopKey || !Array.isArray(copy[stopKey])) return copy;

      copy[stopKey] = copy[stopKey].map((rawStop, stopIndex) => {
        const normalizedStop = normalized.stops[stopIndex];
        if (!normalizedStop) return rawStop;
        const address = getAddress(normalized.id, normalizedStop);
        if (Array.isArray(rawStop)) {
          const next = [...rawStop];
          next[2] = address;
          return next;
        }
        return { ...(rawStop || {}), boardingAddress: address };
      });
      return copy;
    });

    let output;
    if (Array.isArray(state.source)) output = mergedRoutes;
    else {
      output = deepClone(state.source);
      const routePath = findRouteArrayPath(output);
      if (routePath.length === 1) output[routePath[0]] = mergedRoutes;
      else if (routePath.length === 2) output[routePath[0]][routePath[1]] = mergedRoutes;
      else output.routes = mergedRoutes;
      if ('updatedAt' in output) output.updatedAt = new Date().toISOString().slice(0, 10);
    }

    const blob = new Blob([`${JSON.stringify(output, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'routes.json';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showToast('주소가 반영된 routes.json을 내려받았습니다.');
  }

  function findStopArrayKey(route) {
    return ['stops', 'stations', 'stopList', 'stop_list', 'points', 'schedules', 'routeStops'].find((key) => Array.isArray(route?.[key])) || '';
  }

  function findRouteArrayPath(payload) {
    const keys = ['routes', 'data', 'items', 'routeList', 'busRoutes'];
    for (const key of keys) {
      if (Array.isArray(payload?.[key])) return [key];
      if (payload?.[key] && Array.isArray(payload[key].routes)) return [key, 'routes'];
    }
    return [];
  }

  function resetLocalAddresses() {
    if (!Object.keys(state.addresses).length) {
      showToast('이 기기에 저장된 주소가 없습니다.');
      return;
    }
    const confirmed = window.confirm('이 기기에만 저장된 탑승위치 주소를 모두 삭제할까요? 원본 routes.json의 주소는 삭제되지 않습니다.');
    if (!confirmed) return;
    state.addresses = {};
    localStorage.removeItem(ADDRESS_KEY);
    state.routes.forEach((route) => refreshRouteHaystack(route.id));
    render();
    showToast('이 기기에 저장된 주소를 초기화했습니다.');
  }

  function showLoading() {
    el.statusBox.hidden = false;
    el.statusBox.className = 'status-box';
    el.statusBox.innerHTML = '<div class="spinner" aria-hidden="true"></div><strong>노선 데이터를 불러오는 중입니다.</strong>';
  }

  function showError(error) {
    el.visibleCount.textContent = '0';
    el.statusBox.hidden = false;
    el.statusBox.className = 'status-box is-error';
    const title = document.createElement('strong');
    title.textContent = '데이터 로딩 오류';
    const message = document.createElement('p');
    message.textContent = error.message || String(error);
    const help = document.createElement('p');
    help.textContent = 'data/routes.json의 경로와 JSON 문법을 확인한 뒤 새로고침해 주세요.';
    el.statusBox.replaceChildren(title, message, help);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2200);
  }

  function readJsonStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn('로컬 저장 실패:', error); }
  }

  function deepClone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch((error) => console.warn('서비스 워커 등록 실패:', error));
    });
  }
})();
