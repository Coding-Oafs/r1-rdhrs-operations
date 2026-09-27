import type { Connectivity, Facility, Incident, OperationsData, Provenance, StateCode } from "./types";
import { isStateCode, STATES } from "./types";
import { buildSampleData } from "./sample";

const NWS_URL = "https://api.weather.gov/alerts/active";
const USGS_URL = "https://cartowfs.nationalmap.gov/arcgis/rest/services/structures/FeatureServer/0/query";
const GEOBLACKOUT_URL = "https://geoblackout.com/us/report/internet";
const REQUEST_TIMEOUT_MS = 7500;

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const number = (value: unknown): number | null => {
  const parsed = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : null;
};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const iso = (value: unknown): string | null => {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
};

export function statusForTimestamp(timestamp: string | null, staleAfterHours: number): "live" | "stale" | "unavailable" {
  if (!timestamp) return "unavailable";
  return Date.now() - Date.parse(timestamp) > staleAfterHours * 3600_000 ? "stale" : "live";
}

async function getJson(url: string, headers: HeadersInit = {}, revalidate = 300): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/geo+json, application/json", "User-Agent": "R1-RDHRS-prototype/0.1 (source aggregation)", ...headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    next: { revalidate }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export function normalizeNeecFacilities(payload: unknown, fetchedAt: string): Facility[] {
  const data = record(payload);
  return list(data.features).flatMap((item, index) => {
    const feature = record(item);
    const properties = record(feature.properties);
    const geometry = record(feature.geometry);
    const coordinates = list(geometry.coordinates);
    const lng = number(coordinates[0]);
    const lat = number(coordinates[1]);
    const state = text(properties.state).toUpperCase();
    if (!isStateCode(state) || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const provenance: Provenance = {
      source: "NEEC healthcare facility catalog",
      status: "live",
      observedAt: null,
      fetchedAt,
      detail: "Actual facility location from NEEC. The catalog does not provide current ICU occupancy, ED boarding, or telehealth capability."
    };
    return [{
      id: String(properties.id ?? `neec-${index}`), name: text(properties.name) || "Unnamed facility",
      state, city: text(properties.city), lat, lng, icuOccupancy: null, edBoarding: null,
      capabilities: [], provenance
    }];
  });
}

export function normalizeUsgsFacilities(payload: unknown, fetchedAt: string): Facility[] {
  const data = record(payload);
  const features = list(data.features);
  if (features.length >= 1000 || data.exceededTransferLimit === true) throw new Error("USGS facility response may be truncated");
  return features.flatMap((item, index) => {
    const feature = record(item);
    const properties = record(feature.properties);
    const geometry = record(feature.geometry);
    const coords = list(geometry.coordinates);
    const lng = number(coords[0]), lat = number(coords[1]);
    const state = text(properties.state).toUpperCase();
    if (!isStateCode(state) || lat === null || lng === null) return [];
    const loadDate = number(properties.loaddate);
    const loaded = loadDate !== null ? new Date(loadDate) : null;
    const observedAt = loaded && Number.isFinite(loaded.getTime()) ? loaded.toISOString() : null;
    return [{
      id: `usgs-${String(properties.objectid ?? index)}`,
      name: text(properties.name) || "Unnamed medical center", state, city: text(properties.city), lat, lng,
      icuOccupancy: null, edBoarding: null, capabilities: [],
      provenance: {
        source: "USGS National Structures Dataset",
        status: "live", observedAt, fetchedAt,
        detail: "Public hospital/medical-center location catalog. Record load dates may be old; validate sites before operational use. No current capacity or telehealth status.",
        url: "https://cartowfs.nationalmap.gov/arcgis/rest/services/structures/FeatureServer/0"
      }
    }];
  });
}

async function fetchUsgsFacilities(fetchedAt: string): Promise<Facility[]> {
  const params = new URLSearchParams({
    where: "fcode=80012 AND state IN ('CT','ME','MA','NH','RI','VT')",
    outFields: "objectid,name,city,state,loaddate",
    returnGeometry: "true", outSR: "4326", resultRecordCount: "1000", f: "geojson"
  });
  return normalizeUsgsFacilities(await getJson(`${USGS_URL}?${params}`, {}, 3600), fetchedAt);
}

export function parseGeoBlackoutReports(html: string): { reports: number; observedAt: string } | null {
  // Adapted from NEEC's tested public-chart parser. The page is a national trend,
  // so no state or facility impact is inferred from these values.
  const block = html.match(/\\"label\\":\\"Reports\\",\\"data\\":\[(.*?)\],\\"borderColor\\"/s)?.[1]
    ?? html.match(/"label":"Reports","data":\[(.*?)\],"borderColor"/s)?.[1];
  if (!block) return null;
  const values: { reports: number; observedAt: string }[] = [];
  const pattern = /\\"x\\":\\"\$D([^\\"]+)\\",\\"y\\":(\d+)/g;
  for (const match of block.matchAll(pattern)) {
    const observedAt = iso(match[1]);
    const reports = number(match[2]);
    if (observedAt && reports !== null) values.push({ reports, observedAt });
  }
  if (!values.length) return null;
  return values.sort((a, b) => a.observedAt.localeCompare(b.observedAt)).at(-1) ?? null;
}

async function fetchGeoBlackoutTrend(fetchedAt: string): Promise<OperationsData["nationalInternetTrend"]> {
  const response = await fetch(GEOBLACKOUT_URL, {
    headers: { Accept: "text/html", "User-Agent": "R1-RDHRS-prototype/0.1 (source aggregation)" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    next: { revalidate: 900 }
  });
  if (!response.ok) throw new Error(`GeoBlackout ${response.status}`);
  const latest = parseGeoBlackoutReports(await response.text());
  if (!latest) throw new Error("GeoBlackout Reports series missing or changed format");
  return {
    ...latest,
    provenance: {
      source: "GeoBlackout US internet report trend",
      status: statusForTimestamp(latest.observedAt, 3), observedAt: latest.observedAt, fetchedAt,
      detail: "National user-report trend from a public chart. Not a Region 1 outage count, affected-user count, or facility telehealth status.",
      url: GEOBLACKOUT_URL
    }
  };
}

export function normalizeNeecConnectivity(
  summaryPayload: unknown,
  outagePayload: unknown,
  gridPayload: unknown,
  fetchedAt: string
): Connectivity[] {
  const summary = record(summaryPayload);
  const outage = record(outagePayload);
  const grid = record(gridPayload);
  const broadbandByState = record(summary.broadbandByState);
  const outageStates = new Map(list(outage.regionStates ?? outage.northeastStates).map((value) => {
    const row = record(value);
    return [text(row.code), row] as const;
  }));
  const observedMarkers = list(outage.sourceMarkers).map(record).filter((marker) =>
    marker.official === true && marker.estimated !== true
  );
  const observedAt = iso(outage.fetchedAt);
  const outageStatus = statusForTimestamp(observedAt, 24);
  return STATES.map((state) => {
    const stateRow = outageStates.get(state);
    const estimatedReports = stateRow ? number(stateRow.estimatedReports) : null;
    const broadbandRows = number(broadbandByState[state]);
    const gridEntry = record(record(grid.stateIncidents)[state]);
    const gridIncidentCount = number(gridEntry.incidentCount ?? gridEntry.count ?? gridEntry.incidents);
    const markers = observedMarkers.flatMap((marker) => {
      if (text(marker.state).toUpperCase() !== state) return [];
      const lat = number(marker.lat), lng = number(marker.lng);
      if (lat === null || lng === null) return [];
      return [{ lat, lng, label: text(marker.locationLabel) || text(marker.provider) || "Source-located outage" }];
    });
    return {
      state, outageReports: estimatedReports, reportKind: estimatedReports === null ? "unavailable" : "estimated",
      broadbandRows, gridIncidentCount, facilitiesWithTelehealth: null, observedMarkers: markers,
      provenance: {
        source: "NEEC / GeoBlackout",
        status: estimatedReports === null ? "unavailable" : outageStatus,
        observedAt, fetchedAt,
        detail: "State report counts are modeled allocations of a national outage trend. Only source-located markers are mapped as observations; a report count is not a count of affected telehealth sites."
      },
      broadbandProvenance: {
        source: "NEEC / FCC Broadband Data Collection",
        status: broadbandRows === null ? "unavailable" : "live",
        observedAt: null, fetchedAt,
        detail: "Row count indicates imported FCC availability records, not a current outage or telehealth service status."
      }
    };
  });
}

const STATE_CENTERS: Record<StateCode, [number, number]> = {
  CT: [41.60, -72.70], ME: [44.25, -69.10], MA: [42.30, -71.50],
  NH: [43.70, -71.60], RI: [41.68, -71.51], VT: [44.07, -72.66]
};

export function normalizeNwsAlerts(payload: unknown, state: StateCode, fetchedAt: string): Incident[] {
  const data = record(payload);
  return list(data.features).slice(0, 30).flatMap((item, index) => {
    const feature = record(item);
    const properties = record(feature.properties);
    const event = text(properties.event);
    if (!event) return [];
    const geometry = record(feature.geometry);
    const coordinates = list(geometry.coordinates);
    let lat = STATE_CENTERS[state][0], lng = STATE_CENTERS[state][1];
    const firstRing = list(coordinates[0]);
    const firstPoint = list(firstRing[0]);
    if (number(firstPoint[0]) !== null && number(firstPoint[1]) !== null) {
      lng = number(firstPoint[0])!; lat = number(firstPoint[1])!;
    }
    const severityText = text(properties.severity).toLowerCase();
    const severity = severityText === "extreme" ? "critical" : severityText === "severe" ? "high" : severityText === "moderate" ? "moderate" : "low";
    return [{
      id: text(properties.id) || `nws-${state}-${index}`, name: event, kind: "NWS weather alert", state,
      locality: text(properties.areaDesc) || state, lat, lng, severity,
      status: "Active alert", openedAt: iso(properties.sent) || fetchedAt,
      note: text(properties.headline) || text(properties.description).slice(0, 200),
      provenance: {
        source: "National Weather Service", status: "live", observedAt: iso(properties.sent), fetchedAt,
        detail: geometry.type ? "Official weather alert; marker represents an alert geometry vertex." : "Official weather alert; marker uses a state center because source geometry is absent.",
        url: text(properties.id) || NWS_URL
      }
    }];
  });
}

export async function loadOperationsData(): Promise<OperationsData> {
  const data = buildSampleData();
  const fetchedAt = new Date().toISOString();
  const base = process.env.NEEC_API_BASE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.NEEC_API_TOKEN?.trim();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  if (base) {
    const endpoints = [
      "/api/analysis/facilities?region=northeast",
      "/api/analysis/summary?region=northeast",
      "/api/outages/latest?region=northeast",
      "/api/grid/status?region=northeast"
    ];
    const results = await Promise.allSettled(endpoints.map((path) => getJson(`${base}${path}`, headers)));
    const values = results.map((result) => result.status === "fulfilled" ? result.value : null);
    if (values[0]) {
      const facilities = normalizeNeecFacilities(values[0], fetchedAt);
      if (facilities.length) data.facilities = facilities;
      data.feeds.push({ source: "NEEC facility catalog", status: facilities.length ? "live" : "unavailable", observedAt: null, fetchedAt, detail: `${facilities.length} location records; capacity fields unavailable.` });
    }
    if (values[1] || values[2] || values[3]) {
      data.connectivity = normalizeNeecConnectivity(values[1], values[2], values[3], fetchedAt);
      data.feeds.push(...data.connectivity.slice(0, 1).flatMap((row) => [row.provenance, row.broadbandProvenance]));
      if (values[3]) data.feeds.push({ source: "NEEC grid status", status: "live", observedAt: iso(record(values[3]).fetchedAt), fetchedAt, detail: "Regional grid context; it does not verify individual facility power status." });
    }
    results.forEach((result, index) => {
      if (result.status === "rejected") data.notes.push(`NEEC ${endpoints[index]} unavailable: ${result.reason instanceof Error ? result.reason.message : "request failed"}`);
    });
  } else {
    data.notes.push("Set NEEC_API_BASE_URL to activate the existing facility, outage, broadband inventory, and grid feeds.");
    for (const source of ["NEEC facility catalog", "NEEC / GeoBlackout", "NEEC / FCC Broadband Data Collection", "NEEC grid status"]) {
      data.feeds.push({ source, status: "unavailable", observedAt: null, fetchedAt: null, detail: "NEEC_API_BASE_URL is not configured. The documented neec.onrender.com health endpoint timed out during this build." });
    }
  }

  const [usgsResult, alerts, trendResult] = await Promise.all([
    data.facilities.some((facility) => facility.provenance.status === "sample")
      ? fetchUsgsFacilities(fetchedAt).then((facilities) => ({ facilities, error: "" })).catch((error) => ({ facilities: [] as Facility[], error: error instanceof Error ? error.message : "request failed" }))
      : Promise.resolve({ facilities: [] as Facility[], error: "" }),
    Promise.allSettled(STATES.map((state) => getJson(`${NWS_URL}?area=${state}`).then((payload) => normalizeNwsAlerts(payload, state, fetchedAt)))),
    fetchGeoBlackoutTrend(fetchedAt).then((trend) => ({ trend, error: "" })).catch((error) => ({ trend: null, error: error instanceof Error ? error.message : "request failed" }))
  ]);
  if (trendResult.trend) {
    data.nationalInternetTrend = trendResult.trend;
    data.feeds.push(trendResult.trend.provenance);
  } else {
    data.feeds.push({ source: "GeoBlackout US internet report trend", status: "unavailable", observedAt: null, fetchedAt: null, detail: trendResult.error, url: GEOBLACKOUT_URL });
  }
  if (usgsResult.facilities.length) {
    data.facilities = usgsResult.facilities;
    data.feeds.push({ source: "USGS National Structures Dataset", status: "live", observedAt: null, fetchedAt, detail: `${usgsResult.facilities.length} hospital/medical-center locations. No live capacity; verify each location before operational use.`, url: "https://cartowfs.nationalmap.gov/arcgis/rest/services/structures/FeatureServer/0" });
  } else if (usgsResult.error) {
    data.notes.push(`USGS facility source unavailable: ${usgsResult.error}`);
    data.feeds.push({ source: "USGS National Structures Dataset", status: "unavailable", observedAt: null, fetchedAt: null, detail: usgsResult.error, url: "https://cartowfs.nationalmap.gov/arcgis/rest/services/structures/FeatureServer/0" });
  }
  const liveAlerts = alerts.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (alerts.some((result) => result.status === "fulfilled")) {
    data.incidents = liveAlerts;
    data.feeds.push({ source: "National Weather Service active alerts", status: "live", observedAt: null, fetchedAt, detail: "Official weather alerts for CT, ME, MA, NH, RI, VT. These are hazards, not hospital incidents or MOCC requests.", url: NWS_URL });
    if (liveAlerts.length === 0) data.notes.push("No NWS active weather alerts were returned. This does not establish that there are no healthcare incidents.");
  } else {
    data.feeds.push({ source: "National Weather Service active alerts", status: "unavailable", observedAt: null, fetchedAt: null, detail: "Weather alert service could not be reached.", url: NWS_URL });
  }
  const liveFeeds = data.feeds.filter((feed) => feed.status === "live").length;
  data.mode = liveFeeds === 0 ? "sample" : data.facilities.some((f) => f.provenance.status === "sample") || data.transfers.some((t) => t.provenance.status === "sample") ? "mixed" : "live";
  data.generatedAt = fetchedAt;
  return data;
}
