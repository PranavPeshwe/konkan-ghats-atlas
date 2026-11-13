export function initialState() {
  return {
    mode: 'ghats', focus: null, query: '', borAlignment: 'all',
    filters: { maxDistance: null, maxTime: null, difficulty: null, scenery: null },
    selectedIds: new Set(), hoveredId: null, mapView: 'network',
    weights: { time: 5, distance: 5, scenery: 5, difficulty: 5 },
    comparisonOpen: false
  };
}

export function reduceState(state, action) {
  switch (action.type) {
    case 'focus': {
      const replaceSelection = Array.isArray(action.selectedIds);
      return {
        ...state, mode: action.mode, focus: action.id ? { type: action.mode, id: action.id } : null,
        hoveredId: null, selectedIds: replaceSelection ? new Set(action.selectedIds) : state.selectedIds,
        mapView: replaceSelection && action.selectedIds.length ? 'selected' : 'network'
      };
    }
    case 'reset':
      return initialState();
    case 'bor-alignment':
      return ['all', 'old-highway', 'expressway-missing-link', 'expressway-original'].includes(action.id)
        ? { ...state, borAlignment: action.id, hoveredId: null, mapView: 'network' } : state;
    case 'mode':
      return { ...state, mode: action.mode, focus: null, hoveredId: null, mapView: 'network' };
    case 'query':
      return { ...state, query: action.value, hoveredId: null };
    case 'filters':
      return { ...state, filters: { ...state.filters, ...action.value }, hoveredId: null };
    case 'reset-filters':
      return { ...state, query: '', filters: initialState().filters, hoveredId: null };
    case 'toggle-route': {
      const selectedIds = new Set(state.selectedIds);
      if (selectedIds.has(action.id)) selectedIds.delete(action.id);
      else selectedIds.add(action.id);
      return { ...state, selectedIds, hoveredId: state.hoveredId === action.id && !selectedIds.has(action.id) ? null : state.hoveredId, mapView: selectedIds.size ? 'selected' : 'network' };
    }
    case 'hover':
      return { ...state, hoveredId: action.id };
    case 'trace-route':
      return { ...state, hoveredId: action.id, mapView: 'route' };
    case 'map-view':
      return { ...state, mapView: action.value, hoveredId: null };
    case 'weight':
      return reduceState(state, { type: 'weights', value: { [action.key]: action.value } });
    case 'weights': {
      const weights = { ...state.weights };
      for (const [key, value] of Object.entries(action.value)) {
        if (key in weights && Number.isFinite(value)) weights[key] = Math.max(0, Math.min(10, value));
      }
      if (Object.keys(weights).every(key => weights[key] === state.weights[key])) return state;
      return { ...state, weights };
    }
    case 'comparison':
      return { ...state, comparisonOpen: action.open };
    case 'clear-selection':
      return { ...state, selectedIds: new Set(), hoveredId: null, mapView: 'network' };
    default:
      return state;
  }
}

export function createStore() {
  let state = initialState();
  const listeners = new Set();
  return {
    get state() { return state; },
    dispatch(action) {
      const next = reduceState(state, action);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state, action);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
