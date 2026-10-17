import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseLocation } from '@/types';
import type { Incident, RescueTeam, Resource, Shelter, TeamStatus } from '@/types';
import { PriorityBadge } from '@/components/ui/Badges';
import { INCIDENT_TYPE_LABELS, STATUS_LABELS, TEAM_MARKER_COLORS, TEAM_STATUS_LABELS } from '@/types';
import { timeAgo } from '@/lib/utils';

// Custom div-icon factory for colored markers
function makeIcon(color: string, iconClass: string = '') {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:12px;color:white;font-weight:bold;">${iconClass}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

const incidentIcons = {
  critical: makeIcon('#dc2626', '!'),
  high: makeIcon('#ea580c', '!'),
  moderate: makeIcon('#ca8a04', '·'),
  low: makeIcon('#3b82f6', 'i'),
};

const teamIcons = Object.fromEntries(Object.entries(TEAM_MARKER_COLORS).map(([status, color]) => [status, makeIcon(color, 'T')])) as Record<TeamStatus, L.DivIcon>;
const resourceIcon = makeIcon('#8b5cf6', 'R');
const shelterIcon = makeIcon('#0891b2', 'S');
const fullShelterIcon = makeIcon('#64748b', 'S');

function FitBounds({ locations }: { locations: (string | null)[] }) {
  const map = useMap();
  const hasFit = useRef(false);

  const points = useMemo(() => locations.map(parseLocation).filter((p): p is [number, number] => !!p), [locations]);

  useEffect(() => {
    if (points.length === 0 || hasFit.current) return;
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    hasFit.current = true;
  }, [points, map]);

  return null;
}

interface IncidentMapProps {
  incidents?: Incident[];
  teams?: RescueTeam[];
  resources?: Resource[];
  shelters?: Shelter[];
  onIncidentClick?: (id: string) => void;
  showIncidents?: boolean;
  showTeams?: boolean;
  showResources?: boolean;
  showShelters?: boolean;
  height?: string;
}

export function IncidentMap({ incidents = [], teams = [], resources = [], shelters = [], onIncidentClick, showIncidents = true, showTeams = true, showResources = true, showShelters = true, height = '500px' }: IncidentMapProps) {
  const locations = useMemo(
    () => [...incidents.map((i) => i.location), ...teams.map((t) => t.location), ...resources.map((r) => r.location), ...shelters.map((s) => s.location)],
    [incidents, teams, resources, shelters],
  );
  return (
    <div className="card overflow-hidden" style={{ height }}>
      {/* World view until FitBounds zooms to the data; no fixed home city. */}
      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds locations={locations} />

        {showIncidents && incidents.map((inc) => {
          const pos = parseLocation(inc.location);
          if (!pos) return null;
          const icon = incidentIcons[inc.priority_level] || incidentIcons.low;
          return (
            <Marker key={inc.id} position={pos} icon={icon} eventHandlers={{ click: () => onIncidentClick?.(inc.id) }}>
              <Popup>
                <div className="text-xs space-y-1.5 min-w-[200px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-neutral-800">{inc.report_code}</span>
                    <PriorityBadge level={inc.priority_level} />
                  </div>
                  <p className="text-neutral-600"><strong>Type:</strong> {INCIDENT_TYPE_LABELS[inc.type]}</p>
                  <p className="text-neutral-600"><strong>Status:</strong> {STATUS_LABELS[inc.status]}</p>
                  <p className="text-neutral-600"><strong>People:</strong> {inc.people_affected}</p>
                  {inc.area_landmark && <p className="text-neutral-600"><strong>Area:</strong> {inc.area_landmark}</p>}
                  <p className="text-neutral-400 text-[10px]">{timeAgo(inc.created_at)}</p>
                  {onIncidentClick && (
                    <button className="text-primary-600 font-medium hover:underline" onClick={() => onIncidentClick(inc.id)}>
                      View details →
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {showTeams &&
          teams.map((team) => {
            const pos = parseLocation(team.location);
            if (!pos) return null;
            return (
              <Marker key={team.id} position={pos} icon={teamIcons[team.status] ?? teamIcons.offline}>
                <Popup>
                  <div className="text-xs space-y-1 min-w-[180px]">
                    <span className="font-bold text-neutral-800">{team.name}</span>
                    <p className="text-neutral-600"><strong>Code:</strong> {team.team_code}</p>
                    <p className="text-neutral-600"><strong>Status:</strong> {TEAM_STATUS_LABELS[team.status]}</p>
                    <p className="text-neutral-600"><strong>Capabilities:</strong> {team.capabilities.join(', ') || '—'}</p>
                    <p className="text-neutral-400 text-[10px]">Position {team.last_location_update ? `reported ${timeAgo(team.last_location_update)}` : 'time unknown'}</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {showShelters &&
          shelters.filter((shelter) => shelter.status !== 'closed').map((shelter) => {
            const pos = parseLocation(shelter.location);
            if (!pos) return null;
            const facilities = ([['wheelchair_access', 'Wheelchair'], ['medical_support', 'Medical'], ['family_area', 'Family area'], ['has_power', 'Power']] as const)
              .filter(([key]) => shelter[key]).map(([, label]) => label);
            return (
              <Marker key={shelter.id} position={pos} icon={shelter.status === 'full' ? fullShelterIcon : shelterIcon}>
                <Popup>
                  <div className="text-xs space-y-1 min-w-[180px]">
                    <span className="font-bold text-neutral-800">{shelter.name}</span>
                    <p className="text-neutral-600"><strong>Space:</strong> {Math.max(0, shelter.capacity - shelter.occupancy)} of {shelter.capacity} free{shelter.status === 'full' && ' (full)'}</p>
                    <p className="text-neutral-600"><strong>Facilities:</strong> {facilities.join(', ') || 'none confirmed'}</p>
                    <p className="text-neutral-400 text-[10px]">Updated {timeAgo(shelter.last_updated_at)} · not a safety guarantee</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {showResources &&
          resources.map((res) => {
            const pos = parseLocation(res.location);
            if (!pos) return null;
            return (
              <Marker key={res.id} position={pos} icon={resourceIcon}>
                <Popup>
                  <div className="text-xs space-y-1 min-w-[180px]">
                    <span className="font-bold text-neutral-800">{res.name}</span>
                    <p className="text-neutral-600"><strong>Type:</strong> {res.type}</p>
                    <p className="text-neutral-600"><strong>Available:</strong> {res.quantity_available}</p>
                    <p className="text-neutral-600"><strong>Reserved:</strong> {res.quantity_reserved}</p>
                    {res.quantity_available <= res.low_stock_threshold && (
                      <p className="text-red-600 font-medium">⚠ Low stock</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}

// A simpler map for picking a location (report form)
export function LocationPicker({ onPick, initialPos, center: viewCenter }: { onPick: (lat: number, lng: number) => void; initialPos?: [number, number]; center?: [number, number] }) {
  const center = initialPos || viewCenter || [28.61, 77.2];
  return (
    <div className="card overflow-hidden h-[300px]">
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationClickHandler onPick={onPick} initialPos={initialPos} />
      </MapContainer>
    </div>
  );
}

function LocationClickHandler({ onPick, initialPos }: { onPick: (lat: number, lng: number) => void; initialPos?: [number, number] }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    // Only place the starting marker once; re-renders must not stack extra markers.
    if (initialPos && !markerRef.current) {
      markerRef.current = L.marker(initialPos).addTo(map);
      map.setView(initialPos, 14);
    }
    const handler = (e: L.LeafletMouseEvent) => {
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng).addTo(map);
      }
      onPick(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map, onPick, initialPos]);

  return null;
}

// Small inline map for incident detail page
export function MiniMap({ position, height = '250px' }: { position: [number, number]; height?: string }) {
  return (
    <div className="card overflow-hidden" style={{ height }}>
      <MapContainer center={position} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker center={position} radius={12} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.4 }} />
        <Marker position={position} icon={incidentIcons.critical} />
      </MapContainer>
    </div>
  );
}
