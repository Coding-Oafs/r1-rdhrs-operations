# R1 RDHRS Regional Health Operations

A standalone Next.js prototype for Region 1 healthcare emergency coordination. It follows the [Figma command-center design](https://www.figma.com/design/JBnzBZsIUERm8PD9bUUVNp) and the linked [Undermind evidence workspace](https://app.undermind.ai/projects/8c213a78-9b27-455b-bf0a-6f4ead60a360?path=/GIS-enabled%20healthcare%20surge%20and%20disaster%20situational%20awareness). The NEEC/NEDPC repository is a read-only source system; this app is a separate repository and does not change it.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` and set `NEEC_API_BASE_URL` to a reachable NEEC server to activate its existing read-only APIs. For the currently running local NEDPC API, use `http://localhost:4173`. Set `NEEC_API_TOKEN` only if that server requires a bearer token. Do not expose the token through a `NEXT_PUBLIC_` variable. The Next.js server calls NEEC; browsers call this app's `/api/operations` route.

The National Weather Service active alert API and GeoBlackout national trend are queried even when NEEC is not configured. The USGS National Structures Dataset is queried if the NEEC facility catalog is unavailable. If these services are unreachable, the app labels any remaining illustrative records as sample. The dashboard never converts a weather alert into a clinical incident.

During local verification on September 26, 2026, the running NEDPC API returned 269 facility locations in the six Region 1 states, 97,306 FCC broadband availability rows across those states, modeled outage allocations, and grid context. The NWS returned 27 current weather alerts at that moment. These counts are dynamic and are not embedded in the build. Facility ICU occupancy, ED boarding, transfer requests, team rosters, and telehealth status were not supplied by these feeds.

## Modules

Regional Overview, Incidents, Facilities, Patient Movement, Deployable Teams, Resources, Communications, and Evidence. The map has interactive facility, alert, team, and source-located outage layers. State filters apply across panels. The Communications module adds telehealth context and keeps outage reports, broadband availability inventory, and verified facility service status distinct.

## Reuse and gaps

| Need | Existing NEEC source | This app | Gap |
|---|---|---|---|
| Facility locations | `/api/analysis/facilities?region=northeast` | Normalizes NEEC GeoJSON to map/list entries | Facility capability, staffed beds, ICU/ED occupancy, and timestamps are not provided by this endpoint |
| Facility location fallback | [USGS National Structures Dataset ArcGIS Feature Service](https://cartowfs.nationalmap.gov/arcgis/rest/services/structures/FeatureServer/0) | Queries hospital/medical-center points (`fcode=80012`) for the six states when NEEC facilities are unavailable | Catalog records require validation; not live capacity |
| Broadband availability | `/api/analysis/summary?region=northeast` backed by FCC BDC imports | Shows imported row counts and missing states | A row count is **not** coverage percentage or current outage status; obtain tract/block level metrics and source vintage for detailed telehealth planning |
| Internet outage signals | `/api/outages/latest?region=northeast` from GeoBlackout plus optional direct geolocated/FCC adapter feeds | Shows modeled state report allocation; maps only verified source-located markers | Provider/service outage confirmation and facility impact require a separate source |
| National internet trend | [GeoBlackout public US chart](https://geoblackout.com/us/report/internet) | Reads the latest real national report value using NEEC's chart parsing pattern | It cannot be assigned to Region 1 or a telehealth site |
| Grid context | `/api/grid/status?region=northeast` | Reads `stateIncidents[ST].incidentCount` | Operator-wide signal; does not prove individual facility power loss |
| Weather alerts | [NWS active alerts](https://www.weather.gov/documentation/services-web-alerts) | Direct server-side query by state | Weather hazard, not a clinical incident feed |
| Patient movement | None identified | Sample request/acceptance/transport workflow | Connect MOCC/transfer-center system with privacy safeguards |
| Teams and resources | None identified | Sample rosters and staging cards | Connect approved operational roster and logistics systems |
| Clinical capacity | None identified in the facility endpoint | Sample values only, or blank when actual NEEC facilities load | Approved current facility-level capacity and ED feed |
| Telehealth operational status | None identified | Explicit unknown status | Facility WAN, backup link, EHR/telehealth platform, power, and routing status |

NEEC's `src/services/healthcareSourceAdapter.js` already normalizes various healthcare GeoJSON/CSV inputs, including projected coordinates. `src/services/sourceAdapters.js` accepts direct geolocated outage feeds and H3 cells. `src/services/fccBdcService.js` normalizes FCC availability imports. Those ingestion systems remain in NEEC. The new app reuses their **published API contracts** through a small server-side adapter rather than copying large import jobs or credentials.

## Source interpretation

- [FCC Broadband Data Collection](https://help.bdc.fcc.gov/hc/en-us/articles/13532984820379-What-s-on-the-National-Broadband-Map) is provider-reported availability, filed twice a year. It does not describe a current internet outage or whether telehealth functions at a facility.
- NEEC's GeoBlackout trend is actual report-source input, but its state distribution is modeled. The app says “modeled” beside these counts and excludes heat samples from observed outage markers.
- [NWS alerts](https://www.weather.gov/documentation/services-web-alerts) are current official hazard notices. Their map position is an alert geometry vertex where provided, or a state-center placeholder when geometry is absent.
- The historical [HHS facility-level capacity dataset](https://healthdata.gov/Hospital/COVID-19-Reported-Patient-Impact-and-Hospital-Capa/anag-cw7u) stopped updates in May 2024, so it is unsuitable as a live ICU/ED feed. Seek state, coalition, or MOCC agreements instead.
- [FCC DIRS](https://docs.fcc.gov/public/attachments/DA-23-861A1.pdf) is activated for specific disasters and is not treated as a continuous public facility telehealth feed.

## Deployment architecture

`Browser → Next.js UI and /api/operations on Vercel → NWS, GeoBlackout, USGS fallback, and optional NEEC read-only APIs`. NEEC remains responsible for its PostgreSQL/Neon storage, import jobs, ArcGIS/FCC adapters, and scheduled outage refresh. The app fetches with a bounded timeout, server-side caching, and source provenance. It does not connect directly to NEEC's database. A production connection requires a network-reachable NEEC URL, any access token in Vercel server-side environment variables, and an approved origin/access policy on NEEC if necessary. `localhost:4173` works only on this computer; Vercel cannot reach it. NEEC's documented `https://neec.onrender.com` health endpoint timed out during verification, so the first hosted deployment will use the direct public feeds until a reachable NEEC API URL is provided.

Operational pilot gates: approved user access, current source contracts, patient privacy review, feed uptime/quality monitoring, region-wide coverage, incident and transfer ownership, and drill-based usability validation. This prototype does not assert readiness for live emergency operations.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The tests focus on preventing misleading data: catalog locations cannot supply invented capacity, modeled outage points cannot become observed markers, and NWS alerts remain weather alerts.
