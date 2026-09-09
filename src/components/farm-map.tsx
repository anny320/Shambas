'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

/**
 * Leaflet's default marker icon is resolved from a relative URL that does not
 * survive bundling, which is why the pin silently disappears otherwise. Draw
 * our own instead and skip the asset entirely.
 */
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M15 0C6.72 0 0 6.72 0 15c0 11.25 15 27 15 27s15-15.75 15-27C30 6.72 23.28 0 15 0z"
          fill="#12b76a" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="15" cy="15" r="5.5" fill="#ffffff"/>
  </svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
});

/** Roughly the centre of Kenya's cropland, used before a pin is placed. */
export const DEFAULT_CENTRE: [number, number] = [-0.4237, 36.9476];

interface FarmMapProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

function ClickCapture({ onChange }: { onChange: FarmMapProps['onChange'] }) {
  useMapEvents({
    click(event) {
      onChange(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

/** Recentres when the pin is moved from outside the map, e.g. by GPS. */
function Recentre({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lng !== null) {
      map.setView([lat, lng], Math.max(map.getZoom(), 13));
    }
  }, [lat, lng, map]);
  return null;
}

export default function FarmMap({ lat, lng, onChange }: FarmMapProps) {
  const centre = useMemo<[number, number]>(
    () => (lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTRE),
    [lat, lng],
  );

  return (
    <MapContainer
      center={centre}
      zoom={lat !== null ? 13 : 7}
      scrollWheelZoom
      className="h-72 w-full rounded-xl border border-ink-200"
    >
      {/*
        OpenStreetMap tiles need no API key, which keeps the whole app
        runnable with no external credentials. Attribution is required by
        their terms.
      */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ClickCapture onChange={onChange} />
      <Recentre lat={lat} lng={lng} />
      {lat !== null && lng !== null && (
        <Marker
          position={[lat, lng]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend(event) {
              const { lat: newLat, lng: newLng } = event.target.getLatLng();
              onChange(newLat, newLng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
