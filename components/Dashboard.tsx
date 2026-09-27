"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { OperationsData, Provenance, StateCode } from "@/lib/types";

const OperationsMap = dynamic(() => import("./OperationsMap"), { ssr: false, loading: () => <div className="map-loading">Loading regional map…</div> });
type Module = "Regional Overview" | "Incidents" | "Facilities" | "Patient Movement" | "Deployable Teams" | "Resources" | "Communications" | "Evidence";
type Layer = "incidents" | "facilities" | "teams" | "outages";
const MODULES: Module[] = ["Regional Overview", "Incidents", "Facilities", "Patient Movement", "Deployable Teams", "Resources", "Communications", "Evidence"];
const ALL_STATES = ["All states", "CT", "ME", "MA", "NH", "RI", "VT"] as const;

function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  const color = ["live", "ready", "completed"].includes(status || "") ? "/figma/dot-1.svg"
    : ["critical", "high", "requested"].includes(status || "") ? "/figma/dot-4.svg"
    : ["sample", "moderate", "assigning", "transporting"].includes(status || "") ? "/figma/dot-6.svg"
    : ["unavailable", "stale"].includes(status || "") ? "/figma/dot-5.svg" : "/figma/dot-8.svg";
  return <span className={`badge badge-${(status || "neutral").toLowerCase().replaceAll(" ", "-")}`}><Image src={color} width={8} height={8} alt="" />{children}</span>;
}

function timeLabel(value: string | null) {
  if (!value) return "time unavailable";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60000));
  if (!Number.isFinite(minutes)) return "time unavailable";
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
}

function SourceLine({ value }: { value: Provenance }) {
  return <div className="source-line"><span>{value.source}</span><Badge status={value.status}>{value.status}</Badge><span>{value.observedAt ? `Observed ${timeLabel(value.observedAt)}` : value.fetchedAt ? `Fetched ${timeLabel(value.fetchedAt)}` : "No timestamp"}</span></div>;
}

function Panel({ title, eyebrow, children, className = "" }: { title: string; eyebrow?: string; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div><h2>{title}</h2>{eyebrow && <p>{eyebrow}</p>}</div></div>{children}</section>;
}

export default function Dashboard({ initialData }: { initialData: OperationsData }) {
  const [data, setData] = useState(initialData);
  const [module, setModule] = useState<Module>("Regional Overview");
  const [state, setState] = useState<(typeof ALL_STATES)[number]>("All states");
  const [layers, setLayers] = useState<Layer[]>(["incidents", "facilities", "teams", "outages"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = (item: { state: StateCode }) => state === "All states" || item.state === state;
  const facilities = useMemo(() => data.facilities.filter(matches), [data.facilities, state]);
  const incidents = useMemo(() => data.incidents.filter(matches), [data.incidents, state]);
  const transfers = useMemo(() => data.transfers.filter(matches), [data.transfers, state]);
  const teams = useMemo(() => data.teams.filter(matches), [data.teams, state]);
  const resources = useMemo(() => data.resources.filter(matches), [data.resources, state]);
  const connectivity = useMemo(() => data.connectivity.filter(matches), [data.connectivity, state]);
  const capacity = facilities.filter((f) => f.icuOccupancy !== null);
  const meanIcu = capacity.length ? Math.round(capacity.reduce((sum, f) => sum + (f.icuOccupancy || 0), 0) / capacity.length) : null;
  const edBoarding = facilities.some((f) => f.edBoarding !== null) ? facilities.reduce((sum, f) => sum + (f.edBoarding || 0), 0) : null;
  const samplesPresent = [data.facilities, data.incidents, data.transfers, data.teams, data.resources].some((items) => items.some((item) => item.provenance.status === "sample"));
  const liveFeedCount = data.feeds.filter((feed) => feed.status === "live").length;
  const actualFeedCount = data.feeds.filter((feed) => feed.status !== "sample").length;

  async function refresh() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
      setData(await response.json() as OperationsData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Refresh failed"); }
    finally { setBusy(false); }
  }
  function toggleLayer(layer: Layer) { setLayers((current) => current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer]); }

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">R<span>1</span></div><div><strong>REGION 1 RDHRS</strong><small>Healthcare Emergency Operations</small></div></div>
      <div className="top-actions"><span className="region-tag">CT · ME · MA · NH · RI · VT</span><Badge status={data.mode === "sample" ? "sample" : "live"}>{data.mode === "sample" ? "Sample workspace" : `${liveFeedCount} connected source${liveFeedCount === 1 ? "" : "s"}`}</Badge><button className="sync-button" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "↻ Refresh"}</button><span className="last-sync">Updated {timeLabel(data.generatedAt)}</span></div>
    </header>
    <div className="body-grid">
      <aside className="sidebar"><span className="sidebar-label">COMMAND</span><nav aria-label="Main sections">{MODULES.map((item) => <button key={item} className={`nav-item ${module === item ? "active" : ""}`} onClick={() => setModule(item)}><span className="nav-glyph"><Image src="/figma/dot-2.svg" width={7} height={7} alt="" /></span><span>{item}</span></button>)}</nav><div className="sidebar-bottom"><span className="sidebar-label">REGION 1</span><p>Six states · shared operating picture</p><p className="tiny">Prototype for coordination planning</p></div></aside>
      <main className="main-content">
        <div className="page-heading"><div><span className="eyebrow">REGIONAL COMMAND / {module.toUpperCase()}</span><h1>{module === "Regional Overview" ? "Regional Operating Picture" : module}</h1><p>Healthcare capacity, incidents, patient movement, and deployable response assets</p></div><div className="heading-actions"><label className="visually-hidden" htmlFor="state-filter">Filter by state</label><select id="state-filter" value={state} onChange={(event) => setState(event.target.value as (typeof ALL_STATES)[number])}>{ALL_STATES.map((s) => <option key={s}>{s}</option>)}</select><span className="heading-date">Region 1 · {new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div></div>
        {samplesPresent && <div className="notice"><Badge status="sample">SAMPLE DATA</Badge><span>Transfers, teams, and resources are exercise records. Current facility capacity is {capacity.length ? "sample" : "unreported"}. Source labels appear on each panel.</span></div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {module === "Regional Overview" && <>
          <div className="kpi-grid">
            <div className="kpi"><span>ACTIVE HAZARD ALERTS</span><strong>{incidents.filter((i) => i.provenance.status !== "sample").length || "—"}</strong><small>NWS · weather only</small><Image className="kpi-asset" src="/figma/dot-4.svg" width={8} height={8} alt="" /></div>
            <div className="kpi"><span>ICU OCCUPANCY</span><strong>{meanIcu === null ? "—" : `${meanIcu}%`}</strong><small>{capacity.length ? "sample facilities" : "live feed needed"}</small><Image className="kpi-asset" src="/figma/dot-6.svg" width={8} height={8} alt="" /></div>
            <div className="kpi"><span>ED BOARDING</span><strong>{edBoarding ?? "—"}</strong><small>{edBoarding === null ? "live feed needed" : "sample patients &gt;4h"}</small><Image className="kpi-asset" src="/figma/dot-4.svg" width={8} height={8} alt="" /></div>
            <div className="kpi"><span>DEPLOYABLE TEAMS</span><strong>{teams.length}</strong><small>sample roster · {teams.filter((t) => t.status === "ready").length} ready</small><Image className="kpi-asset" src="/figma/dot-1.svg" width={8} height={8} alt="" /></div>
            <div className="kpi"><span>DATA SOURCES</span><strong>{liveFeedCount}/{actualFeedCount}</strong><small>responding / identified sources</small><Image className="kpi-asset" src="/figma/dot-8.svg" width={8} height={8} alt="" /></div>
          </div>
          <div className="overview-grid">
            <Panel title="Regional GIS View" eyebrow="Hospitals · alerts · teams · source-located outages" className="map-panel"><div className="map-controls">{(["incidents", "facilities", "teams", "outages"] as Layer[]).map((layer) => <button key={layer} onClick={() => toggleLayer(layer)} className={`layer-pill layer-${layer} ${layers.includes(layer) ? "selected" : ""}`} aria-pressed={layers.includes(layer)}><Image src={layer === "incidents" ? "/figma/dot-4.svg" : layer === "facilities" ? "/figma/dot-3.svg" : layer === "teams" ? "/figma/dot-9.svg" : "/figma/dot-8.svg"} width={layer === "facilities" || layer === "teams" ? 9 : 8} height={layer === "facilities" || layer === "teams" ? 9 : 8} alt="" />{layer === "outages" ? "Observed outages" : layer}</button>)}</div><OperationsMap incidents={incidents} facilities={facilities} teams={teams} connectivity={connectivity} layers={layers} /><div className="map-foot">Map markers show source locations where available. Weather alerts without geometry use state centers. Modeled outage heat samples are excluded.</div></Panel>
            <Panel title="Priority Queue" eyebrow="Signals requiring coordination attention" className="queue-panel"><div className="queue-list">{incidents.slice(0, 4).map((incident) => <button key={incident.id} className="queue-item" onClick={() => setModule("Incidents")}><div><Badge status={incident.severity}>{incident.kind}</Badge><span className="queue-place">{incident.state}</span></div><strong>{incident.name}</strong><small>{incident.provenance.status === "sample" ? "Sample scenario" : "NWS weather alert"} · {incident.locality}</small></button>)}{incidents.length === 0 && <div className="empty">No active weather alerts returned. Healthcare incidents require a separate source.</div>}</div></Panel>
          </div>
          <div className="bottom-grid">
            <Panel title="Facility Capacity & Flow" eyebrow="Location catalog and separate capacity status"><div className="compact-list">{facilities.slice(0, 4).map((facility) => <div className="compact-row" key={facility.id}><div><strong>{facility.name}</strong><small>{facility.city}, {facility.state} · {facility.provenance.status === "sample" ? "Sample" : facility.provenance.source}</small></div><div className="row-badges"><Badge status={facility.icuOccupancy === null ? "unavailable" : facility.icuOccupancy >= 90 ? "critical" : "moderate"}>ICU {facility.icuOccupancy === null ? "not reported" : `${facility.icuOccupancy}%`}</Badge><Badge status={facility.edBoarding === null ? "unavailable" : "neutral"}>ED {facility.edBoarding === null ? "not reported" : `+${facility.edBoarding}`}</Badge></div></div>)}</div><button className="panel-link" onClick={() => setModule("Facilities")}>View all facilities →</button></Panel>
            <Panel title="Deployable Teams" eyebrow="Exercise roster"><div className="compact-list">{teams.slice(0, 4).map((team) => <div className="compact-row" key={team.id}><div><strong>{team.name}</strong><small>{team.state} · {team.specialty}</small></div><Badge status={team.status}>{team.status}</Badge></div>)}</div><button className="panel-link" onClick={() => setModule("Deployable Teams")}>View team roster →</button></Panel>
            <Panel title="Evidence & Data Quality" eyebrow="Keep source meaning visible"><div className="evidence-mini"><Badge status={liveFeedCount ? "live" : "unavailable"}>{liveFeedCount} live feed{liveFeedCount === 1 ? "" : "s"}</Badge><p><Image src="/figma/dot-10.svg" width={6} height={6} alt="" /> Broadband availability is a baseline. Internet outage reports indicate possible disruption; neither verifies telehealth service failure.</p><p>Missing capacity and transfer feeds remain visible as gaps.</p></div><button className="panel-link" onClick={() => setModule("Evidence")}>Sources and rationale →</button></Panel>
          </div>
        </>}
        {module === "Incidents" && <Panel title="Active hazard and incident signals" eyebrow="NWS weather alerts are live when available. Clinical scenarios are explicitly sample."><div className="table-wrap"><table><thead><tr><th>Signal</th><th>Type</th><th>State</th><th>Severity</th><th>Source</th></tr></thead><tbody>{incidents.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.locality}</small></td><td>{item.kind}</td><td>{item.state}</td><td><Badge status={item.severity}>{item.severity}</Badge></td><td><Badge status={item.provenance.status}>{item.provenance.source}</Badge></td></tr>)}</tbody></table>{incidents.length === 0 && <div className="empty">No active NWS alerts returned for this state. This says nothing about clinical incidents.</div>}</div></Panel>}
        {module === "Facilities" && <Panel title="Healthcare facilities" eyebrow="Actual locations from NEEC when connected; current capacity requires a separate feed."><div className="table-wrap"><table><thead><tr><th>Facility</th><th>Location</th><th>ICU occupancy</th><th>ED boarding</th><th>Source</th></tr></thead><tbody>{facilities.map((f) => <tr key={f.id}><td><strong>{f.name}</strong><small>{f.capabilities.length ? f.capabilities.join(" · ") : "Capabilities not reported"}</small></td><td>{f.city}, {f.state}</td><td>{f.icuOccupancy === null ? "Not reported" : `${f.icuOccupancy}%`}</td><td>{f.edBoarding === null ? "Not reported" : f.edBoarding}</td><td><small>{f.provenance.source}</small><small>{f.provenance.observedAt ? `Catalog date: ${new Date(f.provenance.observedAt).toLocaleDateString("en-US")}` : "Catalog date unavailable"}</small><Badge status={f.provenance.status}>{f.provenance.status}</Badge></td></tr>)}</tbody></table></div></Panel>}
        {module === "Patient Movement" && <Panel title="Patient movement board" eyebrow="Request → acceptance → destination → transport; sample until MOCC transfer system is connected."><div className="workflow"><span>Requested</span><b>→</b><span>Accepted</span><b>→</b><span>Transporting</span><b>→</b><span>Completed</span></div><div className="table-wrap"><table><thead><tr><th>Request</th><th>Specialty</th><th>Origin</th><th>Destination</th><th>Status</th><th>Elapsed</th></tr></thead><tbody>{transfers.map((t) => <tr key={t.id}><td><strong>{t.id}</strong><small>Sample</small></td><td>{t.specialty}</td><td>{t.from}</td><td>{t.to || "Awaiting match"}</td><td><Badge status={t.status}>{t.status}</Badge></td><td>{t.elapsedMinutes} min</td></tr>)}</tbody></table></div></Panel>}
        {module === "Deployable Teams" && <Panel title="Specialty team roster" eyebrow="Readiness and assignment are exercise data until a verified roster is connected."><div className="cards-grid">{teams.map((t) => <div className="info-card" key={t.id}><div><span className="eyebrow">{t.specialty} · {t.state}</span><Badge status={t.status}>{t.status}</Badge></div><h3>{t.name}</h3><p>Estimated mobilization: {t.etaMinutes === null ? "not available" : `${t.etaMinutes} min`}</p><small>Sample roster</small></div>)}</div></Panel>}
        {module === "Resources" && <Panel title="Resource staging" eyebrow="Inventories are illustrative until a logistics source is connected."><div className="cards-grid">{resources.map((r) => <div className="info-card" key={r.id}><span className="eyebrow">{r.category} · {r.state}</span><h3>{r.name}</h3><p>{r.location}</p><div className="resource-metrics"><div><strong>{r.available}</strong><small>Available</small></div><div><strong>{r.requested}</strong><small>Requested</small></div></div><small>Sample inventory</small></div>)}</div></Panel>}
        {module === "Communications" && <><Panel title="Telehealth connectivity context" eyebrow="Outage signals + FCC availability inventory; facility service status remains unverified."><div className="telehealth-intro"><strong>Interpretation rule</strong><p>FCC Broadband Data Collection describes reported availability, usually on a semiannual cycle. NEEC/GeoBlackout outage reports are a separate, modeled regional signal. An outage report does not confirm a particular hospital or telehealth platform is down.</p></div><div className="national-trend"><div><span className="eyebrow">US INTERNET REPORT TREND</span><strong>{data.nationalInternetTrend?.reports ?? "—"}</strong><small>{data.nationalInternetTrend ? `National · observed ${timeLabel(data.nationalInternetTrend.observedAt)}` : "Source unavailable"}</small></div><p>Live national context from GeoBlackout. This value is not a Region 1 outage estimate and cannot identify affected telehealth sites.</p><Badge status={data.nationalInternetTrend?.provenance.status ?? "unavailable"}>{data.nationalInternetTrend?.provenance.status ?? "unavailable"}</Badge></div><div className="table-wrap"><table><thead><tr><th>State</th><th>Internet outage reports</th><th>FCC availability rows</th><th>Grid incidents</th><th>Observed markers</th><th>Freshness</th></tr></thead><tbody>{connectivity.map((c) => <tr key={c.state}><td><strong>{c.state}</strong></td><td>{c.outageReports === null ? "Unavailable" : `${c.outageReports.toLocaleString()} modeled`}</td><td>{c.broadbandRows === null ? "Unavailable" : c.broadbandRows.toLocaleString()}</td><td>{c.gridIncidentCount ?? "Unavailable"}</td><td>{c.observedMarkers.length}</td><td><Badge status={c.provenance.status}>{c.provenance.status}</Badge></td></tr>)}</tbody></table></div></Panel><div className="gap-panel"><h2>Telehealth continuity checks</h2><p>To assess actual service continuity, connect facility-reported WAN status, EHR/telehealth platform status, backup connectivity, power, and clinical routing procedures. This prototype does not infer those states from a broadband map.</p></div></>}
        {module === "Evidence" && <div className="evidence-layout"><Panel title="Source register" eyebrow="Live means the feed responded; record age is shown separately where available."><div className="source-list">{data.feeds.map((feed, index) => <div className="source-card" key={`${feed.source}-${index}`}><SourceLine value={feed} /><p>{feed.detail}</p>{feed.url && <a href={feed.url} target="_blank" rel="noreferrer">Source ↗</a>}</div>)}</div></Panel><Panel title="Research-informed design" eyebrow="Coordination, provenance, and patient flow"><div className="principles"><div><strong>Regional coordination</strong><p>Show capacity, capability, transfer status, and deployable assets together so coordinators can compare destinations and dependencies.</p></div><div><strong>Data age is operational context</strong><p>Show retrieval time, source observation time, and missing coverage. A stale feed is not an all-clear.</p></div><div><strong>Travel and unmet demand</strong><p>Map position supports decisions but cannot replace capability, acceptance, and transport checks.</p></div><div><strong>Evidence boundaries</strong><p>Keep observed records, modeled signals, baseline availability, and exercise data separate.</p></div><a href="https://app.undermind.ai/projects/8c213a78-9b27-455b-bf0a-6f4ead60a360?path=/GIS-enabled%20healthcare%20surge%20and%20disaster%20situational%20awareness" target="_blank" rel="noreferrer">Open research workspace ↗</a></div></Panel><Panel title="Open data gaps" eyebrow="Next integrations for an operational pilot"><ul className="gap-list"><li>Live hospital staffed beds, ICU occupancy, ED boarding, and capability status</li><li>MOCC transfer request and acceptance system</li><li>Verified deployable team and resource rosters</li><li>Facility WAN, backup connectivity, and telehealth service status</li><li>Incident management and resource staging systems</li></ul></Panel></div>}
        <footer className="footer"><span>R1 RDHRS · Coordination prototype</span><span>Generated {new Date(data.generatedAt).toLocaleString("en-US")} · {data.mode.toUpperCase()} MODE</span></footer>
      </main>
    </div>
  </div>;
}
