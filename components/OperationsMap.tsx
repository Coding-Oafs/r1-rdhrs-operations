"use client";

import { useEffect, useRef } from "react";
import type { Connectivity, Facility, Incident, Team } from "@/lib/types";

type Layer = "incidents" | "facilities" | "teams" | "outages";

export default function OperationsMap({ incidents, facilities, teams, connectivity, layers }: {
  incidents: Incident[];
  facilities: Facility[];
  teams: Team[];
  connectivity: Connectivity[];
  layers: Layer[];
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let active = true;
    import("leaflet").then((L) => {
      if (!active || !nodeRef.current) return;
      if (!mapRef.current) {
        const map = L.map(nodeRef.current, { zoomControl: false, scrollWheelZoom: false }).setView([43.35, -71.45], 6);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          maxZoom: 18
        }).addTo(map);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
      }
      const group = layerRef.current!;
      group.clearLayers();
      const add = (lat: number, lng: number, color: string, title: string, sub: string, radius = 7) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const marker = L.circleMarker([lat, lng], { radius, color: "#0b1422", weight: 2, fillColor: color, fillOpacity: 0.95 });
        const popup = document.createElement("div");
        const heading = document.createElement("strong");
        const detail = document.createElement("span");
        heading.textContent = title;
        detail.textContent = sub;
        popup.append(heading, detail);
        marker.bindPopup(popup).addTo(group);
      };
      if (layers.includes("facilities")) facilities.forEach((f) => add(f.lat, f.lng, "#f6ad55", f.name, `${f.city}, ${f.state} · ${f.provenance.status === "sample" ? "Sample" : "NEEC catalog"}`, 6));
      if (layers.includes("incidents")) incidents.forEach((i) => {
        const icon = L.icon({ iconUrl: "/figma/dot-7.svg", iconSize: [15, 15], iconAnchor: [7.5, 7.5] });
        const popup = document.createElement("div");
        const heading = document.createElement("strong");
        const detail = document.createElement("span");
        heading.textContent = i.name;
        detail.textContent = `${i.kind} · ${i.locality} · ${i.provenance.status === "sample" ? "Sample" : "NWS"}`;
        popup.append(heading, detail);
        L.marker([i.lat, i.lng], { icon }).bindPopup(popup).addTo(group);
      });
      if (layers.includes("teams")) teams.forEach((t) => add(t.lat, t.lng, "#31cba8", t.name, `${t.status} · Sample team`, 6));
      if (layers.includes("outages")) connectivity.forEach((c) => c.observedMarkers.forEach((m) => add(m.lat, m.lng, "#3d9df5", m.label, `${c.state} · Source-located outage`, 7)));
      setTimeout(() => mapRef.current?.invalidateSize(), 20);
    });
    return () => { active = false; };
  }, [incidents, facilities, teams, connectivity, layers]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  return <div className="map-canvas" ref={nodeRef} role="img" aria-label="Interactive map of regional facilities, alerts, teams, and source-located outages" />;
}
