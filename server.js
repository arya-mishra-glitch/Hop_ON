/**
 * HopOn - City Bus Finder Backend
 * Node.js + Express server that reads bus stop and route data from CSV files
 * and exposes REST API endpoints for the frontend.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────────
app.use(cors());                          // Allow cross-origin requests from the frontend
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files

// ──────────────────────────────────────────────
// In-memory data stores (loaded once at startup)
// ──────────────────────────────────────────────
let stops = [];    // Array of { stop_id, stop_name, lat, lon }
let routes = [];   // Array of { route_id, bus_details, stop_ids: [] }

// ──────────────────────────────────────────────
// CSV Parsing Helpers
// ──────────────────────────────────────────────

/**
 * Minimal CSV parser that handles quoted fields.
 * Returns an array of objects keyed by the header row.
 */
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').map(l => l.trimEnd());

  // Extract header, normalise column names (trim + lowercase)
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = splitCSVLine(line);
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = (values[idx] || '').trim().replace(/^"|"$/g, '');
    });
    records.push(record);
  }
  return records;
}

/**
 * Splits a single CSV line respecting double-quoted fields.
 */
function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ──────────────────────────────────────────────
// Load CSV data into memory on server start
// ──────────────────────────────────────────────
function loadData() {
  try {
    // ── Stops ──
    const rawStops = parseCSV(path.join(__dirname, 'data', 'stopdata.csv'));
    stops = rawStops
      .filter(r => r.stop_id && r.lat && r.lng)
      .map(r => ({
        stop_id: r.stop_id.trim(),
        stop_name: (r['stop name'] || r.stop_name || '').trim(),
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lng),   // CSV header is "Lng"
      }))
      .filter(s => !isNaN(s.lat) && !isNaN(s.lon));

    console.log(`✅ Loaded ${stops.length} stops`);

    // Build a fast stop_id → stop lookup map
    const stopMap = {};
    stops.forEach(s => { stopMap[s.stop_id] = s; });

    // ── Routes ──
    const rawRoutes = parseCSV(path.join(__dirname, 'data', 'routedata.csv'));
    routes = rawRoutes
      .filter(r => r.route_id)
      .map(r => {
        // The "route" column is a space-separated list of stop IDs
        const stopIds = (r.route || '')
          .trim()
          .split(/\s+/)
          .filter(id => id.length > 0);

        return {
          route_id:    r.route_id.trim(),
          bus_details: (r.bus_details || '').trim(),
          stop_ids:    stopIds,
          // Pre-join stop details so we don't repeat this on every request
          stops: stopIds
            .map(id => stopMap[id])
            .filter(Boolean),          // drop IDs that don't exist in stopdata
        };
      });

    console.log(`✅ Loaded ${routes.length} routes`);
  } catch (err) {
    console.error('❌ Failed to load CSV data:', err.message);
    process.exit(1);
  }
}

// ──────────────────────────────────────────────
// Haversine distance (returns km)
// ──────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return (deg * Math.PI) / 180; }

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────

/**
 * GET /stops
 * Returns all stops.
 *
 * Example response:
 * [
 *   { "stop_id": "0", "stop_name": "CEMENTRY(MANDAVELI)", "lat": 13.0299, "lon": 80.26191 },
 *   ...
 * ]
 */
app.get('/stops', (req, res) => {
  res.json(stops);
});

/**
 * GET /routes
 * Returns a summary of all routes (without full stop details).
 */
app.get('/routes', (req, res) => {
  const summary = routes.map(r => ({
    route_id:    r.route_id,
    bus_details: r.bus_details,
    stop_count:  r.stops.length,
    first_stop:  r.stops[0]?.stop_name  || null,
    last_stop:   r.stops[r.stops.length - 1]?.stop_name || null,
  }));
  res.json(summary);
});

/**
 * GET /routes/:route_id
 * Returns full stop details for a specific route (joined with stopdata).
 *
 * Example response:
 * {
 *   "route_id": "1101",
 *   "bus_details": "19B-Towards-saidapet",
 *   "stops": [
 *     { "stop_id": "4032", "stop_name": "KELAMBAKKAM", "lat": 12.786396, "lon": 80.220312 },
 *     ...
 *   ]
 * }
 */
app.get('/routes/:route_id', (req, res) => {
  const route = routes.find(r => r.route_id === req.params.route_id);
  if (!route) {
    return res.status(404).json({ error: `Route ${req.params.route_id} not found` });
  }
  res.json({
    route_id:    route.route_id,
    bus_details: route.bus_details,
    stops:       route.stops,
  });
});

/**
 * GET /nearby?lat=<lat>&lon=<lon>&radius=<km>
 * Returns stops within `radius` km (default 2 km), sorted by distance,
 * limited to the closest 10.
 * Also includes which routes serve each stop.
 *
 * Example: GET /nearby?lat=13.0299&lon=80.26191
 *
 * Example response:
 * [
 *   {
 *     "stop_id": "0",
 *     "stop_name": "CEMENTRY(MANDAVELI)",
 *     "lat": 13.0299,
 *     "lon": 80.26191,
 *     "distance_km": 0.00,
 *     "routes": ["1101", "1102"]
 *   },
 *   ...
 * ]
 */
app.get('/nearby', (req, res) => {
  const lat    = parseFloat(req.query.lat);
  const lon    = parseFloat(req.query.lon);
  const radius = parseFloat(req.query.radius) || 2; // km

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'lat and lon query parameters are required' });
  }

  // Build a map: stop_id → [route_ids] for quick lookup
  const stopRouteMap = {};
  routes.forEach(r => {
    r.stop_ids.forEach(sid => {
      if (!stopRouteMap[sid]) stopRouteMap[sid] = [];
      stopRouteMap[sid].push(r.route_id);
    });
  });

  const nearby = stops
    .map(stop => ({
      ...stop,
      distance_km: Math.round(haversine(lat, lon, stop.lat, stop.lon) * 100) / 100,
      routes: stopRouteMap[stop.stop_id] || [],
    }))
    .filter(s => s.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 10); // Bonus: limit to closest 10

  res.json(nearby);
});

/**
 * GET /search?q=<query>
 * Simple stop name search (case-insensitive, partial match).
 */
app.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);

  const results = stops
    .filter(s => s.stop_name.toLowerCase().includes(q))
    .slice(0, 20);

  res.json(results);
});

/**
 * GET /plan?from=<stop_name_or_id>&to=<stop_name_or_id>
 *   OR
 * GET /plan?fromLat=&fromLon=&toLat=&toLon=
 *
 * Finds bus routes connecting two locations.
 * Strategy:
 *   1. Identify candidate "from" stops (nearest to origin) and "to" stops (nearest to destination)
 *   2. For each route, check if it passes through BOTH a from-stop and a to-stop
 *   3. Return direct routes first, then suggest 1-transfer options
 *
 * Response:
 * {
 *   from: { name, lat, lon },
 *   to:   { name, lat, lon },
 *   direct: [ { route_id, bus_details, board_stop, alight_stop, stop_count } ],
 *   transfers: [ { legs: [{route_id, bus_details, board_stop, alight_stop}] } ]
 * }
 */
app.get('/plan', (req, res) => {
  const { from, to, fromLat, fromLon, toLat, toLon } = req.query;

  // ── Resolve origin and destination stop sets ──────────────────────
  function resolveStops(nameOrId, lat, lon) {
    if (lat && lon) {
      // Find stops within 1.5 km of coordinate
      const nearby = stops
        .map(s => ({ ...s, dist: haversine(parseFloat(lat), parseFloat(lon), s.lat, s.lon) }))
        .filter(s => s.dist <= 1.5)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);
      return nearby;
    }
    if (nameOrId) {
      const q = nameOrId.toLowerCase();
      const byId = stops.filter(s => s.stop_id === nameOrId);
      if (byId.length) return byId;
      return stops.filter(s => s.stop_name.toLowerCase().includes(q)).slice(0, 5);
    }
    return [];
  }

  const fromStops = resolveStops(from, fromLat, fromLon);
  const toStops   = resolveStops(to, toLat, toLon);

  if (!fromStops.length || !toStops.length) {
    return res.status(400).json({ error: 'Could not locate origin or destination stops.' });
  }

  const fromIds = new Set(fromStops.map(s => s.stop_id));
  const toIds   = new Set(toStops.map(s => s.stop_id));

  // ── Build stop_id → index map per route for ordered traversal ────
  // direct[]: routes that contain both a from-stop and a to-stop (in order)
  const direct = [];
  // For transfer planning: route_id → stop index map
  const routeStopIndex = new Map(); // route_id → { stop_id: index }

  routes.forEach(route => {
    const idxMap = {};
    route.stop_ids.forEach((sid, i) => { idxMap[sid] = i; });
    routeStopIndex.set(route.route_id, idxMap);

    let boardStop = null, alightStop = null, boardIdx = Infinity;

    route.stop_ids.forEach((sid, idx) => {
      if (fromIds.has(sid) && idx < boardIdx) {
        boardIdx = idx;
        boardStop = fromStops.find(s => s.stop_id === sid);
      }
    });

    if (boardStop) {
      route.stop_ids.forEach((sid, idx) => {
        if (toIds.has(sid) && idx > boardIdx) {
          alightStop = toStops.find(s => s.stop_id === sid);
        }
      });
    }

    if (boardStop && alightStop) {
      const alightIdx = routeStopIndex.get(route.route_id)[alightStop.stop_id];
      direct.push({
        route_id:    route.route_id,
        bus_details: route.bus_details,
        board_stop:  boardStop,
        alight_stop: alightStop,
        stop_count:  alightIdx - boardIdx,
        stops_along: route.stops.slice(boardIdx, alightIdx + 1),
      });
    }
  });

  // Sort direct by fewest stops
  direct.sort((a, b) => a.stop_count - b.stop_count);

  // ── Transfer routes (1 transfer) – only if fewer than 3 direct found ──
  const transfers = [];

  if (direct.length < 3) {
    // Routes that pass through a from-stop
    const fromRoutes = routes.filter(r =>
      r.stop_ids.some(sid => fromIds.has(sid))
    );
    // Routes that pass through a to-stop
    const toRoutes = routes.filter(r =>
      r.stop_ids.some(sid => toIds.has(sid))
    );

    // Find common stops between fromRoutes and toRoutes
    outerLoop:
    for (const r1 of fromRoutes) {
      for (const r2 of toRoutes) {
        if (r1.route_id === r2.route_id) continue;

        // Find transfer stop: a stop that appears in both r1 (after from) and r2 (before to)
        const r1Idx = routeStopIndex.get(r1.route_id);
        const r2Idx = routeStopIndex.get(r2.route_id);

        // board index on r1
        let r1BoardIdx = Infinity, r1BoardStop = null;
        r1.stop_ids.forEach((sid, i) => {
          if (fromIds.has(sid) && i < r1BoardIdx) {
            r1BoardIdx = i; r1BoardStop = fromStops.find(s => s.stop_id === sid);
          }
        });
        if (!r1BoardStop) continue;

        // alight index on r2
        let r2AlightIdx = -1, r2AlightStop = null;
        r2.stop_ids.forEach((sid, i) => {
          if (toIds.has(sid) && i > r2AlightIdx) {
            r2AlightIdx = i; r2AlightStop = toStops.find(s => s.stop_id === sid);
          }
        });
        if (!r2AlightStop) continue;

        // Find a transfer stop: in r1 after board AND in r2 before alight
        for (let i = r1BoardIdx + 1; i < r1.stop_ids.length; i++) {
          const transferSid = r1.stop_ids[i];
          if (r2Idx[transferSid] !== undefined && r2Idx[transferSid] < r2AlightIdx) {
            const transferStop = stops.find(s => s.stop_id === transferSid);
            if (transferStop) {
              transfers.push({
                legs: [
                  { route_id: r1.route_id, bus_details: r1.bus_details, board_stop: r1BoardStop, alight_stop: transferStop },
                  { route_id: r2.route_id, bus_details: r2.bus_details, board_stop: transferStop, alight_stop: r2AlightStop },
                ],
              });
              if (transfers.length >= 3) break outerLoop;
              break;
            }
          }
        }
      }
    }
  }

  res.json({
    from: fromStops[0],
    to:   toStops[0],
    direct:    direct.slice(0, 3),
    transfers: transfers.slice(0, 2),
  });
});

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
loadData();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚌 HopOn backend running at http://localhost:${PORT}`);
  console.log(`   GET /stops            – all stops`);
  console.log(`   GET /routes           – all routes summary`);
  console.log(`   GET /routes/:id       – stops for one route`);
  console.log(`   GET /nearby?lat=&lon= – stops near a coordinate`);
  console.log(`   GET /search?q=        – search stops by name`);
  console.log(`   GET /plan?...         – plan a route between two points\n`);
});
