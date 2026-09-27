import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNeecConnectivity, normalizeNeecFacilities, normalizeNwsAlerts, normalizeUsgsFacilities, parseGeoBlackoutReports, statusForTimestamp } from "../lib/sources";

const now = new Date().toISOString();

test("NEEC facility catalog never invents current capacity", () => {
  const facilities = normalizeNeecFacilities({ features: [
    { geometry: { type: "Point", coordinates: [-71.06, 42.36] }, properties: { id: 42, name: "Example Hospital", state: "MA", city: "Boston", LOADDATE: "2023-12-15T05:00:00Z", icuOccupancy: 92 } },
    { geometry: { type: "Point", coordinates: [null, 42] }, properties: { state: "ME" } }
  ] }, now);
  assert.equal(facilities.length, 1);
  assert.equal(facilities[0].name, "Example Hospital");
  assert.equal(facilities[0].icuOccupancy, null);
  assert.equal(facilities[0].edBoarding, null);
  assert.equal(facilities[0].provenance.observedAt, "2023-12-15T05:00:00.000Z");
});

test("USGS hospital locations remain a location catalog with blank capacity", () => {
  const hospitals = normalizeUsgsFacilities({ type: "FeatureCollection", features: [{
    properties: { objectid: 7, name: "Regional Hospital", state: "CT", city: "Hartford", loaddate: 1520208000000 },
    geometry: { type: "Point", coordinates: [-72.68, 41.76] }
  }] }, now);
  assert.equal(hospitals.length, 1);
  assert.equal(hospitals[0].icuOccupancy, null);
  assert.equal(hospitals[0].provenance.source, "USGS National Structures Dataset");
  assert.ok(hospitals[0].provenance.observedAt);
});

test("modeled outage heat points are never treated as observed markers", () => {
  const rows = normalizeNeecConnectivity(
    { broadbandByState: { MA: 12 } },
    { fetchedAt: now, regionStates: [{ code: "MA", estimatedReports: 220 }],
      heatPoints: [{ lat: 42.1, lng: -71.1, state: "MA", estimated: true }],
      sourceMarkers: [
        { lat: 42.2, lng: -71.2, state: "MA", official: true, estimated: false },
        { lat: 42.3, lng: -71.3, state: "MA", official: true, estimated: true }
      ] }, { stateIncidents: { MA: { incidentCount: 3 } } }, now
  );
  const ma = rows.find((row) => row.state === "MA")!;
  assert.equal(ma.outageReports, 220);
  assert.equal(ma.reportKind, "estimated");
  assert.equal(ma.observedMarkers.length, 1);
  assert.equal(ma.broadbandRows, 12);
  assert.equal(ma.gridIncidentCount, 3);
  assert.equal(ma.facilitiesWithTelehealth, null);
  assert.equal(rows.find((row) => row.state === "CT")!.outageReports, null);
});

test("freshness uses source observation time rather than retrieval time", () => {
  assert.equal(statusForTimestamp(new Date(Date.now() - 25 * 3600_000).toISOString(), 24), "stale");
  assert.equal(statusForTimestamp(now, 24), "live");
  assert.equal(statusForTimestamp(null, 24), "unavailable");
});

test("NWS alerts retain their source class and do not become clinical incidents", () => {
  const alerts = normalizeNwsAlerts({ features: [{ properties: { id: "https://api.weather.gov/alerts/1", event: "Flood Warning", areaDesc: "Boston", severity: "Severe", sent: now }, geometry: null }] }, "MA", now);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, "NWS weather alert");
  assert.equal(alerts[0].severity, "high");
  assert.equal(alerts[0].provenance.source, "National Weather Service");
  assert.ok(alerts[0].id.startsWith("nws-MA-"));
});

test("GeoBlackout parser returns the newest national chart value without a state estimate", () => {
  const html = String.raw`{\"label\":\"Reports\",\"data\":[{\"x\":\"$D2026-09-26T11:00:00Z\",\"y\":9},{\"x\":\"$D2026-09-26T12:00:00Z\",\"y\":4}],\"borderColor\":\"red\"}`;
  assert.deepEqual(parseGeoBlackoutReports(html), { reports: 4, observedAt: "2026-09-26T12:00:00.000Z" });
  assert.equal(parseGeoBlackoutReports("chart unavailable"), null);
});
