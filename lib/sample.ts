import type { OperationsData, Provenance, StateCode } from "./types";
import { STATES } from "./types";

const sample = (source: string): Provenance => ({
  source,
  status: "sample",
  observedAt: null,
  fetchedAt: null,
  detail: "Illustrative planning record. Not operational data."
});

const facilityRows: [string, string, StateCode, string, number, number, number, number, string[]][] = [
  ["fac-1", "Boston Medical Center", "MA", "Boston", 42.334, -71.074, 92, 14, ["Adult trauma", "Critical care"]],
  ["fac-2", "UMass Memorial Medical Center", "MA", "Worcester", 42.277, -71.76, 81, 8, ["Adult trauma", "Pediatrics"]],
  ["fac-3", "Maine Medical Center", "ME", "Portland", 43.653, -70.275, 74, 0, ["Critical care", "Burn"]],
  ["fac-4", "Yale New Haven Hospital", "CT", "New Haven", 41.304, -72.936, 79, 5, ["Pediatrics", "Critical care"]],
  ["fac-5", "Dartmouth Hitchcock Medical Center", "NH", "Lebanon", 43.678, -72.273, 68, 3, ["Adult trauma", "Critical care"]],
  ["fac-6", "Rhode Island Hospital", "RI", "Providence", 41.81, -71.408, 84, 7, ["Adult trauma", "Pediatrics"]],
  ["fac-7", "University of Vermont Medical Center", "VT", "Burlington", 44.475, -73.212, 71, 2, ["Critical care"]]
];

export function buildSampleData(): OperationsData {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    mode: "sample",
    facilities: facilityRows.map(([id, name, state, city, lat, lng, icuOccupancy, edBoarding, capabilities]) => ({
      id, name, state, city, lat, lng, icuOccupancy, edBoarding, capabilities,
      provenance: sample("Planning scenario")
    })),
    incidents: [
      { id: "inc-1", name: "Boston metro mass casualty", kind: "Mass casualty", state: "MA", locality: "Boston metro", lat: 42.36, lng: -71.06, severity: "critical", status: "Active", openedAt: generatedAt, note: "Three facilities at a simulated surge threshold.", provenance: sample("Exercise scenario") },
      { id: "inc-2", name: "Southern NH transfer pressure", kind: "Capacity", state: "NH", locality: "Manchester", lat: 42.995, lng: -71.455, severity: "high", status: "Active", openedAt: generatedAt, note: "Illustrative ICU demand exceeds local supply.", provenance: sample("Exercise scenario") },
      { id: "inc-3", name: "Coastal Maine connectivity", kind: "Communications", state: "ME", locality: "Portland", lat: 43.66, lng: -70.255, severity: "moderate", status: "Monitoring", openedAt: generatedAt, note: "Illustrative telehealth fallback coordination.", provenance: sample("Exercise scenario") },
      { id: "inc-4", name: "Rhode Island pediatric support", kind: "Team request", state: "RI", locality: "Providence", lat: 41.824, lng: -71.412, severity: "moderate", status: "Assigning", openedAt: generatedAt, note: "Pediatric team assignment exercise.", provenance: sample("Exercise scenario") }
    ],
    transfers: [
      { id: "TX-1042", specialty: "Critical care", from: "Southern NH", to: null, state: "NH", status: "requested", elapsedMinutes: 38, priority: "high", provenance: sample("MOCC workflow example") },
      { id: "TX-1043", specialty: "Pediatric ICU", from: "Providence", to: "Boston", state: "RI", status: "accepted", elapsedMinutes: 24, priority: "high", provenance: sample("MOCC workflow example") },
      { id: "TX-1044", specialty: "Burn care", from: "Portland", to: "Boston", state: "ME", status: "transporting", elapsedMinutes: 76, priority: "moderate", provenance: sample("MOCC workflow example") },
      { id: "TX-1045", specialty: "Adult trauma", from: "Burlington", to: "Worcester", state: "VT", status: "completed", elapsedMinutes: 122, priority: "low", provenance: sample("MOCC workflow example") }
    ],
    teams: [
      { id: "team-1", name: "Burn Team", specialty: "Burn", state: "MA", lat: 42.36, lng: -71.06, status: "ready", etaMinutes: 45, provenance: sample("Team roster example") },
      { id: "team-2", name: "Pediatric DMAT", specialty: "Pediatrics", state: "RI", lat: 41.824, lng: -71.412, status: "assigning", etaMinutes: null, provenance: sample("Team roster example") },
      { id: "team-3", name: "Radiation Support", specialty: "Radiation", state: "CT", lat: 41.76, lng: -72.68, status: "ready", etaMinutes: 90, provenance: sample("Team roster example") },
      { id: "team-4", name: "Critical Care Transport", specialty: "Transport", state: "NH", lat: 42.995, lng: -71.455, status: "deployed", etaMinutes: null, provenance: sample("Team roster example") }
    ],
    resources: [
      { id: "res-1", name: "Mobile oxygen units", category: "Clinical", state: "MA", location: "Worcester staging", available: 18, requested: 6, provenance: sample("Resource inventory example") },
      { id: "res-2", name: "Satellite connectivity kits", category: "Communications", state: "ME", location: "Portland staging", available: 7, requested: 3, provenance: sample("Resource inventory example") },
      { id: "res-3", name: "Pediatric transport packs", category: "Transport", state: "RI", location: "Providence staging", available: 9, requested: 2, provenance: sample("Resource inventory example") }
    ],
    connectivity: STATES.map((state) => ({
      state, outageReports: null, reportKind: "unavailable", broadbandRows: null, gridIncidentCount: null, facilitiesWithTelehealth: null, observedMarkers: [],
      provenance: { source: "NEEC / GeoBlackout", status: "unavailable", observedAt: null, fetchedAt: null, detail: "Connect NEEC to load outage reporting." },
      broadbandProvenance: { source: "NEEC / FCC BDC", status: "unavailable", observedAt: null, fetchedAt: null, detail: "Connect NEEC to load FCC broadband availability records." }
    })),
    nationalInternetTrend: null,
    feeds: [sample("Exercise scenario")],
    notes: ["Clinical incident scenarios, capacity, transfers, teams, and resources are illustrative until approved operational systems are connected."]
  };
}
