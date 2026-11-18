(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdminCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROUTE_FIELDS = {
    id: ['id', 'routeId', 'route_id', 'key'],
    name: ['name', 'title', 'routeName', 'route_name', 'label'],
    region: ['region', 'area', 'city', 'zone'],
    direction: ['direction', 'commuteType', 'commute_type', 'type'],
    service: ['service', 'shift', 'workType', 'work_type', 'schedule', 'timeGroup', 'time_group'],
    days: ['days', 'day', 'operationDays', 'operation_days'],
    active: ['active', 'enabled', 'isActive', 'is_active'],
    notes: ['notes', 'note', 'description', 'memo'],
    stops: ['stops', 'stations', 'stopovers', 'busStops', 'bus_stops']
  };

  const STOP_FIELDS = {
    id: ['id', 'stopId', 'stop_id', 'key'],
    name: ['name', 'stop', 'station', 'stopName', 'stop_name', 'label'],
    time: ['time', 'departureTime', 'departure_time', 'boardingTime', 'boarding_time'],
    address: ['boardingAddress', 'boarding_address', 'address', 'location', 'place'],
    notes: ['notes', 'note', 'description', 'memo']
  };

  const DEFAULT_ROUTE_MAP = {
    id: 'id', name: 'name', region: 'region', direction: 'direction', service: 'service',
    days: 'days', active: 'active', notes: 'notes', stops: 'stops'
  };
  const DEFAULT_STOP_MAP = {
    id: 'id', name: 'name', time: 'time', address: 'boardingAddress', notes: 'notes'
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

  function firstKey(obj, candidates) {
    return candidates.find((key) => own(obj, key));
  }

  function mapFields(obj, definitions, fallback) {
    const map = {};
    for (const [canonical, candidates] of Object.entries(definitions)) {
      map[canonical] = firstKey(obj, candidates) || fallback[canonical];
    }
    return map;
  }

  function findRoutes(doc) {
    if (Array.isArray(doc)) return { rootType: 'array', routesKey: null, list: doc };
    if (!doc || typeof doc !== 'object') throw new Error('JSON 최상위 값은 배열 또는 객체여야 합니다.');

    const preferred = ['routes', 'data', 'items'];
    for (const key of preferred) {
      if (Array.isArray(doc[key])) return { rootType: 'object', routesKey: key, list: doc[key] };
    }
    const arrayKey = Object.keys(doc).find((key) => Array.isArray(doc[key]));
    if (arrayKey) return { rootType: 'object', routesKey: arrayKey, list: doc[arrayKey] };
    throw new Error('노선 배열을 찾지 못했습니다. routes, data 또는 items 배열이 필요합니다.');
  }

  function valueOf(obj, map, key, fallback) {
    const value = obj && own(obj, map[key]) ? obj[map[key]] : fallback;
    return value === null || value === undefined ? fallback : value;
  }

  function normalizeStop(raw, routeIndex, stopIndex, preferredMap) {
    const source = raw && typeof raw === 'object' ? clone(raw) : {};
    const map = mapFields(source, STOP_FIELDS, preferredMap || DEFAULT_STOP_MAP);
    return {
      id: String(valueOf(source, map, 'id', `r${routeIndex + 1}-s${stopIndex + 1}`)),
      name: String(valueOf(source, map, 'name', '')),
      time: String(valueOf(source, map, 'time', '')),
      address: String(valueOf(source, map, 'address', '')),
      notes: String(valueOf(source, map, 'notes', '')),
      _raw: source,
      _map: map,
      _isNew: false
    };
  }

  function normalizeRoute(raw, routeIndex, preferredRouteMap, preferredStopMap) {
    const source = raw && typeof raw === 'object' ? clone(raw) : {};
    const map = mapFields(source, ROUTE_FIELDS, preferredRouteMap || DEFAULT_ROUTE_MAP);
    const rawStops = Array.isArray(source[map.stops]) ? source[map.stops] : [];
    const firstStop = rawStops.find((item) => item && typeof item === 'object') || {};
    const stopMap = mapFields(firstStop, STOP_FIELDS, preferredStopMap || DEFAULT_STOP_MAP);
    return {
      id: String(valueOf(source, map, 'id', `route-${String(routeIndex + 1).padStart(3, '0')}`)),
      name: String(valueOf(source, map, 'name', '')),
      region: String(valueOf(source, map, 'region', '')),
      direction: String(valueOf(source, map, 'direction', '')),
      service: String(valueOf(source, map, 'service', '')),
      days: Array.isArray(valueOf(source, map, 'days', ''))
        ? valueOf(source, map, 'days', []).join(', ')
        : String(valueOf(source, map, 'days', '')),
      active: valueOf(source, map, 'active', true) !== false,
      notes: String(valueOf(source, map, 'notes', '')),
      stops: rawStops.map((stop, stopIndex) => normalizeStop(stop, routeIndex, stopIndex, stopMap)),
      _raw: source,
      _map: map,
      _stopMap: stopMap,
      _isNew: false
    };
  }

  function normalizeDocument(doc) {
    const originalRoot = clone(doc);
    const located = findRoutes(doc);
    const firstRoute = located.list.find((item) => item && typeof item === 'object') || {};
    const routeMap = mapFields(firstRoute, ROUTE_FIELDS, DEFAULT_ROUTE_MAP);
    const firstStops = Array.isArray(firstRoute[routeMap.stops]) ? firstRoute[routeMap.stops] : [];
    const firstStop = firstStops.find((item) => item && typeof item === 'object') || {};
    const stopMap = mapFields(firstStop, STOP_FIELDS, DEFAULT_STOP_MAP);
    const routes = located.list.map((route, index) => normalizeRoute(route, index, routeMap, stopMap));

    return {
      source: { rootType: located.rootType, routesKey: located.routesKey, originalRoot },
      preferredRouteMap: routeMap,
      preferredStopMap: stopMap,
      routes
    };
  }

  function writeValue(target, map, canonical, value, options) {
    const key = map[canonical];
    const include = options && options.include;
    if (include || own(target, key) || value !== '' && value !== undefined) target[key] = value;
  }

  function denormalizeStop(stop, preferredMap) {
    const target = clone(stop._raw || {});
    const map = stop._map || preferredMap || DEFAULT_STOP_MAP;
    writeValue(target, map, 'id', stop.id, { include: stop._isNew });
    writeValue(target, map, 'name', stop.name, { include: true });
    writeValue(target, map, 'time', stop.time, { include: true });
    writeValue(target, map, 'address', stop.address, { include: stop._isNew || stop.address !== '' || own(target, map.address) });
    writeValue(target, map, 'notes', stop.notes, { include: stop.notes !== '' || own(target, map.notes) });
    return target;
  }

  function denormalizeRoute(route, preferredRouteMap, preferredStopMap) {
    const target = clone(route._raw || {});
    const map = route._map || preferredRouteMap || DEFAULT_ROUTE_MAP;
    writeValue(target, map, 'id', route.id, { include: true });
    writeValue(target, map, 'name', route.name, { include: true });
    writeValue(target, map, 'region', route.region, { include: route._isNew || route.region !== '' || own(target, map.region) });
    writeValue(target, map, 'direction', route.direction, { include: route._isNew || route.direction !== '' || own(target, map.direction) });
    writeValue(target, map, 'service', route.service, { include: route._isNew || route.service !== '' || own(target, map.service) });

    let daysValue = route.days;
    if (own(target, map.days) && Array.isArray(target[map.days])) {
      daysValue = String(route.days).split(',').map((item) => item.trim()).filter(Boolean);
    }
    writeValue(target, map, 'days', daysValue, { include: route.days !== '' || own(target, map.days) });
    writeValue(target, map, 'active', Boolean(route.active), { include: route._isNew || own(target, map.active) });
    writeValue(target, map, 'notes', route.notes, { include: route.notes !== '' || own(target, map.notes) });
    target[map.stops] = route.stops.map((stop) => denormalizeStop(stop, route._stopMap || preferredStopMap));
    return target;
  }

  function denormalizeDocument(model) {
    const routes = model.routes.map((route) => denormalizeRoute(route, model.preferredRouteMap, model.preferredStopMap));
    if (model.source.rootType === 'array') return routes;
    const root = clone(model.source.originalRoot || {});
    root[model.source.routesKey || 'routes'] = routes;
    if (root.meta && typeof root.meta === 'object') {
      if (own(root.meta, 'routeCount')) root.meta.routeCount = routes.length;
      if (own(root.meta, 'stopCount')) root.meta.stopCount = routes.reduce((sum, route) => {
        const stopsKey = firstKey(route, ROUTE_FIELDS.stops) || 'stops';
        return sum + (Array.isArray(route[stopsKey]) ? route[stopsKey].length : 0);
      }, 0);
      if (own(root.meta, 'updatedAt')) root.meta.updatedAt = new Date().toISOString();
      if (own(root.meta, 'lastUpdated')) root.meta.lastUpdated = new Date().toISOString();
    }
    return root;
  }

  function slug(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[^\w\u3131-\uD79D]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'item';
  }

  function uniqueId(base, used) {
    let candidate = slug(base);
    let suffix = 2;
    while (used.has(candidate)) candidate = `${slug(base)}-${suffix++}`;
    used.add(candidate);
    return candidate;
  }

  function createRoute(model) {
    const used = new Set(model.routes.map((route) => route.id));
    return {
      id: uniqueId(`route-${model.routes.length + 1}`, used),
      name: '새 노선', region: '', direction: '', service: '', days: '', active: true, notes: '',
      stops: [], _raw: {}, _map: clone(model.preferredRouteMap || DEFAULT_ROUTE_MAP),
      _stopMap: clone(model.preferredStopMap || DEFAULT_STOP_MAP), _isNew: true
    };
  }

  function createStop(model, route) {
    const used = new Set(model.routes.flatMap((item) => item.stops.map((stop) => stop.id)));
    return {
      id: uniqueId(`${route.id}-stop-${route.stops.length + 1}`, used),
      name: '', time: '', address: '', notes: '', _raw: {},
      _map: clone(route._stopMap || model.preferredStopMap || DEFAULT_STOP_MAP), _isNew: true
    };
  }

  function validate(model) {
    const errors = [];
    const warnings = [];
    const routeIds = new Map();
    const stopIds = new Map();
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

    model.routes.forEach((route, routeIndex) => {
      const routeLabel = route.name || `노선 ${routeIndex + 1}`;
      if (!route.id.trim()) errors.push(`${routeLabel}: 노선 ID가 비어 있습니다.`);
      if (!route.name.trim()) errors.push(`노선 ${routeIndex + 1}: 노선명이 비어 있습니다.`);
      if (routeIds.has(route.id)) errors.push(`${routeLabel}: 노선 ID “${route.id}”가 중복됩니다.`);
      routeIds.set(route.id, true);
      if (!route.stops.length) warnings.push(`${routeLabel}: 정류장이 없습니다.`);

      route.stops.forEach((stop, stopIndex) => {
        const stopLabel = `${routeLabel} / ${stop.name || `정류장 ${stopIndex + 1}`}`;
        if (!stop.id.trim()) errors.push(`${stopLabel}: 정류장 ID가 비어 있습니다.`);
        if (!stop.name.trim()) errors.push(`${stopLabel}: 정류장명이 비어 있습니다.`);
        if (stop.time && !timePattern.test(stop.time)) errors.push(`${stopLabel}: 시간 “${stop.time}”은 HH:MM 형식이 아닙니다.`);
        if (stopIds.has(stop.id)) errors.push(`${stopLabel}: 정류장 ID “${stop.id}”가 중복됩니다.`);
        stopIds.set(stop.id, true);
      });
    });

    return { errors, warnings, valid: errors.length === 0 };
  }

  function cleanForStorage(model) {
    return clone(model);
  }

  return {
    normalizeDocument, denormalizeDocument, createRoute, createStop, validate,
    cleanForStorage, uniqueId, clone
  };
});
