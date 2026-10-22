import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Church, Landmark } from 'lucide-react-native';
import Svg, { Circle as SvgCircle, Path, Rect } from 'react-native-svg';

const TILE_SIZE = 256;
const SITE_MARKER_COLORS = [
  '#EF6C00',
  '#7B4DCE',
  '#00897B',
  '#1976D2',
  '#D81B60',
  '#2E7D5B',
  '#C2185B',
  '#00838F',
];

function projectCoordinate(latitude, longitude, zoom) {
  const worldSize = TILE_SIZE * (2 ** zoom);
  const clampedLatitude = Math.max(Math.min(latitude, 85.05112878), -85.05112878);
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize,
  };
}

const MapCanvas = forwardRef(function MapCanvas(
  { sites, selected, userLocation, simulationLocation, routeCoordinates, onSelect, initialRegion },
  ref
) {
  const [region, setRegion] = useState(initialRegion);
  const [mapSize, setMapSize] = useState({ width: 1, height: 1 });
  const mapSizeRef = useRef(mapSize);
  const regionRef = useRef(region);
  const dragStartRegion = useRef(region);
  const zoomLevel = Math.max(
    3,
    Math.min(
      19,
      Math.log2((360 * mapSize.width) / (TILE_SIZE * region.longitudeDelta))
    )
  );
  const tileZoom = Math.floor(zoomLevel);
  const scale = 2 ** (zoomLevel - tileZoom);
  const worldSize = TILE_SIZE * (2 ** tileZoom);
  const centerPoint = projectCoordinate(region.latitude, region.longitude, tileZoom);
  const tileGrid = [];
  const minTileX = Math.floor((centerPoint.x - mapSize.width / (2 * scale)) / TILE_SIZE) - 1;
  const maxTileX = Math.floor((centerPoint.x + mapSize.width / (2 * scale)) / TILE_SIZE) + 1;
  const minTileY = Math.max(
    0,
    Math.floor((centerPoint.y - mapSize.height / (2 * scale)) / TILE_SIZE) - 1
  );
  const maxTileY = Math.min(
    (2 ** tileZoom) - 1,
    Math.floor((centerPoint.y + mapSize.height / (2 * scale)) / TILE_SIZE) + 1
  );

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedTileX = ((tileX % (2 ** tileZoom)) + (2 ** tileZoom)) % (2 ** tileZoom);
      tileGrid.push({
        key: `${tileZoom}-${wrappedTileX}-${tileY}-${tileX}`,
        uri: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${tileZoom}/${tileY}/${wrappedTileX}`,
        left: mapSize.width / 2 + (tileX * TILE_SIZE - centerPoint.x) * scale,
        top: mapSize.height / 2 + (tileY * TILE_SIZE - centerPoint.y) * scale,
      });
    }
  }

  const updateRegion = (nextRegion) => {
    regionRef.current = nextRegion;
    setRegion(nextRegion);
  };

  useImperativeHandle(ref, () => ({
    animateToRegion: (nextRegion) => updateRegion(nextRegion),
    fitCoordinates: (coordinates) => {
      const { width, height } = mapSizeRef.current;
      if (!coordinates?.length || width <= 1 || height <= 1) return;

      const longitudes = coordinates.map(([longitude]) => longitude);
      const latitudes = coordinates.map(([, latitude]) => latitude);
      const minLongitude = Math.min(...longitudes);
      const maxLongitude = Math.max(...longitudes);
      const minLatitude = Math.min(...latitudes);
      const maxLatitude = Math.max(...latitudes);
      const centerLatitude = (minLatitude + maxLatitude) / 2;
      const centerLongitude = (minLongitude + maxLongitude) / 2;
      const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.001);
      const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.001);
      const aspectAdjustedLongitudeSpan = latitudeSpan
        * (width / height)
        / Math.max(Math.cos(centerLatitude * Math.PI / 180), 0.01);
      const longitudeDelta = Math.min(
        0.2,
        Math.max(longitudeSpan, aspectAdjustedLongitudeSpan) * 1.6
      );

      updateRegion({
        latitude: centerLatitude,
        longitude: centerLongitude,
        latitudeDelta: latitudeSpan * 1.6,
        longitudeDelta,
      });
    },
  }), [mapSize.height, mapSize.width]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
    onPanResponderGrant: () => {
      dragStartRegion.current = regionRef.current;
    },
    onPanResponderMove: (_, gesture) => {
      const start = dragStartRegion.current;
      updateRegion({
        ...start,
        longitude: start.longitude - (gesture.dx / mapSize.width) * start.longitudeDelta,
        latitude: start.latitude + (gesture.dy / mapSize.height) * start.latitudeDelta,
      });
    },
  }), [mapSize.height, mapSize.width]);

  const zoom = (factor) => {
    const current = regionRef.current;
    updateRegion({
      ...current,
      latitudeDelta: Math.min(Math.max(current.latitudeDelta * factor, 0.002), 0.2),
      longitudeDelta: Math.min(Math.max(current.longitudeDelta * factor, 0.002), 0.2),
    });
  };

  const toPosition = (latitude, longitude) => {
    const point = projectCoordinate(latitude, longitude, tileZoom);
    const x = mapSize.width / 2 + (point.x - centerPoint.x) * scale;
    const y = mapSize.height / 2 + (point.y - centerPoint.y) * scale;
    return { left: x, top: y };
  };

  const visibleSites = sites.filter((site) => {
    if (site.latitude == null || site.longitude == null) return false;
    const { left, top } = toPosition(site.latitude, site.longitude);
    return left >= -40 && left <= mapSize.width + 40
      && top >= -40 && top <= mapSize.height + 40;
  });
  const getSiteMarkerTheme = (site, index) => {
    const color = SITE_MARKER_COLORS[index % SITE_MARKER_COLORS.length];
    const Icon = site.name?.includes('Nhà thờ') ? Church : Landmark;
    return { color, Icon };
  };
  const routeSampleRate = Math.max(1, Math.ceil((routeCoordinates?.length || 0) / 500));
  const sampledRoute = routeCoordinates?.filter((_, index) =>
    index % routeSampleRate === 0 || index === routeCoordinates.length - 1
  );
  const routePath = sampledRoute?.map(([longitude, latitude], index) => {
    const point = toPosition(latitude, longitude);
    return `${index === 0 ? 'M' : 'L'} ${point.left} ${point.top}`;
  }).join(' ');
  const metersPerPixel = (latitude) => (
    156543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** zoomLevel)
  );

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        mapSizeRef.current = event.nativeEvent.layout;
        setMapSize(event.nativeEvent.layout);
      }}
      onWheel={(event) => {
        zoom(event.deltaY > 0 ? 1.25 : 0.8);
      }}
      {...panResponder.panHandlers}
    >
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <Rect width="1000" height="1000" fill="#F1F5EF" />
        <Rect x="46" y="70" width="248" height="176" rx="24" fill="#E2EBDD" />
        <Rect x="348" y="55" width="210" height="196" rx="24" fill="#E6EDDF" />
        <Rect x="650" y="78" width="286" height="178" rx="24" fill="#E4ECDF" />
        <Rect x="75" y="330" width="226" height="196" rx="24" fill="#E6EDDF" />
        <Rect x="359" y="337" width="250" height="188" rx="24" fill="#E2EBDD" />
        <Rect x="676" y="326" width="256" height="210" rx="24" fill="#E7EDDF" />
        <Rect x="55" y="615" width="258" height="190" rx="24" fill="#E4ECDF" />
        <Rect x="365" y="612" width="232" height="213" rx="24" fill="#E7EDDF" />
        <Rect x="652" y="620" width="284" height="180" rx="24" fill="#E2EBDD" />
        <Path d="M-80 285 C180 250 360 325 1080 267" fill="none" stroke="#FFFFFF" strokeWidth="36" />
        <Path d="M-100 567 C230 620 630 520 1080 586" fill="none" stroke="#FFFFFF" strokeWidth="42" />
        <Path d="M-50 865 C280 800 680 900 1080 835" fill="none" stroke="#FFFFFF" strokeWidth="30" />
        <Path d="M320 -60 C280 260 365 590 300 1060" fill="none" stroke="#FFFFFF" strokeWidth="34" />
        <Path d="M630 -40 C700 260 590 620 680 1050" fill="none" stroke="#FFFFFF" strokeWidth="40" />
      </Svg>

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {tileGrid.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri }}
            resizeMode="stretch"
            style={[styles.mapTile, { left: tile.left, top: tile.top, width: TILE_SIZE * scale, height: TILE_SIZE * scale }]}
          />
        ))}
      </View>

      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${mapSize.width} ${mapSize.height}`}
        preserveAspectRatio="none"
      >
        {visibleSites.map((site, index) => {
          const center = toPosition(site.latitude, site.longitude);
          const radius = Number(site.radius ?? 50) / metersPerPixel(site.latitude);
          const isSelected = selected?.id === site.id;
          const color = isSelected ? '#4285F4' : SITE_MARKER_COLORS[index % SITE_MARKER_COLORS.length];
          return (
            <SvgCircle
              key={`geofence-${site.id}`}
              cx={center.left}
              cy={center.top}
              r={radius}
              fill={isSelected ? '#4285F41A' : `${color}12`}
              stroke={color}
              strokeOpacity={isSelected ? 0.8 : 0.28}
              strokeWidth={isSelected ? 2 : 1}
            />
          );
        })}
        {routePath && <Path d={routePath} fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />}
        {routePath && <Path d={routePath} fill="none" stroke="#4285F4" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>

      {visibleSites.map((site) => (
        (() => {
          const { color, Icon } = getSiteMarkerTheme(site, sites.indexOf(site));
          const isSelected = selected?.id === site.id;
          return (
            <Pressable
              key={site.id}
              accessibilityRole="button"
              accessibilityLabel={`Chọn di tích ${site.name}`}
              onPress={() => onSelect(site)}
              style={[styles.siteMarker, toPosition(site.latitude, site.longitude)]}
            >
              <View style={[styles.siteMarkerPointer, { backgroundColor: color }]} />
              <View style={[
                styles.siteMarkerBubble,
                { backgroundColor: color },
                isSelected && styles.siteMarkerBubbleSelected,
              ]}>
                <Icon size={18} color="#fff" strokeWidth={2.5} />
              </View>
              {isSelected && (
                <View style={[styles.siteLabel, styles.siteLabelSelected]}>
                  <Text numberOfLines={1} style={[styles.siteLabelText, styles.siteLabelTextSelected]}>
                    {site.name}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })()
      ))}

      {userLocation && (
        <View style={[styles.userMarker, toPosition(userLocation.latitude, userLocation.longitude)]} accessibilityLabel="Vị trí hiện tại">
          <View style={styles.userPulse} />
          <View style={styles.userDot} />
        </View>
      )}
      {simulationLocation && (
        <View
          style={[styles.simulationMarker, toPosition(simulationLocation.latitude, simulationLocation.longitude)]}
          accessibilityLabel="Vị trí mô phỏng"
        >
          <View style={styles.simulationPulse} />
          <View style={styles.simulationDot} />
          <View style={styles.simulationLabel}>
            <Text style={styles.simulationLabelText}>Mô phỏng</Text>
          </View>
        </View>
      )}
      <View style={styles.zoomControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Phóng to bản đồ"
          onPress={() => zoom(0.75)}
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thu nhỏ bản đồ"
          onPress={() => zoom(1.33)}
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
      </View>
      <View pointerEvents="none" style={styles.mapAttribution}>
        <Text style={styles.mapAttributionText}>
          Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), © OpenStreetMap contributors, GIS User Community
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#F1F5EF' },
  mapTile: { position: 'absolute' },
  siteMarker: { position: 'absolute', zIndex: 2, width: 44, height: 46, alignItems: 'center', transform: [{ translateX: -22 }, { translateY: -46 }] },
  siteMarkerPointer: { position: 'absolute', bottom: 1, width: 13, height: 13, borderWidth: 2, borderColor: '#fff', borderRadius: 3, transform: [{ rotate: '45deg' }], shadowColor: '#202124', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  siteMarkerBubble: { zIndex: 1, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', borderRadius: 20, shadowColor: '#202124', shadowOpacity: 0.26, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  siteMarkerBubbleSelected: { width: 44, height: 44, borderWidth: 4, borderColor: '#E8F0FE' },
  siteLabel: { position: 'absolute', top: 49, left: -58, width: 160, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: '#E8EAED', borderRadius: 12, backgroundColor: '#fff', shadowColor: '#202124', shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  siteLabelSelected: { borderColor: '#4285F4', backgroundColor: '#E8F0FE' },
  siteLabelText: { maxWidth: 140, color: '#3C4043', fontSize: 10, fontWeight: '600' },
  siteLabelTextSelected: { color: '#1967D2' },
  userMarker: { position: 'absolute', zIndex: 3, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: -17 }, { translateY: -17 }] },
  userPulse: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: '#3987F533' },
  userDot: { width: 15, height: 15, borderWidth: 3, borderColor: '#fff', borderRadius: 8, backgroundColor: '#3987F5', shadowColor: '#2459A8', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  simulationMarker: { position: 'absolute', zIndex: 4, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: -18 }, { translateY: -18 }] },
  simulationPulse: { position: 'absolute', width: 34, height: 34, borderWidth: 1, borderColor: '#F04D2E66', borderRadius: 17, backgroundColor: '#F04D2E24' },
  simulationDot: { width: 16, height: 16, borderWidth: 3, borderColor: '#fff', borderRadius: 8, backgroundColor: '#F04D2E', shadowColor: '#9D2714', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  simulationLabel: { position: 'absolute', top: -21, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: '#F04D2E' },
  simulationLabelText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  zoomControls: { position: 'absolute', right: 14, bottom: 185, zIndex: 5, alignItems: 'center', overflow: 'hidden', borderRadius: 22, backgroundColor: '#fff', shadowColor: '#202124', shadowOpacity: 0.2, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  zoomButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  zoomText: { color: '#3C4043', fontSize: 22, fontWeight: '500', lineHeight: 26 },
  zoomDivider: { width: 26, height: 1, backgroundColor: '#E7E9E3' },
  mapAttribution: { position: 'absolute', right: 64, bottom: 5, zIndex: 4, maxWidth: '82%', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, backgroundColor: '#ffffffd9' },
  mapAttributionText: { color: '#58615A', fontSize: 7, textAlign: 'right' },
});

export default MapCanvas;
