import { Fragment, useEffect, useMemo } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';

const DEFAULT_CENTER = [10.7769, 106.7009];

function MapViewport({
  points,
  fitAllRequest,
  gpsFocusRequest,
  gpsFocusLocation,
  routeFocusRequest,
  routeCoordinates,
}) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
    }
  }, [map, points]);

  useEffect(() => {
    if (fitAllRequest > 0 && points.length) {
      map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
    }
  }, [fitAllRequest, map, points]);

  useEffect(() => {
    if (gpsFocusRequest > 0 && gpsFocusLocation) {
      map.flyTo([gpsFocusLocation.latitude, gpsFocusLocation.longitude], 16);
    }
  }, [gpsFocusLocation, gpsFocusRequest, map]);

  useEffect(() => {
    if (routeFocusRequest > 0 && routeCoordinates?.length) {
      const routePoints = routeCoordinates.map(([longitude, latitude]) => [latitude, longitude]);
      map.fitBounds(routePoints, { padding: [48, 48], maxZoom: 17 });
    }
  }, [map, routeCoordinates, routeFocusRequest]);

  return null;
}

export default function SiteMap({
  sites,
  currentLocation,
  selectedSiteCode,
  onSelectSite,
  simulationLocation,
  routeCoordinates,
  fitAllRequest,
  gpsFocusRequest,
  gpsFocusLocation,
  routeFocusRequest,
}) {
  const points = useMemo(
    () => sites.map(({ lat, lng }) => [Number(lat), Number(lng)]),
    [sites],
  );
  const center = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : points[0] ?? DEFAULT_CENTER;

  return (
    <MapContainer
      className="large-map leaflet-map"
      center={center}
      zoom={14}
      scrollWheelZoom
    >
      <TileLayer
        attribution='Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), &copy; OpenStreetMap contributors, GIS User Community'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
      />
      <MapViewport
        points={points}
        fitAllRequest={fitAllRequest}
        gpsFocusRequest={gpsFocusRequest}
        gpsFocusLocation={gpsFocusLocation}
        routeFocusRequest={routeFocusRequest}
        routeCoordinates={routeCoordinates}
      />
      {sites.map((site, index) => {
        const point = points[index];
        const isSelected = selectedSiteCode === site.code;
        const color = isSelected ? '#4285f4' : site.isActive ? '#27845a' : '#e16b45';
        return (
          <Fragment key={site.code ?? site.id}>
            <Circle
              center={point}
              radius={Number(site.radius ?? 100)}
              pathOptions={{
                color,
                weight: isSelected ? 2 : 1,
                fillColor: color,
                fillOpacity: isSelected ? 0.12 : 0.06,
              }}
            />
            <CircleMarker
              center={point}
              radius={isSelected ? 10 : 8}
              eventHandlers={{ click: () => onSelectSite(site) }}
              pathOptions={{
                color: '#fff',
                weight: 3,
                fillColor: color,
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>{site.name}</strong>
                <br />
                {site.address}
                <br />
                {point[0].toFixed(6)}, {point[1].toFixed(6)}
                <br />
                Bán kính: {Number(site.radius ?? 100)} m
              </Popup>
            </CircleMarker>
          </Fragment>
        );
      })}
      {routeCoordinates?.length > 1 && (
        <Polyline
          positions={routeCoordinates.map(([longitude, latitude]) => [latitude, longitude])}
          pathOptions={{ color: '#4285f4', weight: 6, opacity: 0.85 }}
        />
      )}
      {currentLocation && (
        <>
          {Number.isFinite(currentLocation.accuracy) && (
            <Circle
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={Math.min(Math.max(currentLocation.accuracy, 10), 200)}
              pathOptions={{ color: '#3987f5', weight: 1, fillColor: '#3987f5', fillOpacity: 0.12 }}
            />
          )}
          <CircleMarker
            center={[currentLocation.latitude, currentLocation.longitude]}
            radius={8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: '#3987f5', fillOpacity: 1 }}
          >
            <Popup>Vị trí hiện tại của bạn</Popup>
          </CircleMarker>
        </>
      )}
      {simulationLocation && (
        <CircleMarker
          center={[simulationLocation.latitude, simulationLocation.longitude]}
          radius={9}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#f04d2e', fillOpacity: 1 }}
        >
          <Popup>Vị trí đang giả lập</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
