import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, GeoJSON, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { parseLocation } from '@/types';
import type { DangerZone, Incident, RescueTeam, Resource, Shelter, TeamStatus } from '@/types';
import { PriorityBadge } from '@/components/ui/Badges';
import { INCIDENT_TYPE_LABELS, STATUS_LABELS, TEAM_MARKER_COLORS, TEAM_STATUS_LABELS } from '@/types';
import { timeAgo } from '@/lib/utils';
import { locate, LOCATE_HELP, type LocateFailure } from '@/lib/geolocation';

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
  critical: makeIcon('#C8261B', '!'),
  high: makeIcon('#C2510C', '!'),
  moderate: makeIcon('#B98410', '·'),
  low: makeIcon('#5F8C79', 'i'),
};

const teamIcons = Object.fromEntries(Object.entries(TEAM_MARKER_COLORS).map(([status, color]) => [status, makeIcon(color, 'T')])) as Record<TeamStatus, L.DivIcon>;
const resourceIcon = makeIcon('#44585A', 'R');
const shelterIcon = makeIcon('#2F7A57', 'S');
const fullShelterIcon = makeIcon('#7A8B8A', 'S');
const ISLAMABAD: [number, number] = [33.6844, 73.0479];
const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;
const tileUrl = mapTilerKey ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${mapTilerKey}` : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

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
  dangerZones?: DangerZone[];
  route?: [number, number][];
  areas?: MapArea[];
}

// Neighbourhood vulnerability (cool shading = information) and silent zones (warm dashed outline = needs checking).
export type MapArea = { id: string; name: string; vulnerability_index: number; boundary: { type: 'Polygon'; coordinates: number[][][] }; silent?: boolean; is_demo?: boolean };

export function IncidentMap({ incidents = [], teams = [], resources = [], shelters = [], onIncidentClick, showIncidents = true, showTeams = true, showResources = true, showShelters = true, height = '500px', dangerZones = [], route = [], areas = [] }: IncidentMapProps) {
  const locations = useMemo(
    () => [...incidents.map((i) => i.location), ...teams.map((t) => t.location), ...resources.map((r) => r.location), ...shelters.map((s) => s.location)],
    [incidents, teams, resources, shelters],
  );
  return (
    <div className="card overflow-hidden" style={{ height }}>
      <MapContainer center={ISLAMABAD} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={tileUrl}
        />
        <FitBounds locations={locations} />
        {areas.map((area) => <GeoJSON key={`${area.id}-${area.silent ? 's' : 'n'}`} data={area.boundary as GeoJsonObject} pathOptions={{ color: area.silent ? '#C2510C' : '#0B6E66', weight: area.silent ? 3 : 1, dashArray: area.silent ? '8 6' : undefined, fillColor: '#0B6E66', fillOpacity: 0.06 + Number(area.vulnerability_index) * 0.3 }}><Popup><strong>{area.name}</strong><br />Vulnerability {Math.round(Number(area.vulnerability_index) * 100)}%{area.silent && <><br /><strong>Silent zone:</strong> under warning with fewer reports than expected</>}{area.is_demo && <><br />Demo data</>}</Popup></GeoJSON>)}
        {dangerZones.map((zone) => <GeoJSON key={zone.id} data={zone.geojson as GeoJsonObject} pathOptions={{ color: zone.severity === 'critical' ? '#C8261B' : '#C2510C', fillOpacity: zone.verification_status === 'confirmed' ? 0.28 : 0.14, dashArray: zone.verification_status === 'provisional' ? '6 6' : undefined }}><Popup><strong>{zone.name}</strong><br />{zone.verification_status === 'provisional' ? 'Unverified public report' : 'Confirmed danger zone'}<br />{zone.instructions}</Popup></GeoJSON>)}
        {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#0B6E66', weight: 6, opacity: 0.85 }} />}

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
                  <p className="text-neutral-400 text-xs">{timeAgo(inc.created_at)}</p>
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
                    <p className="text-neutral-400 text-xs">Position {team.last_location_update ? `reported ${timeAgo(team.last_location_update)}` : 'time unknown'}</p>
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
                    <p className="text-neutral-400 text-xs">Updated {timeAgo(shelter.last_updated_at)} · not a safety guarantee</p>
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
  const center = initialPos || viewCenter || ISLAMABAD;
  const [locateRequest, setLocateRequest] = useState(1);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(initialPos ? 'found' : 'locating');
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span role="status" aria-live="polite" className={`text-sm ${locationStatus === 'found' ? 'text-success' : locationStatus === 'locating' ? 'text-neutral-600' : 'text-moderate'}`}>
          {locationStatus === 'locating' ? 'Finding your location… allow it if your browser asks.' : locationStatus === 'found' ? 'Location found. Drag the pin or tap the map to correct it.' : LOCATE_HELP[locationStatus]}
        </span>
        <button type="button" className="btn-secondary btn-sm" disabled={locationStatus === 'locating'} onClick={() => { setLocationStatus('locating'); setLocateRequest((value) => value + 1); }}>
          Use my location
        </button>
      </div>
      <div className="card overflow-hidden h-[300px]">
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url={tileUrl}
          />
          <LocationClickHandler onPick={onPick} initialPos={initialPos} locateRequest={locateRequest} onLocationStatus={setLocationStatus} />
        </MapContainer>
      </div>
    </div>
  );
}

type LocationStatus = 'locating' | 'found' | LocateFailure;

function LocationClickHandler({ onPick, initialPos, locateRequest, onLocationStatus }: { onPick: (lat: number, lng: number) => void; initialPos?: [number, number]; locateRequest: number; onLocationStatus: (status: LocationStatus) => void }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const placeMarker = useCallback((lat: number, lng: number, zoom = false) => {
    const latLng = L.latLng(lat, lng);
    if (markerRef.current) markerRef.current.setLatLng(latLng);
    else {
      markerRef.current = L.marker(latLng, { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const position = markerRef.current?.getLatLng();
        if (position) onPickRef.current(position.lat, position.lng);
      });
    }
    if (zoom) map.setView(latLng, 16);
    onPickRef.current(lat, lng);
  }, [map]);

  useEffect(() => {
    // Only place the starting marker once; re-renders must not stack extra markers.
    if (initialPos && !markerRef.current) {
      markerRef.current = L.marker(initialPos, { draggable: true }).addTo(map);
      map.setView(initialPos, 14);
    }
    const handler = (e: L.LeafletMouseEvent) => {
      placeMarker(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map, initialPos, placeMarker]);

  useEffect(() => {
    // A preset position only skips the automatic lookup; "Use my location" (locateRequest > 1) still works.
    if (initialPos && locateRequest === 1) return;
    let active = true;
    void locate().then((result) => {
      if (!active) return;
      if (result.ok) { placeMarker(result.latitude, result.longitude, true); onLocationStatus('found'); }
      else onLocationStatus(result.reason);
    });
    return () => { active = false; };
  }, [locateRequest, initialPos, map, onLocationStatus, placeMarker]);

  return null;
}

// Small inline map for incident detail page
export function MiniMap({ position, height = '250px' }: { position: [number, number]; height?: string }) {
  return (
    <div className="card overflow-hidden" style={{ height }}>
      <MapContainer center={position} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url={tileUrl}
        />
        <CircleMarker center={position} radius={12} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.4 }} />
        <Marker position={position} icon={incidentIcons.critical} />
      </MapContainer>
    </div>
  );
}
