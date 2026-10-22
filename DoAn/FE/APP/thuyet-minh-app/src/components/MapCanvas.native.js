import { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { Church, Landmark } from 'lucide-react-native';

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

function getSiteMarkerTheme(site, index) {
  const color = SITE_MARKER_COLORS[index % SITE_MARKER_COLORS.length];
  const Icon = site.name?.includes('Nhà thờ') ? Church : Landmark;
  return { color, Icon };
}

const MapCanvas = forwardRef(function MapCanvas({ sites, selected, userLocation, simulationLocation, routeCoordinates, onSelect, initialRegion }, ref) {
  const mapRef = useRef(null);
  useImperativeHandle(ref, () => ({
    animateToRegion: (...args) => mapRef.current?.animateToRegion(...args),
    fitCoordinates: (coordinates) => {
      if (coordinates?.length) {
        mapRef.current?.fitToCoordinates(
          coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
          { edgePadding: { top: 100, right: 48, bottom: 180, left: 48 }, animated: true }
        );
      }
    },
  }), []);

  return (
    <MapView
      ref={mapRef}
      style={{ width: '100%', height: '100%' }}
      showsUserLocation={!userLocation}
      showsMyLocationButton
      initialRegion={initialRegion}
    >
      {sites.map((site, index) => {
        if (site.latitude == null || site.longitude == null) return null;
        const color = SITE_MARKER_COLORS[index % SITE_MARKER_COLORS.length];
        const isSelected = selected?.id === site.id;
        return (
          <Circle
            key={`geofence-${site.id}`}
            center={{ latitude: site.latitude, longitude: site.longitude }}
            radius={Number(site.radius ?? 50)}
            fillColor={isSelected ? '#4285F41A' : `${color}12`}
            strokeColor={isSelected ? '#4285F4CC' : `${color}55`}
            strokeWidth={isSelected ? 2 : 1}
          />
        );
      })}
      {!!routeCoordinates?.length && (
        <Polyline
          coordinates={routeCoordinates.map(([longitude, latitude]) => ({ latitude, longitude }))}
          strokeColor="#4285F4"
          strokeWidth={8}
        />
      )}
      {sites.map((site, index) => (
        site.latitude != null && site.longitude != null ? (
          <Marker
            key={site.id}
            coordinate={{ latitude: site.latitude, longitude: site.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            title={site.name}
            description={site.address}
            onPress={() => onSelect(site)}
          >
            {(() => {
              const { color, Icon } = getSiteMarkerTheme(site, index);
              const isSelected = selected?.id === site.id;
              return (
                <View style={{ width: isSelected ? 46 : 40, height: 46, alignItems: 'center' }}>
                  <View style={{
                    width: isSelected ? 42 : 36,
                    height: isSelected ? 42 : 36,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: isSelected ? 4 : 3,
                    borderColor: isSelected ? '#E8F0FE' : '#fff',
                    borderRadius: 24,
                    backgroundColor: color,
                    shadowColor: '#202124',
                    shadowOpacity: 0.26,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 4,
                  }}>
                    <Icon size={18} color="#fff" strokeWidth={2.5} />
                  </View>
                  <View style={{
                    position: 'absolute',
                    bottom: 5,
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: color,
                    transform: [{ rotate: '45deg' }],
                    zIndex: -1,
                  }} />
                </View>
              );
            })()}
          </Marker>
        ) : null
      ))}
      {userLocation && (
        <>
          {Number.isFinite(userLocation.accuracy) && (
            <Circle
              center={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
              radius={Math.min(Math.max(userLocation.accuracy, 10), 200)}
              fillColor="#3987F526"
              strokeColor="#3987F577"
              strokeWidth={1}
            />
          )}
          <Marker
            coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
            title="Vị trí hiện tại"
            tracksViewChanges={false}
          >
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#3987F533' }}>
              <View style={{ width: 14, height: 14, borderWidth: 3, borderColor: '#fff', borderRadius: 7, backgroundColor: '#3987F5' }} />
            </View>
          </Marker>
        </>
      )}
      {simulationLocation && (
        <Marker
          coordinate={{ latitude: simulationLocation.latitude, longitude: simulationLocation.longitude }}
          title="Vị trí mô phỏng"
          pinColor="#F04D2E"
          tracksViewChanges={false}
        />
      )}
    </MapView>
  );
});

export default MapCanvas;
