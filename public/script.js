/**
 * HopOn – frontend JavaScript
 * Connects to the Express backend at http://localhost:3000
 */

const API_BASE = 'https://hop-on.onrender.com';   // ← removed trailing slash

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

function showToast(msg, isError = true) {
  let t = document.getElementById('api-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'api-toast';
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;' +
      'z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.25);';
    document.body.appendChild(t);
  }
  t.style.background = isError ? '#e53e3e' : '#43866B';
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

document.addEventListener('DOMContentLoaded', function () {

  // ── Navigation ──────────────────────────────
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href && href !== '#') return;
      e.preventDefault();
      const map = {
        'Home': 'index.html',
        'Nearby Bus Stops': 'nearby-stops.html',
        'Bus Routes': 'bus-routes.html',
        'Tourist Places Near Me': 'tourist-places.html',
        'Help': 'help.html',
      };
      const dest = map[this.textContent.trim()];
      if (dest) window.location.href = dest;
    });
    link.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-2px)';
      this.style.transition = 'transform 0.2s ease';
    });
    link.addEventListener('mouseleave', function () { this.style.transform = ''; });
  });

  // ── "Bus Stops Near Me" button ───────────────
  const primaryAction = document.querySelector('.primary-action');
  if (primaryAction) {
    primaryAction.addEventListener('click', function () {
      if (!('geolocation' in navigator)) { alert('Geolocation not supported.'); return; }
      const h2 = this.querySelector('h2');
      const orig = h2.textContent;
      h2.textContent = 'Getting Location\u2026';
      this.style.opacity = '0.7';
      navigator.geolocation.getCurrentPosition(
        p => { window.location.href = `nearby-stops.html?lat=${p.coords.latitude}&lon=${p.coords.longitude}`; },
        () => { alert('Enable location services and try again.'); h2.textContent = orig; this.style.opacity = '1'; }
      );
    });
  }

  // ── Route Search Form (index.html) ───────────
  const startInput = document.getElementById('start');
  const endInput   = document.getElementById('end');
  const searchBtn  = document.querySelector('.search-btn');

  let fromCoords = null, toCoords = null;

  if (startInput) {
    startInput.addEventListener('focus', function () {
      if ((this.value === '' || this.value === 'My Location') && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
          this.value = 'My Location (' + p.coords.latitude.toFixed(4) + ', ' + p.coords.longitude.toFixed(4) + ')';
          fromCoords = { lat: p.coords.latitude, lon: p.coords.longitude };
        });
      }
    });
  }

  function setupAutocomplete(input, onSelect) {
    if (!input) return;
    const wrapper = input.closest('.input-group') || input.parentElement;
    wrapper.style.position = 'relative';

    let list = wrapper.querySelector('.suggestions-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'suggestions-list';
      wrapper.appendChild(list);
    }

    let timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      const q = this.value.trim();
      if (q.length < 2) { list.style.display = 'none'; return; }
      timer = setTimeout(async () => {
        try {
          const results = await apiFetch('/search?q=' + encodeURIComponent(q));
          list.innerHTML = '';
          if (!results.length) { list.style.display = 'none'; return; }
          list.style.display = 'block';
          results.slice(0, 8).forEach(stop => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = stop.stop_name;
            item.addEventListener('click', () => {
              input.value = stop.stop_name;
              list.style.display = 'none';
              onSelect(stop);
            });
            list.appendChild(item);
          });
        } catch { /* silent */ }
      }, 220);
    });

    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) list.style.display = 'none';
    });
  }

  setupAutocomplete(startInput, stop => {
    fromCoords = { lat: stop.lat, lon: stop.lon, name: stop.stop_name };
  });
  setupAutocomplete(endInput, stop => {
    toCoords = { lat: stop.lat, lon: stop.lon, name: stop.stop_name };
  });

  if (searchBtn) {
    searchBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      const fromVal = (startInput ? startInput.value : '').trim();
      const toVal   = (endInput   ? endInput.value   : '').trim();

      if (!fromVal || fromVal === 'My Location') {
        alert('Please enter or select your starting location.'); if (startInput) startInput.focus(); return;
      }
      if (!toVal || toVal === 'Enter destination') {
        alert('Please enter your destination.'); if (endInput) endInput.focus(); return;
      }

      this.textContent = 'Searching\u2026';
      this.disabled = true;

      const ps = new URLSearchParams({ from: fromVal, to: toVal });
      if (fromCoords) { ps.set('fromLat', fromCoords.lat); ps.set('fromLon', fromCoords.lon); }
      if (toCoords)   { ps.set('toLat',   toCoords.lat);   ps.set('toLon',   toCoords.lon);   }

      setTimeout(() => { window.location.href = 'search-results.html?' + ps.toString(); }, 400);
    });

    [startInput, endInput].forEach(inp => {
      if (inp) inp.addEventListener('keypress', e => { if (e.key === 'Enter') searchBtn.click(); });
    });
  }

  // ── Map container hover ──────────────────────
  const mapContainer = document.querySelector('.map-container');
  if (mapContainer) {
    mapContainer.style.cursor = 'pointer';
    mapContainer.addEventListener('mouseenter', function () {
      this.style.transform = 'scale(1.02)';
      this.style.transition = 'transform 0.3s ease';
    });
    mapContainer.addEventListener('mouseleave', function () { this.style.transform = ''; });
  }

  // ── View Schedule buttons ────────────────────
  document.querySelectorAll('.view-schedule-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const id = this.dataset.route;
      this.textContent = 'Loading\u2026';
      this.disabled = true;
      setTimeout(() => { window.location.href = 'schedule.html?route=' + id; }, 350);
    });
  });

  // ── Location banner ──────────────────────────
  const locationBanner = document.querySelector('.location-banner');
  if (locationBanner) {
    locationBanner.style.cursor = 'pointer';
    locationBanner.addEventListener('click', () => {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        p => { window.location.href = 'nearby-stops.html?lat=' + p.coords.latitude + '&lon=' + p.coords.longitude; },
        () => alert('Could not get location.')
      );
    });
  }

  // ── Page-specific loaders ────────────────────
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (page === 'nearby-stops.html' || page === '') loadNearbyStops();
  if (page === 'bus-routes.html')                  loadBusRoutes();
  if (page === 'search-results.html')              loadSearchResults();
  if (page === 'schedule.html')                    loadSchedule();
});

// ════════════════════════════════════════════
// NEARBY STOPS
// ════════════════════════════════════════════
async function loadNearbyStops() {
  const params    = new URLSearchParams(window.location.search);
  const lat       = params.get('lat');
  const lon       = params.get('lon');
  const stopsList = document.querySelector('.stops-list');
  if (!stopsList) return;

  const locText = document.querySelector('.location-text strong');
  if (locText && lat && lon) {
    locText.textContent = parseFloat(lat).toFixed(4) + ', ' + parseFloat(lon).toFixed(4);
  }

  if (!lat || !lon) {
    stopsList.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#666;"><div style="font-size:48px;margin-bottom:16px;">📍</div><p style="font-size:16px;font-weight:600;color:#333;">Location not shared</p><p>Click "Bus Stops Near Me" on the home page to see stops near you.</p></div>';
    return;
  }

  stopsList.innerHTML = '<div style="text-align:center;padding:40px;color:#666;"><div style="font-size:32px;margin-bottom:10px;">🔍</div><p>Finding stops near you\u2026</p></div>';

  try {
    const nearbyStops = await apiFetch('/nearby?lat=' + lat + '&lon=' + lon);
    stopsList.innerHTML = '';

    if (!nearbyStops.length) {
      stopsList.innerHTML = '<p style="text-align:center;color:#666;padding:30px;">No bus stops found within 2 km.</p>';
      return;
    }

    nearbyStops.forEach((stop, i) => {
      const item = document.createElement('div');
      item.className = 'stop-item';
      item.style.cssText = 'opacity:0;transform:translateY(20px);';

      const badges = stop.routes.slice(0, 6).map(r =>
        '<span style="display:inline-block;background:#e6f4ef;color:#2e7d62;border-radius:6px;padding:2px 7px;font-size:12px;font-weight:600;margin:2px;">' + r + '</span>'
      ).join('');

      item.innerHTML =
        '<div class="stop-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none">' +
        '<rect x="5" y="6" width="14" height="12" rx="2" fill="#43866B" stroke="#43866B" stroke-width="1.5"/>' +
        '<rect x="7" y="9" width="4" height="4" rx="0.5" fill="white"/>' +
        '<rect x="13" y="9" width="4" height="4" rx="0.5" fill="white"/>' +
        '<circle cx="9" cy="19" r="1.5" fill="#43866B"/>' +
        '<circle cx="15" cy="19" r="1.5" fill="#43866B"/>' +
        '</svg></div>' +
        '<div class="stop-info"><h3>' + stop.stop_name + '</h3>' +
        '<p class="stop-distance">' + stop.distance_km + ' km away</p>' +
        '<div style="margin-top:6px;">' + badges + '</div></div>' +
        '<button class="view-routes-btn" data-stop="' + stop.stop_name + '">View Routes ›</button>';

      stopsList.appendChild(item);
      setTimeout(() => {
        item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
      }, i * 80);
    });

    stopsList.querySelectorAll('.view-routes-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        this.textContent = 'Loading\u2026'; this.disabled = true;
        setTimeout(() => { window.location.href = 'bus-routes.html?stop=' + encodeURIComponent(this.dataset.stop); }, 350);
      });
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'search-btn';
    refreshBtn.style.cssText = 'margin-top:20px;width:100%;background:#43866B;';
    refreshBtn.innerHTML = '🔄 Refresh My Location';
    refreshBtn.addEventListener('click', function () {
      this.textContent = '📍 Getting location\u2026'; this.disabled = true;
      navigator.geolocation.getCurrentPosition(
        p => { window.location.href = 'nearby-stops.html?lat=' + p.coords.latitude + '&lon=' + p.coords.longitude; },
        () => { alert('Unable to get location.'); refreshBtn.textContent = '🔄 Refresh My Location'; refreshBtn.disabled = false; }
      );
    });
    stopsList.parentElement.appendChild(refreshBtn);

  } catch (err) {
    stopsList.innerHTML = '<div style="text-align:center;padding:30px;color:#e53e3e;"><p>⚠️ Could not load stops. Make sure the backend is running.</p><p style="font-size:12px;color:#999;">' + err.message + '</p></div>';
  }
}

// ════════════════════════════════════════════
// BUS ROUTES PAGE
// ════════════════════════════════════════════
async function loadBusRoutes() {
  const routesList = document.querySelector('.routes-list');
  if (!routesList) return;
  try {
    const allRoutes = await apiFetch('/routes');
    if (!allRoutes.length) return;
    routesList.innerHTML = '';
    allRoutes.forEach(route => {
      const parts = route.bus_details.split('-');
      const busNum    = parts[0];
      const direction = parts.slice(1).join(' ').replace(/_/g, ' ');
      const item = document.createElement('div');
      item.className = 'route-item';
      item.innerHTML =
        '<div class="route-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none">' +
        '<rect x="5" y="6" width="14" height="12" rx="2" fill="#43866B" stroke="#43866B" stroke-width="1.5"/>' +
        '<rect x="7" y="9" width="4" height="4" rx="0.5" fill="white"/>' +
        '<rect x="13" y="9" width="4" height="4" rx="0.5" fill="white"/>' +
        '<circle cx="9" cy="19" r="1.5" fill="#43866B"/>' +
        '<circle cx="15" cy="19" r="1.5" fill="#43866B"/>' +
        '</svg></div>' +
        '<div class="route-details">' +
        '<h3>Route ' + busNum + ' \u2013 ' + direction + '</h3>' +
        '<p class="route-path"><strong>From:</strong> ' + (route.first_stop || '\u2014') + ' &nbsp;\u2192&nbsp; <strong>To:</strong> ' + (route.last_stop || '\u2014') + '</p>' +
        '<p class="route-stops"><strong>Stops:</strong> ' + route.stop_count + '</p>' +
        '</div>' +
        '<button class="view-schedule-btn" data-route="' + route.route_id + '">View Schedule \u203a</button>';
      routesList.appendChild(item);
    });
    routesList.querySelectorAll('.view-schedule-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        this.textContent = 'Loading\u2026'; this.disabled = true;
        setTimeout(() => { window.location.href = 'schedule.html?route=' + this.dataset.route; }, 350);
      });
    });
  } catch { /* fallback to static HTML */ }
}

// ════════════════════════════════════════════
// SCHEDULE PAGE
// ════════════════════════════════════════════
async function loadSchedule() {
  const routeId = new URLSearchParams(window.location.search).get('route');
  if (!routeId) return;
  try {
    const route = await apiFetch('/routes/' + routeId);
    const parts = route.bus_details.split('-');
    const busNum    = parts[0];
    const direction = parts.slice(1).join(' ').replace(/_/g, ' ');

    const nameEl = document.getElementById('route-name');
    const pathEl = document.getElementById('route-path');
    if (nameEl) nameEl.textContent = 'Route ' + busNum + ' \u2013 ' + direction;

    const firstStop = route.stops.length ? route.stops[0].stop_name : '\u2014';
    const lastStop  = route.stops.length ? route.stops[route.stops.length - 1].stop_name : '\u2014';
    const pathText  = firstStop + ' \u2192 ' + lastStop;
    if (pathEl) pathEl.textContent = pathText;

    const container = document.querySelector('.stops-timeline');
    if (container && route.stops.length) {
      container.innerHTML = '';
      route.stops.forEach((stop, i) => {
        const isLast = i === route.stops.length - 1;
        const div = document.createElement('div');
        div.className = 'stop-timeline-item';
        div.innerHTML =
          '<div class="stop-marker' + (isLast ? ' end' : '') + '"></div>' +
          '<div class="stop-content"><strong>' + stop.stop_name + '</strong>' +
          '<span class="stop-time">' + (i === 0 ? 'Start' : isLast ? 'End' : 'Stop ' + (i + 1)) + '</span></div>';
        container.appendChild(div);
      });
    }

    document.querySelectorAll('input[name="direction"]').forEach(radio => {
      radio.addEventListener('change', function () {
        if (!pathEl) return;
        pathEl.textContent = this.value === 'inbound' ? lastStop + ' \u2192 ' + firstStop : pathText;
      });
    });
  } catch { /* keep static content */ }

  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', function () {
      tabs.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  let found = false;
  document.querySelectorAll('.time-slot').forEach(slot => {
    const parts2 = slot.textContent.trim().split(' ');
    const timeParts = parts2[0].split(':').map(Number);
    const period = parts2[1] || '';
    let hr = timeParts[0];
    if (period === 'PM' && hr !== 12) hr += 12;
    if (period === 'AM' && hr === 12) hr = 0;
    if (!found && hr * 60 + timeParts[1] > cur) { slot.classList.add('next-bus'); found = true; }
  });
}

// ════════════════════════════════════════════
// SEARCH RESULTS PAGE
// ════════════════════════════════════════════
async function loadSearchResults() {
  const params  = new URLSearchParams(window.location.search);
  const fromVal = params.get('from')    || '';
  const toVal   = params.get('to')      || '';
  const fromLat = params.get('fromLat') || '';
  const fromLon = params.get('fromLon') || '';
  const toLat   = params.get('toLat')   || '';
  const toLon   = params.get('toLon')   || '';

  const destEl       = document.getElementById('destination-name');
  const toNameEl     = document.getElementById('to-location-name');
  const fromDetailEl = document.getElementById('from-location-detail');
  if (destEl)       destEl.textContent      = toVal   || 'Your Destination';
  if (toNameEl)     toNameEl.textContent    = toVal   || 'Your Destination';
  if (fromDetailEl) fromDetailEl.textContent = fromVal || 'Current Location';

  const loadingDots = document.querySelector('.loading-dots');
  if (loadingDots) loadingDots.textContent = 'Finding the best routes for you\u2026';

  try {
    const planParams = new URLSearchParams({ from: fromVal, to: toVal });
    if (fromLat && fromLon) { planParams.set('fromLat', fromLat); planParams.set('fromLon', fromLon); }
    if (toLat   && toLon)   { planParams.set('toLat',   toLat);   planParams.set('toLon',   toLon);   }

    const plan = await apiFetch('/plan?' + planParams.toString());
    const totalFound = plan.direct.length + plan.transfers.length;

    if (loadingDots) {
      loadingDots.textContent = totalFound > 0
        ? 'Found ' + totalFound + ' route option' + (totalFound > 1 ? 's' : '') + ' \u2713'
        : 'No bus routes found between these stops';
      loadingDots.style.color = totalFound > 0 ? '#43866B' : '#e53e3e';
    }

    if (totalFound === 0) { renderNoResults(fromVal, toVal); return; }

    if (plan.direct.length > 0) renderRecommendedRoute(plan.direct[0], plan.from, plan.to);
    else                        renderTransferRouteAsRecommended(plan.transfers[0], plan.from, plan.to);

    // Alternatives section
    const altSection = document.querySelector('.alternative-routes');
    if (altSection) {
      altSection.innerHTML = '';
      plan.direct.slice(1).forEach(r  => altSection.appendChild(buildAltDirectCard(r)));
      plan.transfers.forEach(t        => altSection.appendChild(buildAltTransferCard(t)));
      if (altSection.children.length > 0) {
        const h = document.createElement('h3');
        h.style.cssText = 'margin:30px 0 16px;color:#1a202c;font-size:18px;';
        h.textContent = 'Alternative Routes';
        altSection.prepend(h);
      }
    }

  } catch (err) {
    if (loadingDots) {
      loadingDots.textContent = '\u26a0\ufe0f Could not connect to server. Is the app deployed correctly?';  // ← removed "port 3000"
      loadingDots.style.color = '#e53e3e';
    }
  }

  // Entrance animation
  setTimeout(() => {
    document.querySelectorAll('.recommended-route-card, .alt-route-card').forEach((card, i) => {
      card.style.opacity = '0'; card.style.transform = 'translateY(20px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        card.style.opacity = '1'; card.style.transform = 'translateY(0)';
      }, 200 + i * 120);
    });
  }, 50);
}

function busNum(det) { return det.split('-')[0]; }
function busDir(det) { return det.split('-').slice(1).join(' ').replace(/_/g, ' '); }

function renderRecommendedRoute(route, fromStop, toStop) {
  const card = document.querySelector('.recommended-route-card');
  if (!card) return;
  const n = busNum(route.bus_details);
  const d = busDir(route.bus_details);
  const mins = Math.max(5, route.stop_count * 2);

  const busesEl = card.querySelector('.route-buses-container');
  if (busesEl) {
    busesEl.innerHTML =
      '<div class="bus-item"><div class="route-bus-badge green">' + n + '</div>' +
      '<span class="bus-label">' + d + '</span></div>';
  }
  const timeEl = card.querySelector('.route-time');
  if (timeEl) timeEl.textContent = mins + ' min';

  const stepsEl = card.querySelector('.route-steps');
  if (stepsEl) {
    const midStops = (route.stops_along || []).slice(1, -1).slice(0, 3);
    let midHTML = midStops.map(s =>
      '<div class="route-step"><div class="step-indicator">' +
      '<div class="step-icon" style="background:#43866B;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">' +
      '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="5" y="6" width="14" height="12" rx="2" fill="white"/></svg></div>' +
      '<div class="step-line"></div></div>' +
      '<div class="step-content"><h4>' + s.stop_name + '</h4><p>In transit</p></div></div>'
    ).join('');

    if (route.stop_count > midStops.length + 2) {
      midHTML += '<div class="route-step" style="opacity:0.6;"><div class="step-indicator">' +
        '<div class="step-icon" style="background:#ccc;border-radius:50%;width:24px;height:24px;margin:4px;"></div>' +
        '<div class="step-line"></div></div>' +
        '<div class="step-content"><p style="color:#718096;">' + (route.stop_count - midStops.length - 2) + ' more stops\u2026</p></div></div>';
    }

    stepsEl.innerHTML =
      '<div class="route-step"><div class="step-indicator">' +
      '<div class="step-icon board-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="white">' +
      '<path d="M12 21s7-7.75 7-13a7 7 0 0 0-14 0c0 5.25 7 13 7 13z" fill="white" stroke="white" stroke-width="2"/>' +
      '<circle cx="12" cy="8" r="3" fill="#5aa9a1"/></svg></div>' +
      '<div class="step-line"></div></div>' +
      '<div class="step-content"><h4>' + route.board_stop.stop_name + '</h4><p>Board Bus ' + n + ' here</p></div></div>' +
      midHTML +
      '<div class="route-step"><div class="step-indicator">' +
      '<div class="step-icon arrive-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="white">' +
      '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="white" stroke="white" stroke-width="2"/>' +
      '<circle cx="12" cy="10" r="2" fill="#c65d5d"/></svg></div></div>' +
      '<div class="step-content"><h4>' + route.alight_stop.stop_name + '</h4><p>Alight \u2013 your destination</p></div></div>';
  }
}

function renderTransferRouteAsRecommended(transfer, fromStop, toStop) {
  const card = document.querySelector('.recommended-route-card');
  if (!card) return;
  const legs = transfer.legs;
  const n1 = busNum(legs[0].bus_details), n2 = busNum(legs[1].bus_details);

  const busesEl = card.querySelector('.route-buses-container');
  if (busesEl) {
    busesEl.innerHTML =
      '<div class="bus-item"><div class="route-bus-badge orange">' + n1 + '</div><span class="bus-label">Board</span></div>' +
      '<div class="transfer-arrow"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#718096" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg><span class="transfer-label">Transfer</span></div>' +
      '<div class="bus-item"><div class="route-bus-badge blue">' + n2 + '</div><span class="bus-label">Continue</span></div>';
  }

  const stepsEl = card.querySelector('.route-steps');
  if (stepsEl) {
    stepsEl.innerHTML =
      '<div class="route-step"><div class="step-indicator"><div class="step-icon board-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 21s7-7.75 7-13a7 7 0 0 0-14 0c0 5.25 7 13 7 13z" fill="white" stroke="white" stroke-width="2"/><circle cx="12" cy="8" r="3" fill="#5aa9a1"/></svg></div><div class="step-line"></div></div><div class="step-content"><h4>' + legs[0].board_stop.stop_name + '</h4><p>Board Bus ' + n1 + '</p></div></div>' +
      '<div class="route-step"><div class="step-indicator"><div class="step-icon transfer-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><circle cx="12" cy="12" r="10" fill="white" stroke="white" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="#5aa9a1" stroke-width="2" stroke-linecap="round"/></svg></div><div class="step-line"></div></div><div class="step-content"><h4>' + legs[0].alight_stop.stop_name + '</h4><p>Transfer to Bus ' + n2 + '</p></div></div>' +
      '<div class="route-step"><div class="step-indicator"><div class="step-icon arrive-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="white" stroke="white" stroke-width="2"/><circle cx="12" cy="10" r="2" fill="#c65d5d"/></svg></div></div><div class="step-content"><h4>' + legs[1].alight_stop.stop_name + '</h4><p>Alight \u2013 your destination</p></div></div>';
  }
}

function buildAltDirectCard(route) {
  const n = busNum(route.bus_details);
  const d = busDir(route.bus_details);
  const mins = Math.max(5, route.stop_count * 2);
  const div = document.createElement('div');
  div.className = 'alt-route-card';
  div.innerHTML =
    '<div class="alt-route-header"><div class="alt-buses">' +
    '<div class="route-bus-badge green">' + n + '</div>' +
    '<span class="direct-badge">Direct</span></div>' +
    '<div class="alt-time">' + mins + ' min</div></div>' +
    '<p class="alt-route-description">' + d + ' \u2022 ' + route.stop_count + ' stops \u2022 Board at ' + route.board_stop.stop_name + '</p>' +
    '<button class="view-details-btn">View Details \u203a</button>' +
    '<div class="route-details-expanded" style="display:none;margin-top:12px;padding:12px;background:#f8fdfb;border-radius:8px;font-size:14px;">' +
    '<div><strong>Board:</strong> ' + route.board_stop.stop_name + '</div>' +
    '<div style="margin-top:6px;color:#718096;">' + route.stop_count + ' stops along the way</div>' +
    '<div style="margin-top:6px;"><strong>Alight:</strong> ' + route.alight_stop.stop_name + '</div></div>';

  div.querySelector('.view-details-btn').addEventListener('click', function () {
    const det = div.querySelector('.route-details-expanded');
    const showing = det.style.display !== 'none';
    det.style.display = showing ? 'none' : 'block';
    this.textContent = showing ? 'View Details \u203a' : 'Hide Details \u2039';
  });
  return div;
}

function buildAltTransferCard(transfer) {
  const legs = transfer.legs;
  const n1 = busNum(legs[0].bus_details), n2 = busNum(legs[1].bus_details);
  const div = document.createElement('div');
  div.className = 'alt-route-card';
  div.innerHTML =
    '<div class="alt-route-header"><div class="alt-buses">' +
    '<div class="route-bus-badge orange">' + n1 + '</div>' +
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#718096" stroke-width="2" style="margin:0 4px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
    '<div class="route-bus-badge blue">' + n2 + '</div>' +
    '<span style="font-size:12px;color:#718096;margin-left:6px;">1 transfer</span></div></div>' +
    '<p class="alt-route-description">Board ' + n1 + ' at ' + legs[0].board_stop.stop_name + ' \u2192 Transfer at ' + legs[0].alight_stop.stop_name + ' \u2192 Take ' + n2 + ' to ' + legs[1].alight_stop.stop_name + '</p>' +
    '<button class="view-details-btn">View Details \u203a</button>' +
    '<div class="route-details-expanded" style="display:none;margin-top:12px;padding:12px;background:#f8fdfb;border-radius:8px;font-size:14px;">' +
    '<div><strong>Leg 1:</strong> Bus ' + n1 + ' from ' + legs[0].board_stop.stop_name + ' \u2192 alight at ' + legs[0].alight_stop.stop_name + '</div>' +
    '<div style="margin-top:6px;"><strong>Transfer</strong> at ' + legs[1].board_stop.stop_name + '</div>' +
    '<div style="margin-top:6px;"><strong>Leg 2:</strong> Bus ' + n2 + ' from ' + legs[1].board_stop.stop_name + ' \u2192 alight at ' + legs[1].alight_stop.stop_name + '</div></div>';

  div.querySelector('.view-details-btn').addEventListener('click', function () {
    const det = div.querySelector('.route-details-expanded');
    const showing = det.style.display !== 'none';
    det.style.display = showing ? 'none' : 'block';
    this.textContent = showing ? 'View Details \u203a' : 'Hide Details \u2039';
  });
  return div;
}

function renderNoResults(from, to) {
  const card = document.querySelector('.recommended-route-card');
  if (!card) return;
  card.innerHTML =
    '<div style="text-align:center;padding:40px 20px;">' +
    '<div style="font-size:48px;margin-bottom:16px;">🚌</div>' +
    '<h3 style="color:#333;margin-bottom:8px;">No routes found</h3>' +
    '<p style="color:#666;font-size:14px;">No bus route found from <strong>' + from + '</strong> to <strong>' + to + '</strong>.</p>' +
    '<p style="color:#666;font-size:14px;margin-top:8px;">Tip: Type a stop name from the dataset (e.g. <em>SAIDAPET</em>, <em>KELAMBAKKAM</em>, <em>ADAYAR</em>) and select it from the dropdown.</p>' +
    '<button onclick="window.location.href=\'index.html\'" class="search-btn" style="margin-top:20px;display:inline-block;">Try Another Search</button></div>';
}

window.startNavigation = function () {
  const dest  = new URLSearchParams(window.location.search).get('to') || 'your destination';
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
  modal.innerHTML =
    '<div style="background:white;padding:40px;border-radius:16px;text-align:center;max-width:380px;">' +
    '<div style="font-size:48px;margin-bottom:16px;">🚌</div>' +
    '<h2 style="margin:0 0 10px;color:#1a202c;">Navigation Started!</h2>' +
    '<p style="color:#718096;margin:0 0 20px;">Head to your nearest bus stop and board the recommended route to <strong>' + dest + '</strong>.</p>' +
    '<button onclick="this.closest(\'div\').parentElement.remove()" style="background:#43866B;color:white;border:none;padding:12px 30px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Got it!</button></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.toggleRouteDetails = function (btn) {
  const card = btn.closest('.alt-route-card');
  let det = card.querySelector('.route-details-expanded');
  if (det) {
    const showing = det.style.display !== 'none';
    det.style.display = showing ? 'none' : 'block';
    btn.textContent = showing ? 'View Details \u203a' : 'Hide Details \u2039';
  }
};
