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
  html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 23 13 23s13-13.25 13-23C26 5.82 20.18 0 13 0z" fill="#276033"/>
    <circle cx="13" cy="13" r="5" fill="#ffffff"/>
  </svg>`,
  iconSize: [26, 36],
  iconAnchor: [13, 36],
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
      className="h-72 w-full rounded-md border border-soil-100"
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
