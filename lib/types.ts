export type StateCode = "CT" | "ME" | "MA" | "NH" | "RI" | "VT";
export type FeedStatus = "live" | "stale" | "sample" | "unavailable";
export type Severity = "critical" | "high" | "moderate" | "low";

export interface Provenance {
  source: string;
  status: FeedStatus;
  observedAt: string | null;
  fetchedAt: string | null;
  detail: string;
  url?: string;
}

export interface Facility {
  id: string;
  name: string;
  state: StateCode;
  city: string;
  lat: number;
  lng: number;
  icuOccupancy: number | null;
  edBoarding: number | null;
  capabilities: string[];
  provenance: Provenance;
}

export interface Incident {
  id: string;
  name: string;
  kind: string;
  state: StateCode;
  locality: string;
  lat: number;
  lng: number;
  severity: Severity;
  status: string;
  openedAt: string;
  note: string;
  provenance: Provenance;
}

export interface Transfer {
  id: string;
  specialty: string;
  from: string;
  to: string | null;
  state: StateCode;
  status: "requested" | "accepted" | "transporting" | "completed";
  elapsedMinutes: number;
  priority: Severity;
  provenance: Provenance;
}

export interface Team {
  id: string;
  name: string;
  specialty: string;
  state: StateCode;
  lat: number;
  lng: number;
  status: "ready" | "assigning" | "deployed" | "unavailable";
  etaMinutes: number | null;
  provenance: Provenance;
}

export interface Resource {
  id: string;
  name: string;
  category: string;
  state: StateCode;
  location: string;
  available: number;
  requested: number;
  provenance: Provenance;
}

export interface Connectivity {
  state: StateCode;
  outageReports: number | null;
  reportKind: "provider-reported" | "estimated" | "unavailable";
  broadbandRows: number | null;
  gridIncidentCount: number | null;
  facilitiesWithTelehealth: number | null;
  observedMarkers: { lat: number; lng: number; label: string }[];
  provenance: Provenance;
  broadbandProvenance: Provenance;
}

export interface OperationsData {
  generatedAt: string;
  mode: "sample" | "mixed" | "live";
  facilities: Facility[];
  incidents: Incident[];
  transfers: Transfer[];
  teams: Team[];
  resources: Resource[];
  connectivity: Connectivity[];
  nationalInternetTrend: { reports: number; observedAt: string; provenance: Provenance } | null;
  feeds: Provenance[];
  notes: string[];
}

export const STATES: StateCode[] = ["CT", "ME", "MA", "NH", "RI", "VT"];

export function isStateCode(value: unknown): value is StateCode {
  return typeof value === "string" && STATES.includes(value as StateCode);
}
