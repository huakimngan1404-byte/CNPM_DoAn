import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, ImageBackground, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text as NativeText, TextInput as NativeTextInput, View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import {
  ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Compass, Headphones, Heart, Info, Languages, LocateFixed,
  Map, MapPin, MoreHorizontal, Navigation, Pause, Play, RotateCcw,
  RotateCw, Search, Settings, Share2, SlidersHorizontal, Sparkles, X,
} from 'lucide-react-native';
import { languages, sites } from './src/data/heritage.js';
import {
  apiBaseUrl, fetchNearbySites, fetchSiteAudio, fetchSites,
  heartbeatListener, leaveListener,
} from './src/services/api.js';
import MapCanvas from './src/components/MapCanvas';
import { translateUiText } from './src/i18n.js';

const UiLanguageContext = createContext('vi');

function Text({ children, ...props }) {
  const language = useContext(UiLanguageContext);
  const localizedChildren = Array.isArray(children)
    ? children.map((child) => typeof child === 'string' ? translateUiText(child, language) : child)
    : typeof children === 'string' ? translateUiText(children, language) : children;
  return <NativeText {...props}>{localizedChildren}</NativeText>;
}

function LocalizedTextInput({ placeholder, ...props }) {
  const language = useContext(UiLanguageContext);
  return (
    <NativeTextInput
      {...props}
      placeholder={placeholder ? translateUiText(placeholder, language) : placeholder}
    />
  );
}

const accent = '#F04D2E';
const ink = '#22201F';
const muted = '#98928C';

const tabs = [
  { key: 'home', label: 'Khám phá', icon: Compass },
  { key: 'map', label: 'Bản đồ', icon: Map },
  { key: 'saved', label: 'Đã lưu', icon: Bookmark },
  { key: 'profile', label: 'Cá nhân', icon: Settings },
];

function createVisitorSessionId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const value = Math.floor(Math.random() * 16);
      return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
    });
}

export default function App() {
  const [visitorSessionId] = useState(createVisitorSessionId);
  const [activeTab, setActiveTab] = useState('home');
  const [screen, setScreen] = useState('main');
  const [selectedSite, setSelectedSite] = useState(sites[0]);
  const [siteList, setSiteList] = useState(sites);
  const [appLanguage, setAppLanguage] = useState(languages[0]);
  const [audioLanguage, setAudioLanguage] = useState(languages[0]);
  const [languagePicker, setLanguagePicker] = useState(false);
  const [languagePickerMode, setLanguagePickerMode] = useState('app');
  const [savedIds, setSavedIds] = useState([]);
  const geofenceInsideRef = useRef(new Set());
  const siteListRef = useRef(siteList);
  const selectedSiteRef = useRef(selectedSite);
  siteListRef.current = siteList;
  selectedSiteRef.current = selectedSite;
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState('');
  const audioPlayer = useAudioPlayer(null);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const playing = audioStatus.playing;
  const elapsed = audioStatus.currentTime || 0;
  const [category, setCategory] = useState('Tất cả');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [autoPlay, setAutoPlay] = useState(true);
  const [pendingAutoPlaySiteId, setPendingAutoPlaySiteId] = useState(null);
  const [mapAudioSiteId, setMapAudioSiteId] = useState(null);
  const [readyAudioSiteId, setReadyAudioSiteId] = useState(null);
  const audioLoadAwaitingSiteRef = useRef(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const openLanguagePicker = (mode = 'app') => {
    setLanguagePickerMode(mode);
    setLanguagePicker(true);
  };
  const filteredSites = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('vi');
    return siteList.filter((site) => {
      const matchesCategory = category === 'Tất cả' || site.category === category;
      const matchesQuery = !q || `${site.name} ${site.address} ${site.category}`.toLocaleLowerCase('vi').includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [category, search, siteList]);

  useEffect(() => {
    const sendHeartbeat = () => {
      if (Platform.OS === 'web' && document.visibilityState === 'hidden') return;
      if (Platform.OS !== 'web' && AppState.currentState && AppState.currentState !== 'active') return;
      heartbeatListener(visitorSessionId).catch((error) => {
        console.error('Không thể cập nhật phiên truy cập:', error);
      });
    };
    const leave = () => {
      leaveListener(visitorSessionId).catch((error) => {
        console.error('Không thể kết thúc phiên truy cập:', error);
      });
    };
    const appStateSubscription = Platform.OS !== 'web'
      ? AppState.addEventListener('change', (state) => {
        if (state === 'active') sendHeartbeat();
        else leave();
      })
      : null;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
      else leave();
    };
    const onPageHide = () => leave();
    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pagehide', onPageHide);
    }

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => {
      clearInterval(interval);
      appStateSubscription?.remove();
      if (Platform.OS === 'web') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
      }
      leave();
    };
  }, [visitorSessionId]);

// Theo dõi GPS thật và tự phát audio khi vừa vào vùng 50 m của một di tích.
useEffect(() => {
  let locationSubscription = null;
  let isActive = true;

  const startTracking = async () => {
    if (!autoPlay) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (!isActive || status !== 'granted') return;

    locationSubscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      (location) => {
        const { latitude, longitude } = location.coords;
        if (!isActive) return;
        void fetchNearbySites(latitude, longitude, audioLanguage.id).catch((error) => {
          console.error('Không thể đồng bộ vị trí GPS với backend:', error);
        });

        const currentInside = geofenceInsideRef.current;
        const nextInside = new Set();
        const newlyEntered = [];
        siteListRef.current.forEach((site) => {
          if (site.latitude == null || site.longitude == null) return;
          const distance = calculateDistance(
            latitude,
            longitude,
            Number(site.latitude),
            Number(site.longitude)
          );
          const radius = Number(site.radius ?? 100);
          const wasInside = currentInside.has(site.id);
          if (distance <= radius || (wasInside && distance <= radius + 15)) {
            nextInside.add(site.id);
          }
          if (!wasInside && distance <= radius) {
            newlyEntered.push({ site, distance });
          }
        });
        geofenceInsideRef.current = nextInside;

        const enteredSite = newlyEntered
          .sort((left, right) => left.distance - right.distance)[0]?.site;
        if (!enteredSite) return;

        audioPlayer.pause();
        audioPlayer.replace(null);
        setPendingAutoPlaySiteId(enteredSite.id);
        setSelectedSite(enteredSite);
        setScreen('detail');
      }
    );
  };

  void startTracking().catch((error) => {
    console.error('Không thể khởi động theo dõi GPS:', error);
  });

  return () => {
    isActive = false;
    if (locationSubscription) locationSubscription.remove();
  };
}, [autoPlay, audioLanguage.id, audioPlayer]);

  useEffect(() => {
    let isActive = true;

    const shouldLoadForDetail = screen === 'detail';
    const shouldLoadForMapPlayback = activeTab === 'map'
      && (pendingAutoPlaySiteId === selectedSite?.id
        || mapAudioSiteId === selectedSite?.id);
    if (!shouldLoadForDetail && !shouldLoadForMapPlayback) {
      return () => { isActive = false; };
    }

    if (selectedSite?.audioUrl && (
      !selectedSite.code || selectedSite.audioLang === audioLanguage.id
    )) {
      setAudioError('');
      setAudioLoading(true);
      setReadyAudioSiteId(null);
      audioLoadAwaitingSiteRef.current = selectedSite.id;
      audioPlayer.replace(selectedSite.audioUrl);
      return () => { isActive = false; };
    }

    audioPlayer.pause();
    if (!selectedSite?.code) {
      setAudioLoading(false);
      return () => { isActive = false; };
    }

    setAudioLoading(true);
    fetchSiteAudio(selectedSite.code, audioLanguage.id)
      .then((translation) => {
        if (!isActive) return;
        const updatedSite = {
          ...selectedSite,
          audioUrl: translation.audioUrl,
          audioLang: audioLanguage.id,
          story: translation.description || selectedSite.story,
        };
        setSiteList((current) => current.map((site) =>
          site.id === updatedSite.id ? { ...site, ...updatedSite } : site
        ));
        setSelectedSite((current) =>
          current?.id === updatedSite.id ? { ...current, ...updatedSite } : current
        );
        setAudioError('');
      })
      .catch((error) => {
        if (!isActive) return;
        console.error('Không thể tải audio của di tích:', error);
        setAudioError(error.message);
        setAudioLoading(false);
        setPendingAutoPlaySiteId(null);
      });

    return () => { isActive = false; };
  }, [activeTab, audioPlayer, audioLanguage.id, mapAudioSiteId, pendingAutoPlaySiteId, screen, selectedSite?.id, selectedSite?.code, selectedSite?.audioUrl, selectedSite?.audioLang]);

  useEffect(() => {
    if (audioPlayer.isLoaded
      && audioLoadAwaitingSiteRef.current === selectedSite?.id) {
      setReadyAudioSiteId(selectedSite.id);
      audioLoadAwaitingSiteRef.current = null;
    }
  }, [audioPlayer, audioStatus, selectedSite?.audioUrl, selectedSite?.id]);

  useEffect(() => {
    if ((screen === 'detail' || mapAudioSiteId === selectedSite?.id
      || pendingAutoPlaySiteId === selectedSite?.id)
      && readyAudioSiteId === selectedSite?.id) {
      setAudioLoading(false);
    }
  }, [mapAudioSiteId, pendingAutoPlaySiteId, readyAudioSiteId, screen, selectedSite?.id]);

  useEffect(() => {
    if (audioStatus.error) {
      setAudioLoading(false);
      setAudioError(audioStatus.error);
      setPendingAutoPlaySiteId(null);
      showToast(`Không phát được audio: ${audioStatus.error}`);
    }
  }, [audioStatus.error]);

  useEffect(() => {
    if (!pendingAutoPlaySiteId
      || selectedSite?.id !== pendingAutoPlaySiteId
      || !selectedSite?.audioUrl
      || readyAudioSiteId !== selectedSite.id) return;

    audioPlayer.play();
    if (activeTab === 'map') setMapAudioSiteId(selectedSite.id);
    setPendingAutoPlaySiteId(null);
    showToast(`Mô phỏng đã đến gần ${selectedSite.name}: đang phát thuyết minh.`);
  }, [activeTab, audioPlayer, pendingAutoPlaySiteId, readyAudioSiteId, selectedSite?.audioUrl, selectedSite?.id]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2300);
  };

  const toggleSaved = (site) => {
    setSavedIds((current) => current.includes(site.id)
      ? current.filter((id) => id !== site.id)
      : [...current, site.id]);
    showToast(savedIds.includes(site.id) ? 'Đã bỏ lưu di tích' : 'Đã lưu vào bộ sưu tập');
  };

  const openDetail = (site) => {
    setPendingAutoPlaySiteId(null);
    setSelectedSite(site);
    setScreen('detail');
    audioPlayer.pause();
    audioPlayer.replace(null);
  };

  const selectTab = (key) => {
    setActiveTab(key);
    setScreen('main');
    audioPlayer.pause();
  };

  const playSelectedAudio = () => {
    if (audioLoading) {
      showToast('Đang chuẩn bị audio, vui lòng đợi một chút.');
      return;
    }
    if (!selectedSite?.audioUrl) {
      showToast(audioError || 'Di tích này chưa có audio từ máy chủ.');
      return;
    }
    if (!audioStatus.isLoaded) {
      showToast('Audio đang tải, vui lòng đợi một chút rồi thử lại.');
      return;
    }
    if (playing) audioPlayer.pause();
    else audioPlayer.play();
  };

  const playMapAudio = (site) => {
    if (audioLoading || !audioStatus.isLoaded || selectedSite?.id !== site.id) {
      showToast('Audio đang được chuẩn bị. Vui lòng đợi một chút.');
      return;
    }
    if (playing) audioPlayer.pause();
    else audioPlayer.play();
  };

  const simulateArrival = useCallback((site) => {
    audioPlayer.pause();
    audioPlayer.replace(null);
    setAudioError('');
    setMapAudioSiteId(null);
    setPendingAutoPlaySiteId(site.id);
    setSelectedSite(site);
    setActiveTab('map');
    setScreen('main');
  }, [audioPlayer]);

  const seekSelectedAudio = (amount) => {
    const duration = audioStatus.duration || durationSeconds(selectedSite?.duration || '00:00');
    void audioPlayer.seekTo(Math.max(0, Math.min(duration, elapsed + amount)));
  };

  const findNearby = async () => {
    try {
      setApiLoading(true);

      // 1. Lấy vị trí GPS hiện tại của người dùng
      const permissionResult = await Location.requestForegroundPermissionsAsync();
      if (permissionResult.status !== 'granted') {
        throw new Error('Ứng dụng cần quyền vị trí để tìm di tích gần bạn.');
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const userLat = location.coords.latitude;
      const userLng = location.coords.longitude;

      await fetchNearbySites(userLat, userLng, audioLanguage.id);

      // Tính khoảng cách với danh sách đã đồng bộ từ backend.
      const nearbySites = siteList
        .map(site => {
          if (site.latitude == null || site.longitude == null) return { ...site, realDist: 99999 };
          
          // Dùng hàm tính khoảng cách (ra đơn vị mét)
          const dist = calculateDistance(userLat, userLng, site.latitude, site.longitude);
          
          // Tạo nhãn khoảng cách đẹp mắt (Ví dụ: "850m" hoặc "1.2km")
          const distanceLabel = dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`;

          return { ...site, realDist: dist, distance: distanceLabel };
        })
        .filter(site => site.realDist <= 2000)      // BỘ LỌC: Chỉ giữ lại các điểm <= 2000 mét
        .sort((a, b) => a.realDist - b.realDist);   // SẮP XẾP: Từ gần nhất đến xa nhất

      // 3. Xử lý hiển thị kết quả
      if (nearbySites.length === 0) {
        showToast('Không có di tích nào trong bán kính 2km quanh bạn.');
        return;
      }

      // Đẩy dữ liệu ra màn hình Khám phá
      setSiteList(nearbySites);
      setCategory('Tất cả'); 
      setSearch(''); 
      setActiveTab('explore'); // Chuyển sang Tab Khám phá để xem danh sách
      setScreen('main');
      
      showToast(`Đã tìm thấy ${nearbySites.length} điểm trong vòng 2km!`);

    } catch (error) {
      showToast(error.message || 'Không thể định vị. Hãy bật GPS.');
    } finally {
      setApiLoading(false);
    }
  };

  const retryFetchSites = () => {
    setApiLoading(true);
    setApiError('');
    fetchSites()
      .then((records) => {
      const remoteSites = records.length ? records : sites;
        setSiteList(remoteSites);
        setSelectedSite((current) => remoteSites.find((site) => site.id === current?.id) || remoteSites[0] || null);
      setApiError('');
    })
    .catch((error) => {
      setApiError(error.message);
      setSiteList(sites);
      setSelectedSite((current) => current || sites[0] || null);
    })
    .finally(() => setApiLoading(false));
  };

  useEffect(() => {
    void retryFetchSites();
  }, []);

  return (
    <UiLanguageContext.Provider value={appLanguage.id}>
    <SafeAreaProvider>
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ExpoStatusBar style={screen === 'detail' ? 'light' : 'dark'} />
      {!!(apiLoading || apiError) && <ApiStatusBanner loading={apiLoading} error={apiError} apiUrl={apiBaseUrl} onRetry={retryFetchSites} />}
      {screen === 'detail' && selectedSite ? (
        <DetailScreen
          site={selectedSite}
          sites={siteList}
          language={audioLanguage}
          playing={playing}
          audioLoading={audioLoading}
          audioError={audioError}
          elapsed={elapsed}
          duration={audioStatus.duration || durationSeconds(selectedSite?.duration || '00:00')}
          isSaved={savedIds.includes(selectedSite.id)}
          onBack={() => { setScreen('main'); audioPlayer.pause(); }}
          onPlay={playSelectedAudio}
          onSeek={seekSelectedAudio}
          onSave={() => toggleSaved(selectedSite)}
          onLanguage={() => openLanguagePicker('audio')}
          onOpenSite={openDetail}
        />
      ) : (
        <>
          {activeTab === 'home' && (
            <HomeScreen
              language={appLanguage}
              sites={siteList}
              savedIds={savedIds}
              onLanguage={() => openLanguagePicker('app')}
              onSearch={() => { setActiveTab('explore'); setScreen('main'); }}
              onOpenSite={openDetail}
              onSave={toggleSaved}
              onMap={() => selectTab('map')}
              onSeeAll={() => selectTab('explore')}
              onNearby={findNearby}
            />
          )}
          {activeTab === 'explore' && (
            <ExploreScreen
              language={appLanguage}
              search={search}
              setSearch={setSearch}
              category={category}
              setCategory={setCategory}
              sites={filteredSites}
              savedIds={savedIds}
              onLanguage={() => openLanguagePicker('app')}
              onOpenSite={openDetail}
              onSave={toggleSaved}
            />
          )}
          {activeTab === 'map' && (
            <MapScreen
              language={appLanguage}
              audioLanguage={audioLanguage}
              sites={siteList}
              onLanguage={() => openLanguagePicker('app')}
              onAudioLanguage={() => openLanguagePicker('audio')}
              onOpenSite={openDetail}
              onSimulateArrival={simulateArrival}
              mapAudioSiteId={mapAudioSiteId}
              mapAudioPending={pendingAutoPlaySiteId === selectedSite?.id}
              mapAudioPlaying={playing}
              mapAudioLoading={audioLoading}
              mapAudioError={audioError}
              mapAudioElapsed={elapsed}
              mapAudioDuration={audioStatus.duration}
              onToggleMapAudio={playMapAudio}
            />
          )}
          {activeTab === 'saved' && (
            <SavedScreen
              language={appLanguage}
              savedSites={siteList.filter((site) => savedIds.includes(site.id))}
              onLanguage={() => openLanguagePicker('app')}
              onOpenSite={openDetail}
              onSave={toggleSaved}
              onExplore={() => selectTab('explore')}
            />
          )}
          {activeTab === 'profile' && (
            <ProfileScreen
              language={appLanguage}
              autoPlay={autoPlay}
              savedCount={savedIds.length}
              setAutoPlay={setAutoPlay}
              onLanguage={() => openLanguagePicker('app')}
              audioLanguage={audioLanguage}
              onAudioLanguage={() => openLanguagePicker('audio')}
              onNotify={showToast}
            />
          )}
          {autoPlay && screen === 'main' && activeTab !== 'map' && (
            <View style={styles.globalMiniPlayer}>
              <View style={[styles.miniPlayerProgress, { width: `${Math.min(100, audioStatus.duration ? (elapsed / audioStatus.duration) * 100 : 0)}%` }]} />
              <Pressable style={styles.miniPlayerContent} onPress={() => setScreen('detail')}>
                <View style={styles.miniPlayerIcon}><Headphones size={16} color="#fff" /></View>
                <View style={styles.miniPlayerInfo}>
                  <Text style={styles.miniPlayerEyebrow}>{playing ? `ĐANG PHÁT · ${formatDuration(elapsed)}` : 'THUYẾT MINH OUTDOOR'}</Text>
                  <Text numberOfLines={1} style={styles.miniPlayerTitle}>{selectedSite?.name || 'Chọn di tích để nghe'}</Text>
                </View>
                <Pressable style={styles.miniPlayerBtn} onPress={(event) => { event.stopPropagation(); playSelectedAudio(); }}>
                  {playing ? <Pause size={15} color={ink} fill={ink} /> : <Play size={15} color={ink} fill={ink} />}
                </Pressable>
              </Pressable>
            </View>
          )}
          <BottomTabs activeTab={activeTab} onChange={selectTab} />
        </>
      )}

      <LanguagePicker
        visible={languagePicker}
        selected={(languagePickerMode === 'audio' ? audioLanguage : appLanguage).id}
        mode={languagePickerMode}
        onClose={() => setLanguagePicker(false)}
        onSelect={(item) => {
          if (languagePickerMode === 'audio') {
            if (item.id !== audioLanguage.id
              && activeTab === 'map' && mapAudioSiteId === selectedSite?.id
              && audioStatus.playing) {
              setPendingAutoPlaySiteId(selectedSite.id);
            }
            setAudioLanguage(item);
          } else setAppLanguage(item);
          setLanguagePicker(false);
        }}
      />
      {!!toast && <View style={styles.toast}><Check size={15} color="#fff" /><Text style={styles.toastText}>{toast}</Text></View>}
    </SafeAreaView>
    </SafeAreaProvider>
    </UiLanguageContext.Provider>
  );
}

function AppHeader({ language, onLanguage, title, subtitle, dark = false }) {
  return (
    <View style={[styles.appHeader, dark && styles.headerOnDark]}>
      <View style={styles.headerTitles}>
        {title ? <Text style={[styles.headerTitle, dark && styles.textWhite]}>{title}</Text> : (
          <View style={styles.wordmarkRow}>
            <View style={styles.wordmarkIcon}><MapPin size={15} color="#fff" fill="#fff" /></View>
            <Text style={[styles.wordmark, dark && styles.textWhite]}>DI TÍCH <Text style={styles.wordmarkAccent}>Q1</Text></Text>
          </View>
        )}
        {!!subtitle && <Text style={[styles.headerSubtitle, dark && styles.headerSubtitleDark]}>{subtitle}</Text>}
      </View>
      <View style={styles.headerActions}>
        <Pressable style={[styles.languageButton, dark && styles.languageButtonDark]} onPress={onLanguage}>
          <Text style={styles.languageFlag}>{language.flag}</Text><Text style={[styles.languageCode, dark && styles.textWhite]}>{language.id.toUpperCase()}</Text><ChevronDown size={12} color={dark ? '#fff' : ink} />
        </Pressable>
      </View>
    </View>
  );
}

function ApiStatusBanner({ loading, error, apiUrl, onRetry }) {
  return (
    <View style={[styles.apiStatusBanner, !!error && styles.apiStatusError]}>
      <View style={styles.apiStatusCopy}>
        {loading && <ActivityIndicator size="small" color={error ? '#fff' : accent} />}
        <Text style={styles.apiStatusText} numberOfLines={2}>
          {loading ? `Đang tải dữ liệu từ BE (${apiUrl})...` : error}
        </Text>
      </View>
      {!!error && <Pressable onPress={onRetry} style={styles.apiRetryButton}><Text style={styles.apiRetryText}>Thử lại</Text></Pressable>}
    </View>
  );
}

function HomeScreen({ language, sites: siteList, savedIds, onLanguage, onSearch, onOpenSite, onSave, onMap, onSeeAll, onNearby }) {
  const [slide, setSlide] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const carouselRef = useRef(null);
  const carouselDrag = useMouseDragScroll();
  const nearbyDrag = useMouseDragScroll();
  const featured = siteList.slice(0, 3);

  useEffect(() => {
    if (!carouselWidth || !featured.length) return undefined;
    const timer = setInterval(() => {
      const nextSlide = (slide + 1) % featured.length;
      setSlide(nextSlide);
      carouselRef.current?.scrollTo({ x: nextSlide * carouselWidth, animated: true });
    }, 3000);

    return () => clearInterval(timer);
  }, [carouselWidth, featured.length, slide]);

  const onSwipeEnd = (event) => {
    if (!carouselWidth) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    setSlide(next);
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>
      <AppHeader language={language} onLanguage={onLanguage} />
      <View style={styles.homeGreeting}>
        <View><Text style={styles.greetingKicker}>{todayLabel(language.id)}</Text><Text style={styles.greetingTitle}>Chào buổi sáng <Text style={styles.wave}>☀️</Text></Text><Text style={styles.greetingSub}>Hôm nay mình cùng khám phá nhé.</Text></View>
        <Pressable style={styles.avatarButton} onPress={() => {}}><Text style={styles.avatarInitial}>Q1</Text><View style={styles.onlineDot} /></Pressable>
      </View>
      <Pressable style={styles.searchLauncher} onPress={onSearch}>
        <Search size={18} color="#99928D" /><Text style={styles.searchPlaceholder}>Bạn muốn khám phá nơi nào?</Text><View style={styles.searchTuning}><SlidersHorizontal size={15} color="#736E69" /></View>
      </Pressable>

      <View style={styles.sectionHeading}>
        <View><View style={styles.sectionEyebrow}><Sparkles size={12} color={accent} /><Text style={styles.sectionEyebrowText}>CHẠM VÀO LỊCH SỬ</Text></View><Text style={styles.sectionTitle}>Dạo quanh Quận 1</Text></View>
        <Pressable onPress={onSeeAll} style={styles.seeAll}><Text style={styles.seeAllText}>Tất cả</Text><ArrowRight size={14} color={accent} /></Pressable>
      </View>
      {!!featured.length && <View
        style={styles.featuredCarouselViewport}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          setCarouselWidth((current) => current === nextWidth ? current : nextWidth);
        }}
      >
        <ScrollView
          ref={carouselRef}
          {...carouselDrag}
          style={styles.featuredCarouselScroll}
          horizontal
          pagingEnabled
          snapToInterval={carouselWidth || undefined}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.heroCarousel}
          onMomentumScrollEnd={onSwipeEnd}
        >
          {featured.map((site, index) => (
            <FeaturedCard
              key={site.id}
              site={site}
              index={index}
              width={carouselWidth}
              saved={savedIds.includes(site.id)}
              onOpen={() => onOpenSite(site)}
              onSave={() => onSave(site)}
            />
          ))}
        </ScrollView>
      </View>}
      {!!featured.length && <View style={styles.carouselMeta}>
        <View style={styles.carouselDots}>{featured.map((item, index) => <View key={item.id} style={[styles.carouselDot, slide === index && styles.carouselDotActive]} />)}</View>
        <Text style={styles.carouselCounter}>0{slide + 1}<Text style={styles.counterMuted}> / 0{featured.length}</Text></Text>
      </View>}
      
      {!featured.length && <View style={styles.noSitesCard}><Text style={styles.noSitesText}>Chưa có di tích phù hợp trong dữ liệu từ BE.</Text></View>}

      {/* --- BẮT ĐẦU PHẦN THÊM MỚI: TOUR ĐI BỘ --- */}
      <View style={styles.sectionHeading}>
        <View>
          <View style={styles.sectionEyebrow}>
            <MapPin size={12} color={accent} />
            <Text style={styles.sectionEyebrowText}>SELF-GUIDED WALKING TOUR</Text>
          </View>
          <Text style={styles.sectionTitle}>Trải nghiệm 1 ngày Quận 1</Text>
          <Text style={styles.sectionSub}>Tuyến đường đi bộ kèm thuyết minh vỉa hè</Text>
        </View>
      </View>

      <Pressable style={styles.tourCard} onPress={() => onMap()}>
        <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b' }} style={styles.tourImage} imageStyle={{ borderRadius: 14 }}>
          <LinearGradient colors={['#00000000', '#000000E6']} style={StyleSheet.absoluteFill} borderRadius={14} />
          <View style={styles.tourContent}>
            <View style={styles.tourTag}>
              <Headphones size={11} color="#fff" />
              <Text style={styles.tourTagText}>Audio Outdoor tự động</Text>
            </View>
            <Text style={styles.tourTitle}>Tinh hoa Sài Gòn</Text>
            <Text style={styles.tourRoute}>Chợ Bến Thành ➔ Dinh Độc Lập ➔ Nhà thờ Đức Bà ➔ Bưu điện ➔ Nhà hát</Text>
          </View>
        </ImageBackground>
      </Pressable>
      {/* --- KẾT THÚC PHẦN THÊM MỚI --- */}

      <View style={styles.sectionHeading}>
        <View><Text style={styles.sectionTitle}>Điểm đến quanh bạn</Text><Text style={styles.sectionSub}>Những câu chuyện chỉ cách bạn vài bước chân</Text></View>
</View> 
      
      <ScrollView {...nearbyDrag} horizontal showsHorizontalScrollIndicator={false} onWheel={Platform.OS === 'web' ? scrollHorizontallyWithWheel : undefined} contentContainerStyle={styles.horizontalCards}>
        {siteList.slice(1, 5).map((site) => <MiniPlaceCard key={site.id} site={site} onPress={() => onOpenSite(site)} />)}
      </ScrollView>

      <View style={styles.nearbyBanner}>
        <LinearGradient colors={['#252521', '#3D352E', '#644C39']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.nearbyBannerCopy}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>THUYẾT MINH TỰ ĐỘNG
              </Text></View><Text style={styles.nearbyCopy}>Bật vị trí để tìm di tích gần nhất.</Text><Pressable style={styles.nearbyButton} onPress={onNearby}><LocateFixed size={14} color="#fff" /><Text style={styles.nearbyButtonText}>Tìm quanh đây</Text></Pressable></View>
        <View style={styles.nearbyIllustration}><View style={styles.glowCircle} /><BuildingIllustration color="#C9A37B" /></View>
      </View>
      <View style={styles.homeFooter}><ShieldMark /><Text>Khám phá di sản · Lắng nghe câu chuyện</Text></View>
    </ScrollView>
  );
}

function FeaturedCard({ site, index, width, saved, onOpen, onSave }) {
  const palettes = [['#312723', '#91654B', '#E2B78B'], ['#243135', '#617A70', '#B6C1A7'], ['#32302B', '#88735D', '#D3B58F']];
  const colors = palettes[index % palettes.length];
  return (
    <Pressable onPress={onOpen} style={[styles.featuredCard, { width }]}>
      <ImageBackground source={site.image ? { uri: site.image } : null} resizeMode="cover" style={StyleSheet.absoluteFill} imageStyle={styles.featuredImage}>
        <LinearGradient colors={['#15141218', '#17151400', '#151412E8']} locations={[0, 0.36, 1]} style={StyleSheet.absoluteFill} />
      </ImageBackground>
      <View style={styles.photoTint}><LinearGradient colors={[`${colors[0]}88`, `${colors[1]}66`, `${colors[2]}22`]} style={StyleSheet.absoluteFill} /><BuildingIllustration color={colors[2]} large /></View>
      <View style={styles.featuredTop}><View style={styles.featuredTag}><Sparkles size={11} color="#fff" /><Text style={styles.featuredTagText}>NỔI BẬT</Text></View><Pressable style={styles.favoriteButton} onPress={(event) => { event.stopPropagation(); onSave(); }}><Heart size={17} color="#fff" fill={saved ? '#F04D2E' : 'transparent'} /></Pressable></View>
      <View style={styles.featuredBottom}>
        <View style={styles.distancePill}><Navigation size={11} color="#fff" /><Text style={styles.distancePillText}>{site.distance}</Text><Text style={styles.distanceDivider}>·</Text><Text style={styles.distancePillText}>{site.category}</Text></View>
        <Text numberOfLines={1} style={styles.featuredTitle}>{site.name}</Text>
        <Text numberOfLines={1} style={styles.featuredDescription}>{site.tagline}</Text>
        <View style={styles.featuredActions}>
          <Pressable style={styles.featuredListen} onPress={onOpen}>
            <Play size={13} color="#fff" fill="#fff" />
            <Text style={styles.featuredListenText}>Nghe thuyết minh
            </Text>
            </Pressable>
            <View style={styles.featuredDuration}><Clock3 size={12} color="#fff" />
            <Text style={styles.featuredDurationText}>{site.duration}
              </Text></View>
              <View style={styles.featuredArrow}><ArrowRight size={17} color="#fff" />
              </View></View>
      </View>
    </Pressable>
  );
}

function BuildingIllustration({ color = '#C9A37B', large = false }) {
  return (
    <View style={[styles.buildingArt, large && styles.buildingArtLarge]} pointerEvents="none">
      <View style={[styles.artDome, { borderColor: color }]} />
      <View style={[styles.artRoof, { backgroundColor: color }]} />
      <View style={[styles.artFacade, { borderColor: `${color}AA` }]}>
        {[0, 1, 2, 3, 4].map((item) => <View key={item} style={[styles.artColumn, { backgroundColor: `${color}B0` }]}><View style={styles.artWindow} /></View>)}
      </View>
      <View style={[styles.artBase, { backgroundColor: color }]} />
    </View>
  );
}

function QuickAction({ icon: Icon, label, tone, onPress }) {
  return <Pressable style={styles.quickAction} onPress={onPress}><View style={[styles.quickIcon, styles[`quickIcon_${tone}`]]}><Icon size={18} color={styles[`quickColor_${tone}`].color} /></View><Text style={styles.quickLabel}>{label}</Text></Pressable>;
}

function MiniPlaceCard({ site, onPress }) {
  const paint = Array.isArray(site.paint) && site.paint.length >= 3
    ? site.paint
    : ['#312723', '#91654B', '#E2B78B'];
  return <Pressable style={styles.miniPlaceCard} onPress={onPress}><View style={[styles.miniArtwork, { backgroundColor: paint[0] }]}><LinearGradient colors={paint} style={StyleSheet.absoluteFill} /><BuildingIllustration color={paint[2]} /><View style={styles.miniDistance}><Navigation size={9} color="#fff" /><Text style={styles.miniDistanceText}>{site.distance || 'Quận 1'}</Text></View></View><View style={styles.miniPlaceInfo}><Text numberOfLines={1} style={styles.miniPlaceTitle}>{site.name}</Text><Text style={styles.miniPlaceCategory}>{site.category || 'Điểm tham quan'}</Text><View style={styles.miniAudio}><Headphones size={11} color={accent} /><Text>{site.duration ? `${site.duration} thuyết minh` : 'Thuyết minh'}</Text></View></View></Pressable>;
}

function ExploreScreen({ language, search, setSearch, category, setCategory, sites: list, savedIds, onLanguage, onOpenSite, onSave }) {
  const categoryDrag = useMouseDragScroll();
  const categories = ['Tất cả', 'Lịch sử', 'Kiến trúc', 'Bảo tàng', 'Văn hóa'];
  return <View style={styles.fill}>
    <AppHeader language={language} onLanguage={onLanguage} title="Khám phá" subtitle="Mỗi góc phố, một câu chuyện." />
    <View style={styles.exploreSearch}><Search size={17} color={muted} /><LocalizedTextInput value={search} onChangeText={setSearch} placeholder="Tìm di tích, đường phố..." placeholderTextColor="#aaa39d" style={styles.exploreInput} returnKeyType="search" /><Pressable style={styles.filterButton} onPress={() => setCategory(category === 'Tất cả' ? 'Lịch sử' : 'Tất cả')}><SlidersHorizontal size={17} color={ink} /></Pressable></View>
    <ScrollView {...categoryDrag} horizontal showsHorizontalScrollIndicator={false} onWheel={Platform.OS === 'web' ? scrollHorizontallyWithWheel : undefined} contentContainerStyle={styles.categoryChips}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, category === item && styles.categoryChipActive]}><Text style={[styles.categoryChipText, category === item && styles.categoryChipTextActive]}>{item}</Text></Pressable>)}</ScrollView>
    <View style={styles.exploreResults}><Text style={styles.resultCount}>{list.length} ĐIỂM THAM QUAN</Text><View style={styles.nearbyStatus}><View style={styles.liveDotSmall} /><Text>GẦN BẠN</Text></View></View>
    <ScrollView style={styles.exploreList} contentContainerStyle={styles.exploreListContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>
      {list.map((site, index) => <ExploreCard key={site.id} site={site} index={index} saved={savedIds.includes(site.id)} onPress={() => onOpenSite(site)} onSave={() => onSave(site)} />)}
      {!list.length && <View style={styles.emptyState}><Search size={26} color="#c1bbb5" /><Text style={styles.emptyTitle}>Chưa tìm thấy di tích</Text><Text style={styles.emptyCopy}>Thử một từ khóa khác hoặc chọn danh mục khác.</Text></View>}
    </ScrollView>
  </View>;
}

function ExploreCard({ site, index, saved, onPress, onSave }) {
  if (!site) return null;

  // 1. Kiểm tra mảng màu thật chặt chẽ (Phải là mảng và có ít nhất 2 màu)
  let safePaint = ['#F04D2E', '#E04124', '#C9361C'];
  if (Array.isArray(site.paint) && site.paint.length >= 2 && site.paint[0]) {
      safePaint = site.paint;
  }

  // 2. Kiểm tra mảng ngôn ngữ
  let safeLangs = ['vi'];
  if (Array.isArray(site.languages) && site.languages.length > 0) {
      safeLangs = site.languages;
  }

  // 3. Đóng gói dữ liệu an toàn
  const safeSite = {
    ...site,
    name: site.name || 'Đang cập nhật',
    category: site.category || 'DI TÍCH',
    address: site.address || 'Quận 1, TP. HCM',
    distance: site.distance || 'Gần bạn',
    duration: site.duration || '15 phút',
    paint: safePaint,
    languages: safeLangs
  };

  return (
    <Pressable onPress={onPress} style={styles.exploreCard}>
      <View style={[styles.exploreArtwork, { backgroundColor: safeSite.paint[0] }]}>
        {/* Điểm chết đã được bọc an toàn tuyệt đối */}
        <LinearGradient colors={safeSite.paint} style={StyleSheet.absoluteFill} />
        <BuildingIllustration color={safeSite.paint[2] || '#ffffff'} />
        <Text style={styles.artNumber}>0{index + 1}</Text>
      </View>
      
      <View style={styles.exploreCardInfo}>
        <View style={styles.exploreCardTop}>
          <Text style={styles.exploreCategory}>{safeSite.category}</Text>
          <Pressable hitSlop={12} onPress={(event) => { event.stopPropagation(); onSave(); }}>
            <Heart size={17} color={saved ? accent : '#aaa39d'} fill={saved ? accent : 'transparent'} />
          </Pressable>
        </View>
        
        <Text numberOfLines={1} style={styles.explorePlaceName}>{safeSite.name}</Text>
        
        <View style={styles.exploreAddress}>
          <MapPin size={11} color={muted} />
          <Text numberOfLines={1} style={styles.exploreAddressText}>{safeSite.address}</Text>
          <Text style={styles.dotSep}>·</Text>
          <Text style={styles.exploreDistance}>{safeSite.distance}</Text>
        </View>
        
        <View style={styles.exploreCardBottom}>
          <View style={styles.langFlags}>
            {safeSite.languages.slice(0, 3).map((code) => (
              <Text key={code} style={styles.langFlag}>
                {/* Lấy cờ từ danh sách languages (đảm bảo file heritage.js đã có cờ) */}
                {(languages && languages.find((item) => item.id === code)?.flag) || '🌐'}
              </Text>
            ))}
          </View>
          <View style={styles.exploreDuration}>
            <Headphones size={11} color={accent} />
            <Text>{safeSite.duration}</Text>
          </View>
          <ChevronRight size={16} color="#B1AAA4" />
        </View>
      </View>
    </Pressable>
  );
}

function DetailScreen({ site, sites: siteList, language, playing, audioLoading, audioError, elapsed, duration, isSaved, onBack, onPlay, onSeek, onSave, onLanguage, onOpenSite }) {
  if (!site) return null;
  site = {
        ...site,
        color: site.color || '#F04D2E',
        // Thêm mảng màu paint mặc định để UI không bị sập
        paint: site.paint || ['#312723', '#91654B', '#E2B78B'], 
        image: site.image || 'https://images.unsplash.com/photo-1583417311718-c9c049e3c907?w=500',
        // Thêm các thông tin cơ bản phòng khi BE chưa trả về
        category: site.category || 'Di tích lịch sử',
        distance: site.distance || 'Đang cập nhật',
        address: site.address || 'Quận 1, TP. Hồ Chí Minh',
        story: site.story || 'Nội dung thuyết minh đang được cập nhật...'
    };
  const recommendationsDrag = useMouseDragScroll();
  const progress = `${Math.min(100, duration ? (elapsed / duration) * 100 : 0)}%`;
  return <View style={styles.detailRoot}>
    <ScrollView showsVerticalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.detailScroll}>
      <View style={[styles.detailHero, { backgroundColor: site.paint[0] }]}>
        <ImageBackground source={{ uri: site.image }} style={StyleSheet.absoluteFill} imageStyle={styles.detailImage}>
          <LinearGradient colors={[`${site.paint[0]}55`, `${site.paint[1]}75`, `${site.paint[0]}F0`]} style={StyleSheet.absoluteFill} />
        </ImageBackground>
        <BuildingIllustration color={site.paint[2]} large />
        <View style={styles.detailTopBar}><Pressable style={styles.detailRound} onPress={onBack}><ArrowLeft size={19} color="#fff" /></Pressable><View style={styles.detailTopActions}><Pressable style={styles.detailRound} onPress={onSave}><Bookmark size={17} color="#fff" fill={isSaved ? '#fff' : 'transparent'} /></Pressable><Pressable style={styles.detailRound} onPress={() => {}}><MoreHorizontal size={19} color="#fff" /></Pressable></View></View>
        <View style={styles.detailHeroBottom}><View style={styles.featuredTag}><Sparkles size={11} color="#fff" /><Text style={styles.featuredTagText}>{site.category.toUpperCase()}</Text></View><Text style={styles.detailHeroTitle}>{site.name}</Text><View style={styles.detailHeroAddress}><MapPin size={13} color="#eee" /><Text style={styles.detailHeroAddressText}>{site.address} · {site.distance}</Text></View></View>
      </View>
      <View style={styles.detailContent}>
        <View style={styles.detailAudioCard}>
          <View style={styles.audioCardTop}><View style={styles.audioLangRow}><View style={styles.audioLangIcon}><Text>{language.flag}</Text></View><View><Text style={styles.audioLangName}>{language.name}</Text><Text style={styles.audioVoice}>{voiceLabel(language.id)}</Text></View></View><Pressable style={styles.audioChangeLang} onPress={onLanguage}><Languages size={15} color="#756E68" /><ChevronDown size={12} color="#756E68" /></Pressable></View>
          <View style={styles.audioTrack}><View style={styles.audioTimeRow}><Text style={styles.audioTimeCurrent}>{formatDuration(elapsed)}</Text><Text style={styles.audioTimeText}>{duration > 0 ? formatDuration(duration) : '--:--'}</Text></View><View style={styles.audioProgress}><View style={[styles.audioProgressFill, { width: progress }]} /><View style={[styles.audioKnob, { left: progress }]} /></View></View>
          <View style={styles.audioControlRow}><Pressable style={styles.skipButton} onPress={() => onSeek(-15)} accessibilityLabel="Lùi 15 giây"><RotateCcw size={15} color="#77716A" /></Pressable><Pressable style={styles.largePlay} onPress={onPlay}>{audioLoading ? <ActivityIndicator size="small" color="#fff" /> : playing ? <Pause size={20} color="#fff" fill="#fff" /> : <Play size={20} color="#fff" fill="#fff" />}</Pressable><Pressable style={styles.skipButton} onPress={() => onSeek(15)} accessibilityLabel="Tiến 15 giây"><RotateCw size={15} color="#77716A" /></Pressable><View style={styles.speedPill}><Text>1x</Text></View></View>
          {!!audioError && <Text style={styles.audioPlaybackError}>{audioError}</Text>}
        </View>
        <View style={styles.detailStoryHeader}><View><Text style={styles.storyEyebrow}>CÂU CHUYỆN DI SẢN</Text><Text style={styles.storyTitle}>Lắng nghe lịch sử</Text></View><Pressable style={styles.shareButton} onPress={() => {}}><Share2 size={16} color="#6E6964" /></Pressable></View>
        <Text style={styles.storyText}>{site.story}</Text>
        <View style={styles.factStrip}><View style={styles.factIcon}><Clock3 size={16} color={accent} /></View><View style={styles.factCopy}><Text style={styles.factLabel}>THỜI GIAN THAM QUAN</Text><Text style={styles.factValue}>Khoảng 15 – 30 phút</Text></View><ChevronRight size={16} color="#a7a09a" /></View>
        <View style={styles.locationCard}><View style={styles.locationMapArt}><View style={styles.mapStreetLine} /><View style={styles.mapBlockA} /><View style={styles.mapBlockB} /><View style={styles.locationPin}><MapPin size={17} color="#fff" fill={accent} /></View></View><View style={styles.locationText}><View><Text style={styles.storyEyebrow}>VỊ TRÍ DI TÍCH</Text><Text style={styles.locationAddress}>{site.address}</Text><Text style={styles.locationDistrict}>Quận 1, TP. Hồ Chí Minh</Text></View><Pressable style={styles.navigateButton} onPress={() => {}}><Navigation size={15} color="#fff" /></Pressable></View></View>
        <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Nghe tiếp hành trình</Text><Text style={styles.sectionSub}>Những điểm gần đây</Text></View></View>
        <ScrollView {...recommendationsDrag} horizontal showsHorizontalScrollIndicator={false} onWheel={Platform.OS === 'web' ? scrollHorizontallyWithWheel : undefined} contentContainerStyle={styles.horizontalCards}>{siteList.filter((item) => item.id !== site.id).slice(0, 4).map((item) => <MiniPlaceCard key={item.id} site={item} onPress={() => onOpenSite(item)} />)}</ScrollView>
        <View style={{ height: 20 }} />
      </View>
    </ScrollView>
    <View style={styles.detailSticky}><View style={styles.stickyStatus}><View style={styles.liveDotSmall} /><Text>{playing ? `ĐANG PHÁT · ${formatDuration(elapsed)}` : 'THUYẾT MINH ĐANG SẴN SÀNG'}</Text></View><Pressable style={styles.stickyPlay} onPress={onPlay}>{playing ? <Pause size={16} color="#fff" fill="#fff" /> : <Play size={16} color="#fff" fill="#fff" />}<Text>{playing ? 'Tạm dừng' : 'Bắt đầu nghe'}</Text><ArrowRight size={16} color="#fff" /></Pressable></View>
  </View>;
}

function MapScreen({
  language,
  audioLanguage,
  sites: siteList,
  onLanguage,
  onAudioLanguage,
  onOpenSite,
  onSimulateArrival,
  mapAudioSiteId,
  mapAudioPending,
  mapAudioPlaying,
  mapAudioLoading,
  mapAudioError,
  mapAudioElapsed,
  mapAudioDuration,
  onToggleMapAudio,
}) {
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [locating, setLocating] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [simulationLocation, setSimulationLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [routeInfo, setRouteInfo] = useState(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [simulationInfo, setSimulationInfo] = useState(null);
  const mapRef = useRef(null);
  const simulationRouteCacheRef = useRef({});
  const realUserLocationRef = useRef(null);
  const autoLocateStarted = useRef(false);
  const firstMappedSite = siteList.find((site) => site.latitude != null && site.longitude != null);

  const getCurrentLocation = async () => {
    const permissionResult = await Location.requestForegroundPermissionsAsync();
    if (permissionResult.status !== 'granted') {
      throw new Error('Vị trí đang bị chặn. Hãy bật quyền vị trí cho ứng dụng hoặc trang web rồi thử lại.');
    }
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, accuracy } = location.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error('Thiết bị trả về tọa độ GPS không hợp lệ.');
    }
    return { latitude, longitude, accuracy };
  };

  const handleLocateUser = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const location = await getCurrentLocation();
      realUserLocationRef.current = location;
      setUserLocation(location);
      mapRef.current?.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }, 700);
    } catch (error) {
      console.error('Không thể xác định vị trí hiện tại:', error);
      setLocationError(translateUiText(error.message, language.id));
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (autoLocateStarted.current) return;
    autoLocateStarted.current = true;
    void handleLocateUser();
  }, []);

  // 1. Xử lý gõ tìm kiếm và hiển thị danh sách gợi ý
  const handleSearch = (text) => {
    setSearchQuery(text);
    const query = normalizeSearchText(text);
    if (!query) {
      setSearchResults([]);
    } else {
      const results = siteList.filter((site) => {
        const searchableText = normalizeSearchText(
          [site.name, site.address, site.category].filter(Boolean).join(' ')
        );
        return searchableText.includes(query);
      });
      setSearchResults(results);
    }
  };

  // 2. Xử lý khi người dùng bấm chọn 1 kết quả tìm kiếm
  const handleSelectResult = (site) => {
    setRouteInfo(null);
    setRouteError('');
    setSimulationInfo(null);
    setSimulationLocation(null);
    setSelected(site);       // Chọn di tích đó
    setSearchQuery('');      // Xóa chữ đang gõ
    setSearchResults([]);
  };

  const handleSelectSite = (site) => {
    setRouteInfo(null);
    setRouteError('');
    setSimulationInfo(null);
    setSimulationLocation(null);
    setSelected(site);    // Ẩn danh sách gợi ý
  };

  const simulateWalkToSite = async () => {
    if (!selected) return;
    setRouting(true);
    setRouteError('');
    setRouteInfo(null);
    setSimulationInfo(null);
    setSimulationLocation(null);
    try {
      const destination = {
        latitude: Number(selected.latitude),
        longitude: Number(selected.longitude),
      };
      const radiusMeters = Number(selected.radius ?? 100);
      const findRouteApproachToSite = (coordinates) => {
        if (!coordinates || coordinates.length < 2) return null;

        const distanceToSite = ([longitude, latitude]) => calculateDistance(
          latitude,
          longitude,
          destination.latitude,
          destination.longitude
        );
        if (distanceToSite(coordinates[0]) <= radiusMeters) return null;
        let routeDistance = 0;
        let nearestApproach = null;

        for (let index = 1; index < coordinates.length; index += 1) {
          const previous = coordinates[index - 1];
          const current = coordinates[index];
          const segmentLength = calculateDistance(
            previous[1],
            previous[0],
            current[1],
            current[0]
          );
          const previousDistance = distanceToSite(previous);
          const currentDistance = distanceToSite(current);
          let lower = 0;
          let upper = 1;
          for (let iteration = 0; iteration < 20; iteration += 1) {
            const first = (2 * lower + upper) / 3;
            const second = (lower + 2 * upper) / 3;
            const firstPoint = [
              previous[0] + (current[0] - previous[0]) * first,
              previous[1] + (current[1] - previous[1]) * first,
            ];
            const secondPoint = [
              previous[0] + (current[0] - previous[0]) * second,
              previous[1] + (current[1] - previous[1]) * second,
            ];
            if (distanceToSite(firstPoint) < distanceToSite(secondPoint)) upper = second;
            else lower = first;
          }
          const closestFraction = (lower + upper) / 2;
          const closestPoint = [
            previous[0] + (current[0] - previous[0]) * closestFraction,
            previous[1] + (current[1] - previous[1]) * closestFraction,
          ];
          const closestDistance = distanceToSite(closestPoint);

          if (!nearestApproach || closestDistance < nearestApproach.distanceToSite) {
            const distanceAlongSegment = segmentLength * closestFraction;
            nearestApproach = {
              coordinates: [...coordinates.slice(0, index), closestPoint],
              distance: routeDistance + distanceAlongSegment,
              distanceToSite: closestDistance,
              enteredGeofence: closestDistance <= radiusMeters,
            };
          }

          if (previousDistance > radiusMeters && closestDistance <= radiusMeters) {
            let outside = 0;
            let inside = closestFraction;
            for (let iteration = 0; iteration < 20; iteration += 1) {
              const fraction = (outside + inside) / 2;
              const point = [
                previous[0] + (current[0] - previous[0]) * fraction,
                previous[1] + (current[1] - previous[1]) * fraction,
              ];
              if (distanceToSite(point) > radiusMeters) outside = fraction;
              else inside = fraction;
            }
            const entryFraction = (outside + inside) / 2;
            const boundary = [
              previous[0] + (current[0] - previous[0]) * entryFraction,
              previous[1] + (current[1] - previous[1]) * entryFraction,
            ];
            return {
              coordinates: [...coordinates.slice(0, index), boundary],
              distance: routeDistance + segmentLength * entryFraction,
              distanceToSite: radiusMeters,
              enteredGeofence: true,
            };
          }

          routeDistance += segmentLength;
        }

        return nearestApproach;
      };
      const takeLastRouteDistance = (coordinates, distanceToKeep) => {
        let remainingDistance = distanceToKeep;
        for (let index = coordinates.length - 1; index > 0; index -= 1) {
          const previous = coordinates[index - 1];
          const current = coordinates[index];
          const segmentDistance = calculateDistance(
            previous[1],
            previous[0],
            current[1],
            current[0]
          );
          if (remainingDistance <= segmentDistance) {
            const startFraction = segmentDistance > 0
              ? 1 - remainingDistance / segmentDistance
              : 0;
            const start = [
              previous[0] + (current[0] - previous[0]) * startFraction,
              previous[1] + (current[1] - previous[1]) * startFraction,
            ];
            return [start, ...coordinates.slice(index)];
          }
          remainingDistance -= segmentDistance;
        }
        return coordinates;
      };
      const requestWalkingRoute = async (origin) => {
        const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        const response = await fetch(
          `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordinates}?overview=full&geometries=geojson&steps=true`
        );
        if (!response.ok) {
          throw new Error(`Máy chủ chỉ đường trả về lỗi HTTP ${response.status}.`);
        }
        const data = await response.json();
        const candidate = data.routes?.[0];
        return data.code === 'Ok' && candidate?.geometry?.coordinates?.length
          ? candidate
          : null;
      };
      const routeCacheKey = `${selected.id}:${destination.latitude}:${destination.longitude}:${radiusMeters}`;
      let route = simulationRouteCacheRef.current[routeCacheKey] || null;
      let successfulRouteRequests = 0;
      let lastRouteRequestError = null;
      let rateLimited = false;
      const routeSearchRadius = 150;
      const bearingSeed = selected.code || selected.id;
      const startBearing = bearingSeed.split('').reduce(
        (sum, character) => sum + character.charCodeAt(0), 0
      ) % 360;
      if (!route) {
        let nearestStreetRoute = null;
        let nearestStreetDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < 4; index += 1) {
          const bearing = (startBearing + index * 90) * (Math.PI / 180);
          const origin = {
            latitude: destination.latitude + (routeSearchRadius * Math.cos(bearing)) / 111320,
            longitude: destination.longitude + (routeSearchRadius * Math.sin(bearing))
              / (111320 * Math.cos(destination.latitude * (Math.PI / 180))),
          };
          let candidateRoute;
          try {
            candidateRoute = await requestWalkingRoute(origin);
            successfulRouteRequests += 1;
          } catch (error) {
            lastRouteRequestError = error;
            console.error('Không thể lấy một tuyến mô phỏng đi bộ:', error);
            if (error.message?.includes('HTTP 429')) {
              rateLimited = true;
              break;
            }
            continue;
          }
          if (!candidateRoute) continue;

          const approach = findRouteApproachToSite(candidateRoute.geometry.coordinates);
          if (!approach || approach.distance < 70
            || approach.distanceToSite > radiusMeters + 70) continue;

          const simulationDistance = Math.min(75, approach.distance);
          const candidate = {
            ...candidateRoute,
            distance: simulationDistance,
            duration: candidateRoute.duration * simulationDistance / candidateRoute.distance,
            enteredGeofence: approach.enteredGeofence,
            distanceToSite: approach.distanceToSite,
            geometry: {
              ...candidateRoute.geometry,
              coordinates: takeLastRouteDistance(approach.coordinates, simulationDistance),
            },
          };

          if (approach.enteredGeofence) {
            route = candidate;
            break;
          }
          if (approach.distanceToSite < nearestStreetDistance) {
            nearestStreetRoute = candidate;
            nearestStreetDistance = approach.distanceToSite;
          }
          if (index < 3) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!route) route = nearestStreetRoute;
      }

      if (!route) {
        if (successfulRouteRequests === 0 && lastRouteRequestError) {
          throw lastRouteRequestError;
        }
        if (rateLimited) {
          throw new Error('Máy chủ tìm đường đang quá tải. Hãy chờ một phút rồi thử lại.');
        }
        throw new Error('Không tìm được tuyến đi bộ thực tế dài khoảng 70-80 m đến vòng di tích này.');
      }
      simulationRouteCacheRef.current[routeCacheKey] = route;

      const coordinatesList = route.geometry.coordinates;
      const routeStart = {
        longitude: coordinatesList[0][0],
        latitude: coordinatesList[0][1],
      };
      const cumulativeDistances = [0];
      for (let index = 1; index < coordinatesList.length; index += 1) {
        cumulativeDistances.push(
          cumulativeDistances[index - 1]
            + calculateDistance(
              coordinatesList[index - 1][1],
              coordinatesList[index - 1][0],
              coordinatesList[index][1],
              coordinatesList[index][0]
            )
        );
      }
      const stepCount = Math.max(12, Math.min(24, Math.ceil(route.distance / 3)));
      setSimulationLocation({ ...routeStart, simulated: true });
      setRouteInfo({
        distance: formatRouteDistance(route.distance),
        duration: formatRouteDuration(route.duration),
        steps: [],
        coordinates: coordinatesList,
      });
      setSimulationInfo({
        site: selected,
        arrivalMessage: route.enteredGeofence
          ? 'Đang đi vào vòng di tích'
          : `Đang đi đến đường gần nhất · cách di tích khoảng ${Math.round(route.distanceToSite)} m`,
        coordinates: coordinatesList,
        cumulativeDistances,
        stepCount,
        step: 0,
        status: 'walking',
      });
    } catch (error) {
      console.error('Không thể bắt đầu mô phỏng đi bộ:', error);
      setRouteError(error.message || 'Không thể bắt đầu mô phỏng đi bộ.');
    } finally {
      setRouting(false);
    }
  };

  useEffect(() => {
    if (simulationInfo?.status !== 'walking') return undefined;
    const timer = setTimeout(() => {
      const nextStep = simulationInfo.step + 1;
      if (nextStep >= simulationInfo.stepCount) {
        const { site } = simulationInfo;
        const routeEnd = simulationInfo.coordinates[simulationInfo.coordinates.length - 1];
        setSimulationLocation({
          latitude: routeEnd[1],
          longitude: routeEnd[0],
          simulated: true,
        });
        setSimulationInfo((current) => current
          ? { ...current, step: current.stepCount, status: 'arrived' }
          : current);
        onSimulateArrival(site);
        return;
      }

      const totalDistance = simulationInfo.cumulativeDistances[
        simulationInfo.cumulativeDistances.length - 1
      ];
      const targetDistance = totalDistance * nextStep / (simulationInfo.stepCount - 1);
      let routeIndex = simulationInfo.cumulativeDistances.findIndex(
        (distance) => distance >= targetDistance
      ) - 1;
      routeIndex = Math.max(0, Math.min(routeIndex, simulationInfo.coordinates.length - 2));
      const segmentStart = simulationInfo.cumulativeDistances[routeIndex];
      const segmentEnd = simulationInfo.cumulativeDistances[routeIndex + 1];
      const segmentProgress = segmentEnd > segmentStart
        ? (targetDistance - segmentStart) / (segmentEnd - segmentStart)
        : 0;
      const startCoordinate = simulationInfo.coordinates[routeIndex];
      const endCoordinate = simulationInfo.coordinates[routeIndex + 1];
      const longitude = startCoordinate[0] + (endCoordinate[0] - startCoordinate[0]) * segmentProgress;
      const latitude = startCoordinate[1] + (endCoordinate[1] - startCoordinate[1]) * segmentProgress;
      setSimulationLocation({ latitude, longitude, simulated: true });
      setSimulationInfo((current) => current
        ? { ...current, step: nextStep }
        : current);
    }, 650);

    return () => clearTimeout(timer);
  }, [onSimulateArrival, simulationInfo]);

  const stopSimulation = () => {
    setSimulationInfo(null);
    setSimulationLocation(null);
    setRouteInfo(null);
  };

  // 3. Show directions inside the web map; open the maps app on native.
  const handleGetDirections = async () => {
    if (!selected || selected.latitude == null || selected.longitude == null
      || !Number.isFinite(Number(selected.latitude)) || !Number.isFinite(Number(selected.longitude))) {
      alert(translateUiText('Di tích này chưa được cập nhật tọa độ trên hệ thống.', language.id));
      return;
    }

    if (Platform.OS === 'web') {
      setRouting(true);
      setRouteError('');
      setRouteInfo(null);
      try {
        const origin = userLocation || await getCurrentLocation();
        if (!origin.simulated) realUserLocationRef.current = origin;
        setUserLocation(origin);
        const coordinates = `${origin.longitude},${origin.latitude};${selected.longitude},${selected.latitude}`;
        const response = await fetch(
          `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordinates}?overview=full&geometries=geojson&steps=true`
        );
        if (!response.ok) throw new Error(`Máy chủ chỉ đường trả về lỗi HTTP ${response.status}.`);
        const data = await response.json();
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) {
          throw new Error('Không tìm được tuyến đường đến di tích này.');
        }

        const steps = route.legs?.flatMap((leg) => leg.steps || [])
          .map((step) => ({
            instruction: describeRouteManeuver(step.maneuver, step.name),
            distance: formatRouteDistance(step.distance),
          }))
          .filter((step) => step.instruction) || [];
        const coordinatesList = route.geometry.coordinates;
        setRouteInfo({
          distance: formatRouteDistance(route.distance),
          duration: formatRouteDuration(route.duration),
          steps,
          coordinates: coordinatesList,
        });
      } catch (error) {
        console.error('Không thể tạo tuyến đường trong ứng dụng:', error);
        setRouteError(error.message || 'Không thể tải tuyến đường. Vui lòng thử lại.');
      } finally {
        setRouting(false);
      }
      return;
    }

    // Dùng scheme gốc của bản đồ: maps:// cho iOS và web Google Maps cho Android
    const url = Platform.OS === 'ios'
      ? `maps://?daddr=${selected.latitude},${selected.longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`;
    
    try {
      // Thử mở ứng dụng bản đồ gốc
      await Linking.openURL(url);
    } catch (error) {
      console.log("Không thể mở Apple Maps, đang chuyển sang Google Maps Web...");
      // Cơ chế dự phòng: Mở Google Maps trên trình duyệt Safari/Chrome
      const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`;
      Linking.openURL(fallbackUrl).catch(() => {
        alert(translateUiText('Không thể mở tính năng chỉ đường trên thiết bị của bạn.', language.id));
      });
    }
  };

  // 4. Tự động zoom và đưa bản đồ về vị trí được chọn
  useEffect(() => {
    if (selected && mapRef.current
      && selected.latitude != null && selected.longitude != null
      && Number.isFinite(Number(selected.latitude)) && Number.isFinite(Number(selected.longitude))) {
      mapRef.current.animateToRegion({
        latitude: selected.latitude,
        longitude: selected.longitude,
        latitudeDelta: 0.008, // Zoom gần hơn một chút
        longitudeDelta: 0.008,
      }, 1000);
    }
  }, [selected]);

  useEffect(() => {
    if (routeInfo?.coordinates?.length) {
      mapRef.current?.fitCoordinates(routeInfo.coordinates);
    }
  }, [routeInfo?.coordinates]);

  return (
    <View style={{ flex: 1, backgroundColor: '#E1E9DD' }}>
      <MapCanvas
        ref={mapRef}
        sites={siteList}
        selected={selected}
        userLocation={userLocation}
        simulationLocation={simulationLocation}
        routeCoordinates={routeInfo?.coordinates}
        onSelect={handleSelectSite}
        initialRegion={{
          latitude: firstMappedSite?.latitude ?? 10.7769,
          longitude: firstMappedSite?.longitude ?? 106.7009,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      />

      <View style={styles.realMapTopBar}>
        <View style={styles.realMapSearchBox}>
          <Search size={18} color="#999" />
          <LocalizedTextInput
            style={styles.realMapSearchInput}
            placeholder="Tìm Bến Nhà Rồng, Dinh Độc Lập..."
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery !== '' && (
            <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
              <X size={16} color="#999" />
            </Pressable>
          )}
          <View style={styles.mapSearchDivider} />
          <Pressable
            style={styles.mapSearchLocate}
            onPress={handleLocateUser}
            disabled={locating}
            accessibilityLabel="Đưa bản đồ đến vị trí hiện tại"
          >
            {locating
              ? <ActivityIndicator size="small" color="#4285F4" />
              : <LocateFixed size={19} color="#4285F4" />}
          </Pressable>
        </View>
        {!!userLocation && (
          <View style={styles.locationStatus}>
            <View style={styles.locationStatusDot} />
            <Text style={styles.locationStatusText}>
              {userLocation.simulated
                ? 'Đang mô phỏng di chuyển'
                : `Vị trí hiện tại${Number.isFinite(userLocation.accuracy) ? ` · ±${Math.round(userLocation.accuracy)} m` : ''}`}
            </Text>
          </View>
        )}
        {!!locationError && (
          <Pressable style={styles.locationError} onPress={() => setLocationError('')}>
            <Text style={styles.locationErrorText}>{locationError}</Text>
            <X size={15} color="#8D4938" />
          </Pressable>
        )}

        {/* DANH SÁCH KẾT QUẢ GỢI Ý XỔ XUỐNG */}
        {searchResults.length > 0 && (
          <ScrollView style={styles.searchDropdown} keyboardShouldPersistTaps="handled">
            {searchResults.map(site => (
              <Pressable key={site.id} style={styles.searchResultItem} onPress={() => handleSelectResult(site)}>
                <Text style={styles.searchResultText}>{site.name}</Text>
                <Text style={styles.searchResultSub}>{site.address}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {!!searchQuery.trim() && searchResults.length === 0 && (
          <View style={styles.searchDropdown}>
            <Text style={styles.searchEmptyText}>Không tìm thấy di tích phù hợp.</Text>
          </View>
        )}
      </View>

      {selected && !routeInfo && !mapAudioPending
        && (!simulationInfo || simulationInfo.status === 'arrived' && !mapAudioLoading)
        && mapAudioSiteId !== selected.id && (
        <View style={styles.realMapBottomCard}>
          <View style={styles.mapSelectedCard}>
            <View style={styles.mapSheetHandle} />
            <View style={styles.mapPlaceEyebrow}>
              <MapPin size={12} color="#4285F4" />
              <Text style={styles.mapPlaceEyebrowText}>ĐỊA ĐIỂM GẦN BẠN</Text>
            </View>
            <Pressable style={styles.mapSelectedMain} onPress={() => onOpenSite(selected)}>
              <View style={[styles.mapSelectedArtwork, { backgroundColor: selected.paint?.[0] || '#E8F0FE' }]}>
                <BuildingIllustration color={selected.paint?.[2] || '#ffffff'} />
              </View>
              <View style={styles.mapSelectedCopy}>
                <Text numberOfLines={1} style={styles.mapSelectedTitle}>{selected.name}</Text>
                <Text style={styles.mapSelectedAddress}>{selected.address}</Text>
              </View>
              <ChevronRight size={17} color="#aaa39d" />
            </Pressable>
            <View style={styles.mapActionRow}>
              <Pressable
                style={styles.directionButton}
                onPress={() => {
                  if (routeInfo) setRouteInfo(null);
                  else void handleGetDirections();
                }}
                disabled={routing}
              >
                {routing ? <ActivityIndicator size="small" color="#fff" /> : <Navigation size={13} color="#fff" />}
                <Text style={styles.mapSelectedActionText}>
                  {routing ? 'Đang tìm đường...' : routeInfo ? 'Đóng chỉ đường' : 'Chỉ đường'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.simulationButton}
                onPress={() => void simulateWalkToSite()}
                disabled={routing}
                accessibilityRole="button"
                accessibilityLabel={`Mô phỏng 70-80 m đến vòng ${selected.name} và phát audio`}
              >
                <Headphones size={13} color="#fff" />
                <Text style={styles.mapSelectedActionText}>{routing ? 'Đang tạo tuyến...' : 'Mô phỏng 70-80 m'}</Text>
              </Pressable>
            </View>
            {!!routeError && <Text style={styles.routeErrorText}>{routeError}</Text>}
            {!!mapAudioError && <Text style={styles.mapAudioError}>{mapAudioError}</Text>}
          </View>
        </View>
      )}
      {(!!routeInfo || simulationInfo?.status === 'walking') && simulationInfo?.status !== 'arrived' && (
        <View style={styles.routeFloatingCard}>
          <View style={styles.routeFloatingCopy}>
            <Text numberOfLines={1} style={styles.routeFloatingTitle}>
              {simulationInfo?.status === 'walking'
                ? `${simulationInfo.arrivalMessage} · ${routeInfo?.distance || ''}`
                : `Tuyến đi bộ · ${routeInfo.distance} · ${routeInfo.duration}`}
            </Text>
            {simulationInfo?.status === 'walking' && (
              <View style={styles.simulationProgressTrack}>
                <View style={[styles.simulationProgressFill, {
                  width: `${Math.min(100, Math.round((simulationInfo.step / simulationInfo.stepCount) * 100))}%`,
                }]} />
              </View>
            )}
            {!simulationInfo?.status && routeInfo.steps.slice(0, 2).map((step, index) => (
              <Text key={`${index}-${step.instruction}`} numberOfLines={1} style={styles.routeFloatingStep}>
                {step.instruction}{step.distance ? ` · ${step.distance}` : ''}
              </Text>
            ))}
          </View>
          <Pressable
            style={styles.routeFloatingButton}
            onPress={simulationInfo?.status === 'walking' ? stopSimulation : () => setRouteInfo(null)}
            accessibilityLabel={simulationInfo?.status === 'walking' ? 'Dừng mô phỏng' : 'Đóng tuyến đường'}
          >
            {simulationInfo?.status === 'walking' ? <X size={17} color="#674A38" /> : <X size={17} color="#674A38" />}
          </Pressable>
        </View>
      )}
      {(mapAudioPending || mapAudioSiteId === selected?.id) && selected && (
        <View style={styles.mapAudioBar}>
          <Pressable
            style={styles.mapAudioToggle}
            onPress={() => onToggleMapAudio(selected)}
            accessibilityRole="button"
            accessibilityLabel={mapAudioPlaying ? 'Tạm dừng thuyết minh' : 'Tiếp tục thuyết minh'}
            disabled={mapAudioLoading}
          >
            {mapAudioLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.mapAudioToggleText}>{mapAudioPlaying ? 'Ⅱ' : '▶'}</Text>}
          </Pressable>
          <View style={styles.mapAudioCopy}>
            <Text numberOfLines={1} style={styles.mapAudioTitle}>{selected.name}</Text>
            {!!mapAudioError && !mapAudioLoading && (
              <Text numberOfLines={1} style={styles.mapAudioBarError}>{mapAudioError}</Text>
            )}
            <View style={styles.mapAudioProgressTrack}>
              <View style={[styles.mapAudioProgressFill, {
                width: `${mapAudioDuration > 0 ? Math.min(100, (mapAudioElapsed / mapAudioDuration) * 100) : 0}%`,
              }]} />
            </View>
          </View>
          <Pressable
            style={styles.mapAudioLanguage}
            onPress={onAudioLanguage}
            accessibilityRole="button"
            accessibilityLabel={`Đổi ngôn ngữ thuyết minh, hiện tại ${audioLanguage.name}`}
          >
            <Text style={styles.mapAudioLanguageFlag}>{audioLanguage.flag}</Text>
            <Text style={styles.mapAudioLanguageCode}>{audioLanguage.id.toUpperCase()}</Text>
          </Pressable>
          <Text style={styles.mapAudioTime}>{formatDuration(mapAudioElapsed)}</Text>
        </View>
      )}
    </View>
  );
}

function SavedScreen({ language, savedSites, onLanguage, onOpenSite, onSave, onExplore }) {
  return <View style={styles.fill}><AppHeader language={language} onLanguage={onLanguage} title="Đã lưu" subtitle="Những nơi bạn muốn ghé thăm." /><ScrollView contentContainerStyle={styles.savedContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>
    <View style={styles.savedBanner}><LinearGradient colors={['#332E29', '#74604C', '#C39B73']} style={StyleSheet.absoluteFill} /><View><Text style={styles.savedBannerKicker}>BỘ SƯU TẬP CỦA BẠN</Text><Text style={styles.savedBannerTitle}>{savedSites.length} câu chuyện{'\n'}đang đợi bạn.</Text></View><Bookmark size={36} color="#fff" /></View>
    {!!savedSites.length ? savedSites.map((site, index) => <ExploreCard key={site.id} site={site} index={index} saved onPress={() => onOpenSite(site)} onSave={() => onSave(site)} />) : <View style={styles.emptyState}><Bookmark size={28} color="#c1bbb5" /><Text style={styles.emptyTitle}>Chưa có di tích nào được lưu</Text><Text style={styles.emptyCopy}>Lưu những địa điểm bạn muốn khám phá sau.</Text><Pressable style={styles.emptyButton} onPress={onExplore}><Text>Khám phá di tích</Text><ArrowRight size={14} color="#fff" /></Pressable></View>}
  </ScrollView></View>;
}

function ProfileScreen({ language, audioLanguage, autoPlay, savedCount, setAutoPlay, onLanguage, onAudioLanguage, onNotify }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>
    <AppHeader language={language} onLanguage={onLanguage} title="Cá nhân" subtitle="Không gian khám phá của bạn." />
    <View style={styles.profileHero}><LinearGradient colors={['#F8EBDF', '#F5D7C4', '#E8BA9D']} style={StyleSheet.absoluteFill} /><View style={styles.profileAvatarLarge}><Text>Q1</Text><View style={styles.onlineDot} /></View><Text style={styles.profileName}>Người khám phá</Text><Text style={styles.profileSince}>Thành viên từ tháng 10, 2026</Text><View style={styles.profileStats}><View><Text>08</Text><Text>ĐIỂM ĐÃ NGHE</Text></View><View style={styles.profileStatDivider} /><View><Text>{String(savedCount).padStart(2, '0')}</Text><Text>ĐÃ LƯU</Text></View><View style={styles.profileStatDivider} /><View><Text>03</Text><Text>NGÀY KHÁM PHÁ</Text></View></View></View>
    <Text style={styles.profileGroupLabel}>TRẢI NGHIỆM</Text>
    <View style={styles.settingsGroup}>
      <ProfileRow icon={Languages} title="Ngôn ngữ giao diện" subtitle={language.name} onPress={onLanguage} />
      <View style={styles.profileSettingRow}><View style={styles.profileRowIcon}><Headphones size={17} color="#4C9C7E" /></View><View style={styles.profileRowCopy}><Text style={styles.profileRowTitle}>Tự động phát gần di tích</Text><Text style={styles.profileRowSub}>Phát khi bạn đến gần điểm tham quan</Text></View><Switch value={autoPlay} onValueChange={setAutoPlay} trackColor={{ false: '#ddd8d2', true: '#F04D2E' }} thumbColor="#fff" /></View>
      <ProfileRow icon={Headphones} title="Ngôn ngữ thuyết minh" subtitle={audioLanguage.name} onPress={onAudioLanguage} last />
    </View>
    <Text style={styles.profileGroupLabel}>THÔNG TIN</Text>
    <View style={styles.settingsGroup}><ProfileRow icon={CircleHelp} title="Trợ giúp & hỗ trợ" onPress={() => onNotify('Trung tâm trợ giúp sẽ sớm được cập nhật.')} /><ProfileRow icon={Info} title="Về Di Tích Q1" subtitle="Phiên bản 1.0.0" onPress={() => onNotify('Ứng dụng thuyết minh di tích lịch sử Quận 1.')} last /></View>
    <View style={styles.profileFoot}><ShieldMark /><Text>Được tạo nên để kể những câu chuyện của Sài Gòn.</Text></View>
  </ScrollView>;
}

function ProfileRow({ icon: Icon, title, subtitle, onPress, last }) {
  return <Pressable style={[styles.profileSettingRow, last && styles.noBorder]} onPress={onPress}><View style={styles.profileRowIcon}><Icon size={17} color="#E77955" /></View><View style={styles.profileRowCopy}><Text style={styles.profileRowTitle}>{title}</Text>{!!subtitle && <Text style={styles.profileRowSub}>{subtitle}</Text>}</View><ChevronRight size={17} color="#b5aea7" /></Pressable>;
}

function BottomTabs({ activeTab, onChange }) {
  return <View style={styles.bottomTabs}>{tabs.map(({ key, label, icon: Icon }) => {
    const active = activeTab === key;
    return <Pressable key={key} style={styles.tabButton} onPress={() => onChange(key)}><View style={[styles.tabIconWrap, active && styles.tabIconActive]}><Icon size={19} color={active ? accent : '#9B9690'} strokeWidth={active ? 2.3 : 1.8} /></View><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>{active && <View style={styles.activeTabDot} />}</Pressable>;
  })}</View>;
}

function LanguagePicker({ visible, selected, mode, onClose, onSelect }) {
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <Pressable style={styles.modalScrim} onPress={onClose}><Pressable style={styles.languageSheet} onPress={(event) => event.stopPropagation()}>
      <View style={styles.sheetHandle} /><View style={styles.sheetHead}><View><Text style={styles.sheetEyebrow}>CÁ NHÂN HÓA TRẢI NGHIỆM</Text><Text style={styles.sheetTitle}>Chọn ngôn ngữ</Text><Text style={styles.sheetSub}>{mode === 'audio' ? 'Nội dung thuyết minh bạn muốn nghe' : 'Ngôn ngữ giao diện'}</Text></View><Pressable style={styles.sheetClose} onPress={onClose}><X size={18} color="#77716A" /></Pressable></View>
      {languages.map((item) => (
    <Pressable 
        key={item.id} 
        style={[
            styles.languageOption, 
            // 1. Thay 'language' thành 'selected' ở đây
            selected === item.id && styles.languageOptionSelected
        ]} 
        // 2. Trả lại hàm onSelect cũ của bạn
        onPress={() => onSelect(item)}
    >
        <View style={styles.languageOptionFlag}>
            <Text>{item.flag}</Text>
        </View>
        <View style={styles.languageOptionCopy}>
            <Text style={styles.languageOptionName}>{item.name}</Text>
            <Text style={styles.languageOptionNative}>{item.nativeName}</Text>
        </View>
        
        {/* 3. Thay 'language' thành 'selected' ở đây nữa */}
        {selected === item.id ? (
            <View style={styles.languageChecked}>
                <Check size={15} color="#fff" />
            </View>
        ) : (
            <View style={styles.languageRadio} />
        )}
    </Pressable>
))}
      <Text style={styles.sheetFootnote}>Bạn có thể đổi ngôn ngữ bất cứ lúc nào.</Text>
    </Pressable></Pressable>
  </Modal>;
}

function durationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return 0;
  const clock = value.match(/^\s*(\d+):([0-5]?\d)\s*$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return 0;
}

function voiceLabel(language) {
  return {
    vi: 'Giọng đọc · Nữ miền Nam',
    en: 'Narration · Female voice',
    ja: '音声 · 女性の声',
    zh: '语音 · 女声',
    fr: 'Narration · Voix féminine',
  }[language] || 'Audio narration';
}

function todayLabel(language = 'vi') {
  const localeByLanguage = {
    vi: 'vi-VN',
    en: 'en-US',
    ja: 'ja-JP',
    zh: 'zh-CN',
    fr: 'fr-FR',
  };
  return new Intl.DateTimeFormat(localeByLanguage[language] || 'vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date()).toLocaleUpperCase(localeByLanguage[language] || 'vi-VN');
}

function scrollHorizontallyWithWheel(event) {
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  event.currentTarget.scrollLeft += delta;
}

function useMouseDragScroll() {
  const dragState = useRef({ startX: 0, startScrollLeft: 0, active: false, moved: false, suppressClick: false });

  return {
    onMouseDown(event) {
      if (event.button !== 0) return;
      const state = dragState.current;
      state.startX = event.clientX;
      state.startScrollLeft = event.currentTarget.scrollLeft;
      state.active = true;
      state.moved = false;
      event.currentTarget.style.cursor = 'grabbing';
    },
    onMouseMove(event) {
      const state = dragState.current;
      if (!state.active) return;
      const delta = event.clientX - state.startX;
      if (Math.abs(delta) > 4) state.moved = true;
      if (!state.moved) return;
      event.preventDefault();
      event.currentTarget.scrollLeft = state.startScrollLeft - delta;
    },
    onMouseUp(event) {
      const state = dragState.current;
      state.active = false;
      state.suppressClick = state.moved;
      event.currentTarget.style.cursor = 'grab';
    },
    onMouseLeave(event) {
      const state = dragState.current;
      state.active = false;
      state.suppressClick = state.moved;
      event.currentTarget.style.cursor = 'grab';
    },
    onClickCapture(event) {
      if (!dragState.current.suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      dragState.current.suppressClick = false;
    },
  };
}

function formatDuration(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60).toString();
  const remaining = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

function ShieldMark() { return <View style={styles.shieldMark}><Sparkles size={11} color={accent} /></View>; }

const styles = StyleSheet.create({
  searchDropdown: { marginTop: 6, backgroundColor: '#fff', borderRadius: 12, maxHeight: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 5 },
  searchResultItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0ECE8' },
  searchResultText: { fontSize: 13, fontWeight: '700', color: '#333' },
  searchResultSub: { fontSize: 10, color: '#888', marginTop: 3 },
  searchEmptyText: { paddingHorizontal: 14, paddingVertical: 13, color: '#81786F', fontSize: 12 },
  realMapTopBar: { position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10 },
  realMapSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', height: 54, borderRadius: 14, paddingHorizontal: 14, shadowColor: '#202124', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 7 },
  realMapSearchInput: { flex: 1, marginLeft: 10, fontSize: 13, color: '#333' },
  mapSearchDivider: { width: 1, height: 28, marginHorizontal: 10, backgroundColor: '#E8EAED' },
  mapSearchLocate: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  locationStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#fff', shadowColor: '#202124', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 5, elevation: 4 },
  locationStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4285F4' },
  locationStatusText: { color: '#3C4043', fontSize: 10, fontWeight: '600' },
  locationError: { alignSelf: 'flex-start', maxWidth: '94%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#202124', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 5, elevation: 4 },
  locationErrorText: { flex: 1, color: '#5F6368', fontSize: 9, lineHeight: 14 },
  realMapBottomCard: { position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 10, shadowColor: '#202124', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 9 },
  routeFloatingCard: { position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 12, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 14, paddingRight: 10, borderRadius: 16, backgroundColor: '#fff', shadowColor: '#202124', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 8 },
  routeFloatingCopy: { flex: 1, gap: 4 },
  routeFloatingTitle: { color: '#433B34', fontSize: 11, fontWeight: '800' },
  routeFloatingStep: { color: '#81786F', fontSize: 9 },
  routeFloatingButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#F1F3F4' },
  simulationProgressTrack: { height: 4, overflow: 'hidden', borderRadius: 3, backgroundColor: '#EDE8E2' },
  simulationProgressFill: { height: '100%', borderRadius: 3, backgroundColor: '#F04D2E' },
  mapAudioBar: { position: 'absolute', bottom: 12, left: 16, right: 16, zIndex: 13, height: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderRadius: 14, backgroundColor: '#24211E', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 7 },
  mapAudioLanguage: { minWidth: 44, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 5, borderRadius: 9, backgroundColor: '#FFFFFF1A' },
  mapAudioLanguageFlag: { fontSize: 13 },
  mapAudioLanguageCode: { color: '#fff', fontSize: 8, fontWeight: '800' },
  mapAudioToggle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: accent },
  mapAudioToggleText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  mapAudioCopy: { flex: 1, gap: 6 },
  mapAudioTitle: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mapAudioError: { marginTop: 4, color: '#A43D2A', fontSize: 8, lineHeight: 11 },
  mapAudioBarError: { color: '#FFC7B8', fontSize: 8 },
  mapAudioProgressTrack: { height: 3, overflow: 'hidden', borderRadius: 2, backgroundColor: '#FFFFFF40' },
  mapAudioProgressFill: { height: '100%', borderRadius: 2, backgroundColor: accent },
  mapAudioTime: { color: '#E9E3DD', fontSize: 9, fontVariant: ['tabular-nums'] },
  mapActionRow: { flexDirection: 'row', gap: 7 },
  directionButton: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#4C9C7E' },
  simulationButton: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F04D2E' },
  audioPlaybackError: { color: '#A43D2A', fontSize: 10, lineHeight: 15 },
  safeArea: { flex: 1, backgroundColor: '#FBFAF8' },
  apiStatusBanner: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFF3E9' },
  apiStatusError: { backgroundColor: '#A43D2A' },
  apiStatusCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  apiStatusText: { flex: 1, color: '#68432F', fontSize: 10, fontWeight: '600' },
  apiRetryButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, backgroundColor: '#ffffff26' },
  apiRetryText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  noSitesCard: { minHeight: 96, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13, backgroundColor: '#F4F1ED' },
  noSitesText: { color: '#77716B', fontSize: 11, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#FBFAF8' },
  fill: { flex: 1, backgroundColor: '#FBFAF8' },
  homeContent: { paddingHorizontal: 16, paddingBottom: 22 },
  appHeader: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: '#FBFAF8' },
  headerTitles: { flex: 1 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  wordmarkIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: accent },
  wordmark: { fontSize: 13, fontWeight: '900', letterSpacing: 1.1, color: ink },
  wordmarkAccent: { color: accent },
  headerTitle: { fontSize: 20, fontWeight: '800', color: ink, letterSpacing: -0.4 },
  headerSubtitle: { marginTop: 2, color: muted, fontSize: 10 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  languageButton: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: '#EBE7E2', borderRadius: 11, backgroundColor: '#fff' },
  languageFlag: { fontSize: 14 },
  languageCode: { color: ink, fontSize: 10, fontWeight: '800' },
  headerOnDark: { backgroundColor: 'transparent' },
  headerSubtitleDark: { color: '#ffffffa8' },
  languageButtonDark: { borderColor: '#ffffff40', backgroundColor: '#ffffff18' },
  textWhite: { color: '#fff' },
  homeGreeting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, marginBottom: 14 },
  greetingKicker: { color: '#A19A93', fontSize: 8, fontWeight: '800', letterSpacing: 1.15 },
  greetingTitle: { marginTop: 5, color: ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.65 },
  greetingSub: { marginTop: 4, color: '#8F8983', fontSize: 10 },
  wave: { fontSize: 19 },
  avatarButton: { position: 'relative', width: 41, height: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ECDDD1', borderRadius: 15, backgroundColor: '#F7E6D9' },
  avatarInitial: { color: '#835A41', fontSize: 11, fontWeight: '900' },
  onlineDot: { position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderWidth: 2, borderColor: '#FBFAF8', borderRadius: 7, backgroundColor: '#54B688' },
  searchLauncher: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: '#EEEAE6', borderRadius: 12, backgroundColor: '#fff' },
  searchPlaceholder: { flex: 1, color: '#A29B95', fontSize: 10 },
  searchTuning: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#F7F5F2' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 23, marginBottom: 11 },
  sectionEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  sectionEyebrowText: { color: accent, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { color: ink, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  sectionSub: { marginTop: 3, color: '#A09A94', fontSize: 9 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 2 },
  seeAllText: { color: accent, fontSize: 9, fontWeight: '700' },
  heroCarousel: { gap: 0 },
  featuredCarouselViewport: { width: '100%', alignSelf: 'stretch', flexShrink: 0 },
  featuredCarouselScroll: { width: '100%', flexGrow: 0 },
  featuredCard: { position: 'relative', flexShrink: 0, height: 242, overflow: 'hidden', borderRadius: 17, backgroundColor: '#514238' },
  featuredImage: { opacity: 0.66 },
  photoTint: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', opacity: 0.89 },
  featuredTop: { position: 'absolute', top: 12, right: 12, left: 12, flexDirection: 'row', justifyContent: 'space-between' },
  featuredTag: { height: 27, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderWidth: 1, borderColor: '#ffffff38', borderRadius: 6, backgroundColor: '#231e1b55' },
  featuredTagText: { color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  favoriteButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff5c', borderRadius: 11, backgroundColor: '#221e1b44' },
  featuredBottom: { position: 'absolute', right: 15, bottom: 14, left: 15 },
  distancePill: { alignSelf: 'flex-start', height: 26, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#ffffff1e' },
  distancePillText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  distanceDivider: { color: '#ffffff96', fontSize: 15 },
  featuredTitle: { marginTop: 8, color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  featuredDescription: { marginTop: 4, color: '#ffffffd9', fontSize: 15 },
  featuredActions: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12 },
  featuredListen: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 9, backgroundColor: accent },
  featuredListenText: { color: '#fff', fontSize: 16.5, fontWeight: '700' },
  featuredDuration: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featuredDurationText: { color: '#ffffffdf', fontSize: 16.5 },
  featuredArrow: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', borderWidth: 1, borderColor: '#ffffff61', borderRadius: 8 },
  carouselMeta: { height: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carouselDots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  carouselDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#DED9D3' },
  carouselDotActive: { width: 18, backgroundColor: accent },
  carouselCounter: { color: ink, fontSize: 8, fontWeight: '800' },
  counterMuted: { color: '#AAA39D', fontWeight: '500' },
  quickActions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 7, marginBottom: 2, paddingVertical: 13, borderWidth: 1, borderColor: '#F0ECE8', borderRadius: 13, backgroundColor: '#fff' },
  quickAction: { alignItems: 'center', gap: 6 },
  quickIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  quickIcon_orange: { backgroundColor: '#FFF0E8' },
  quickIcon_blue: { backgroundColor: '#EAF1FC' },
  quickIcon_green: { backgroundColor: '#E9F5EF' },
  quickColor_orange: { color: '#E17850' },
  quickColor_blue: { color: '#6889C7' },
  quickColor_green: { color: '#4D9C7A' },
  quickLabel: { color: '#66615D', fontSize: 8, fontWeight: '600' },
  textOnlyLink: { paddingBottom: 2 },
  horizontalCards: { gap: 10, paddingBottom: 3, paddingRight: 16 },
  miniPlaceCard: { width: 146, overflow: 'hidden', borderWidth: 1, borderColor: '#F0ECE8', borderRadius: 11, backgroundColor: '#fff' },
  miniArtwork: { position: 'relative', height: 110, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  miniDistance: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 6, backgroundColor: '#24201DB8' },
  miniDistanceText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  miniPlaceInfo: { paddingHorizontal: 8, paddingTop: 7, paddingBottom: 8 },
  miniPlaceTitle: { color: ink, fontSize: 9, fontWeight: '700' },
  miniPlaceCategory: { marginTop: 3, color: '#A09A94', fontSize: 7 },
  miniAudio: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  miniAudioText: { color: '#817A74', fontSize: 7 },
  buildingArt: { position: 'absolute', bottom: 3, width: 75, height: 54, alignItems: 'center', justifyContent: 'flex-end' },
  buildingArtLarge: { bottom: 31, width: 145, height: 116 },
  artDome: { width: 26, height: 20, borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#fff1' },
  artRoof: { width: '92%', height: 6, borderRadius: 2 },
  artFacade: { width: '84%', height: 31, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-evenly', paddingHorizontal: 4, borderLeftWidth: 2, borderRightWidth: 2, backgroundColor: '#ffffff18' },
  artColumn: { width: 5, marginTop: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  artWindow: { width: 3, height: 8, marginTop: 9, marginLeft: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: '#35312C85' },
  artBase: { width: '94%', height: 4, borderRadius: 2 },
  nearbyBanner: { position: 'relative', height: 162, flexDirection: 'row', overflow: 'hidden', marginTop: 21, borderRadius: 14 },
  nearbyBannerCopy: { zIndex: 2, flex: 1, justifyContent: 'center', paddingLeft: 15 },
  livePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 7, backgroundColor: '#ffffff17' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#89D2A2' },
  livePillText: { color: '#fff', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 },
  nearbyTitle: { marginTop: 7, color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 22, letterSpacing: -0.3 },
  nearbyCopy: { marginTop: 8, color: '#fff', fontSize: 11 },
  nearbyButton: { alignSelf: 'flex-start', height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 14, borderRadius: 8, backgroundColor: accent },
  nearbyButtonText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  nearbyIllustration: { position: 'absolute', right: -11, bottom: 0, width: '48%', height: '100%', justifyContent: 'flex-end' },
  glowCircle: { position: 'absolute', top: 13, right: 28, width: 83, height: 83, borderRadius: 50, backgroundColor: '#D6AF7966' },
  homeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 17, marginBottom: 8 },
  homeFooterText: { color: '#AAA39D', fontSize: 8 },
  shieldMark: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#FFF0E8' },
  exploreSearch: { height: 43, flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: '#ECE8E4', borderRadius: 11, backgroundColor: '#fff' },
  exploreInput: { flex: 1, height: 42, color: ink, fontSize: 10 },
  filterButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#F7F5F2' },
  categoryChips: { gap: 7, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 5 },
  categoryChip: { height: 30, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#EAE6E2', borderRadius: 16, backgroundColor: '#fff' },
  categoryChipActive: { borderColor: ink, backgroundColor: ink },
  categoryChipText: { color: '#79736E', fontSize: 9, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },
  exploreResults: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingTop: 13, paddingBottom: 7 },
  resultCount: { color: '#A09A94', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  nearbyStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nearbyStatusText: { color: '#69967C', fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5CB987' },
  exploreList: { flex: 1 },
  exploreListContent: { paddingHorizontal: 16, paddingBottom: 14 },
  exploreCard: { flexDirection: 'row', gap: 10, marginBottom: 9, padding: 8, borderWidth: 1, borderColor: '#F0ECE8', borderRadius: 12, backgroundColor: '#fff' },
  exploreArtwork: { position: 'relative', width: 96, height: 102, flex: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 8 },
  artNumber: { position: 'absolute', top: 6, left: 7, color: '#ffffffb8', fontSize: 8, fontWeight: '800' },
  exploreCardInfo: { flex: 1, justifyContent: 'center', minWidth: 0 },
  exploreCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exploreCategory: { color: accent, fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  explorePlaceName: { marginTop: 5, color: ink, fontSize: 12, fontWeight: '800', letterSpacing: -0.2 },
  exploreAddress: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  exploreAddressText: { maxWidth: '60%', color: '#928B85', fontSize: 8 },
  dotSep: { color: '#B7B0A9', fontSize: 9 },
  exploreDistance: { color: '#7F7973', fontSize: 8, fontWeight: '600' },
  exploreCardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, paddingTop: 7, borderTopWidth: 1, borderTopColor: '#F2EFEC' },
  langFlags: { flexDirection: 'row', alignItems: 'center' },
  langFlag: { marginRight: 2, fontSize: 10 },
  exploreDuration: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  exploreDurationText: { color: '#817A74', fontSize: 7 },
  emptyState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { marginTop: 12, color: ink, fontSize: 13, fontWeight: '700' },
  emptyCopy: { marginTop: 5, color: '#9B948E', fontSize: 9, textAlign: 'center', lineHeight: 15 },
  detailRoot: { flex: 1, backgroundColor: '#FBFAF8' },
  detailScroll: { paddingBottom: 15 },
  detailHero: { position: 'relative', height: 275, overflow: 'hidden', justifyContent: 'flex-end' },
  detailImage: { opacity: 0.56 },
  detailTopBar: { position: 'absolute', top: Platform.OS === 'web' ? 8 : 4, right: 15, left: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTopActions: { flexDirection: 'row', gap: 7 },
  detailRound: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff52', borderRadius: 12, backgroundColor: '#1D1A185C' },
  detailHeroBottom: { zIndex: 2, paddingHorizontal: 18, paddingBottom: 18 },
  detailHeroTitle: { marginTop: 8, color: '#fff', fontSize: 25, fontWeight: '800', letterSpacing: -0.6 },
  detailHeroAddress: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  detailHeroAddressText: { color: '#ffffffd0', fontSize: 9 },
  detailContent: { paddingHorizontal: 16 },
  detailAudioCard: { marginTop: -1, padding: 13, borderWidth: 1, borderColor: '#EFEBE7', borderRadius: 13, backgroundColor: '#fff' },
  audioCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  audioLangRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audioLangIcon: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFF1EA' },
  audioLangName: { color: '#49433F', fontSize: 9, fontWeight: '700' },
  audioVoice: { marginTop: 3, color: '#A19A94', fontSize: 7 },
  audioChangeLang: { flexDirection: 'row', gap: 4, padding: 7, borderWidth: 1, borderColor: '#EFECE8', borderRadius: 7 },
  audioTrack: { marginTop: 15 },
  audioTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  audioTimeCurrent: { color: ink, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  audioTimeText: { color: '#8D867F', fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  audioProgress: { position: 'relative', height: 4, borderRadius: 4, backgroundColor: '#EEEAE6' },
  audioProgressFill: { width: '9%', height: '100%', borderRadius: 4, backgroundColor: accent },
  audioProgressPlaying: { width: '28%' },
  audioKnob: { position: 'absolute', top: -3, left: '8%', width: 10, height: 10, borderWidth: 2, borderColor: accent, borderRadius: 5, backgroundColor: '#fff' },
  audioKnobPlaying: { left: '27%' },
  audioControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  skipButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F7F5F2' },
  largePlay: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.28, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  speedPill: { paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#ECE8E4', borderRadius: 7 },
  speedText: { color: '#77716B', fontSize: 8, fontWeight: '700' },
  detailStoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19 },
  storyEyebrow: { color: accent, fontSize: 7, fontWeight: '800', letterSpacing: 0.95 },
  storyTitle: { marginTop: 4, color: ink, fontSize: 17, fontWeight: '800' },
  shareButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ECE8E4', borderRadius: 10, backgroundColor: '#fff' },
  storyText: { marginTop: 9, color: '#716B65', fontSize: 10, lineHeight: 18 },
  factStrip: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, padding: 10, borderWidth: 1, borderColor: '#F0ECE8', borderRadius: 10, backgroundColor: '#fff' },
  factIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FFF1EA' },
  factCopy: { flex: 1 },
  factLabel: { color: '#A19A94', fontSize: 7, fontWeight: '700', letterSpacing: 0.6 },
  factValue: { marginTop: 4, color: '#514B46', fontSize: 9, fontWeight: '600' },
  locationCard: { marginTop: 10, padding: 8, borderWidth: 1, borderColor: '#F0ECE8', borderRadius: 10, backgroundColor: '#fff' },
  locationMapArt: { position: 'relative', height: 82, overflow: 'hidden', borderRadius: 7, backgroundColor: '#EBEFE7' },
  mapStreetLine: { position: 'absolute', top: '49%', left: -10, width: '115%', height: 8, backgroundColor: '#fff', transform: [{ rotate: '-6deg' }] },
  mapBlockA: { position: 'absolute', top: 8, left: 13, width: 70, height: 27, borderRadius: 4, backgroundColor: '#DDE7D9' },
  mapBlockB: { position: 'absolute', right: 20, bottom: 7, width: 80, height: 25, borderRadius: 4, backgroundColor: '#DDE7D9' },
  locationPin: { position: 'absolute', top: 24, left: '48%' },
  locationText: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 },
  locationAddress: { marginTop: 4, color: '#4F4944', fontSize: 9, fontWeight: '700' },
  locationDistrict: { marginTop: 3, color: '#9A938D', fontSize: 8 },
  navigateButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: accent },
  detailSticky: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === 'web' ? 8 : 5, borderTopWidth: 1, borderTopColor: '#F0ECE8', backgroundColor: '#fff' },
  stickyStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7 },
  stickyStatusText: { color: '#849185', fontSize: 7, fontWeight: '700', letterSpacing: 0.6 },
  stickyPlay: { height: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 9, backgroundColor: accent },
  stickyPlayText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mapScreen: { flex: 1 },
  mapCanvas: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#F0F3EE' },
  mapTileOne: { position: 'absolute', top: '21%', left: '6%', width: '28%', height: '18%', borderRadius: 8, backgroundColor: '#E0E9DE' },
  mapTileTwo: { position: 'absolute', top: '23%', left: '42%', width: '28%', height: '19%', borderRadius: 8, backgroundColor: '#E7EBDD' },
  mapTileThree: { position: 'absolute', top: '52%', left: '7%', width: '34%', height: '18%', borderRadius: 8, backgroundColor: '#E4EBDD' },
  mapTileFour: { position: 'absolute', top: '53%', left: '48%', width: '27%', height: '21%', borderRadius: 8, backgroundColor: '#E1E9DD' },
  mapTileFive: { position: 'absolute', top: '76%', left: '14%', width: '27%', height: '15%', borderRadius: 8, backgroundColor: '#E7EBDD' },
  mapRoadMain: { position: 'absolute', top: '45%', left: '-15%', width: '130%', height: 14, backgroundColor: '#fff', transform: [{ rotate: '-7deg' }] },
  mapRoadVertical: { position: 'absolute', top: '10%', left: '37%', width: 11, height: '80%', backgroundColor: '#fff', transform: [{ rotate: '12deg' }] },
  mapRoadDiagonal: { position: 'absolute', top: '20%', left: '70%', width: 9, height: '80%', backgroundColor: '#fff', transform: [{ rotate: '-19deg' }] },
  mapPark: { position: 'absolute', top: '25%', left: '72%', width: 66, height: 75, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#D8E8D5' },
  mapParkText: { color: '#799074', fontSize: 7, fontWeight: '800', lineHeight: 11, textAlign: 'center', letterSpacing: 0.5 },
  mapWater: { position: 'absolute', top: '2%', right: '-21%', width: '30%', height: '66%', alignItems: 'center', justifyContent: 'center', borderRadius: 90, backgroundColor: '#DBE9E9', transform: [{ rotate: '18deg' }] },
  mapWaterText: { color: '#88A8A6', fontSize: 7, fontWeight: '800', letterSpacing: 1, transform: [{ rotate: '72deg' }] },
  mapStreet: { position: 'absolute', color: '#9AA394', fontSize: 7, fontWeight: '600', letterSpacing: 0.4 },
  mapPoiPin: { position: 'absolute', zIndex: 3, width: 34, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', borderRadius: 19, backgroundColor: '#78927B', transform: [{ rotate: '-45deg' }], shadowColor: '#414B3C', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  mapPoiPinSelected: { width: 39, height: 43, backgroundColor: accent },
  mapPin1: { top: '40%', left: '21%' },
  mapPin2: { top: '57%', left: '50%' },
  mapPin3: { top: '32%', left: '61%' },
  mapPin4: { top: '66%', left: '29%' },
  mapPin5: { top: '70%', left: '69%' },
  mapPin6: { top: '48%', left: '79%' },
  mapTopBar: { position: 'absolute', top: 0, right: 0, left: 0, paddingTop: 4, paddingBottom: 8, backgroundColor: '#FBFAF8F0' },
  mapLocationButton: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 10, borderWidth: 1, borderColor: '#EFEAE5', borderRadius: 11, backgroundColor: '#fff' },
  mapLocationTitle: { color: ink, fontSize: 9, fontWeight: '700' },
  mapLocationSub: { marginTop: 2, color: '#9A938D', fontSize: 7 },
  mapRecenter: { position: 'absolute', right: 15, bottom: 256, width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ECE8E4', borderRadius: 13, backgroundColor: '#fff', elevation: 2 },
  mapZoom: { position: 'absolute', right: 15, bottom: 204, width: 34, height: 66, alignItems: 'center', justifyContent: 'space-evenly', borderWidth: 1, borderColor: '#ECE8E4', borderRadius: 10, backgroundColor: '#fff', elevation: 2 },
  mapZoomText: { color: '#514B46', fontSize: 16 },
  mapZoomDivider: { width: 18, height: 1, backgroundColor: '#EBE7E2' },
  mapBottom: { position: 'absolute', right: 0, bottom: 0, left: 0, paddingHorizontal: 15, paddingBottom: 12, borderTopLeftRadius: 19, borderTopRightRadius: 19, backgroundColor: '#FBFAF8', elevation: 8 },
  mapBottomHandle: { alignSelf: 'center', width: 33, height: 4, marginTop: 7, borderRadius: 4, backgroundColor: '#D8D2CC' },
  mapResultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 9 },
  mapResultEyebrow: { color: '#A29A93', fontSize: 7, fontWeight: '800', letterSpacing: 0.7 },
  mapResultTitle: { marginTop: 3, color: ink, fontSize: 14, fontWeight: '800' },
  resultCountMuted: { color: '#9B948E', fontSize: 9, fontWeight: '500' },
  mapFilterButton: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EAE6E2', borderRadius: 9, backgroundColor: '#fff' },
  mapSelectedCard: { gap: 10, paddingHorizontal: 15, paddingTop: 9, paddingBottom: 14, borderRadius: 18, backgroundColor: '#fff' },
  mapSheetHandle: { alignSelf: 'center', width: 34, height: 4, borderRadius: 2, backgroundColor: '#DADCE0' },
  mapPlaceEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mapPlaceEyebrowText: { color: '#5F6368', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  mapSelectedMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mapSelectedArtwork: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 12 },
  mapSelectedCopy: { flex: 1 },
  nearbyLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nearbyLineText: { color: '#6F927A', fontSize: 6, fontWeight: '800', letterSpacing: 0.35 },
  mapSelectedTitle: { color: '#202124', fontSize: 14, fontWeight: '700' },
  mapSelectedAddress: { marginTop: 4, color: '#5F6368', fontSize: 10 },
  mapSelectedAction: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 5, backgroundColor: accent },
  mapSelectedActionText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  routeDetails: { overflow: 'hidden', borderTopWidth: 1, borderTopColor: '#EDEFEA', paddingTop: 8 },
  routeSummary: { marginBottom: 6, color: '#4C7962', fontSize: 10, fontWeight: '800' },
  routeSteps: { maxHeight: 120 },
  routeStep: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 },
  routeStepNumber: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#EDF3EE' },
  routeStepNumberText: { color: '#4C7962', fontSize: 8, fontWeight: '800' },
  routeStepText: { flex: 1, color: '#514B46', fontSize: 9, lineHeight: 13 },
  routeStepDistance: { color: '#97908A', fontSize: 8 },
  routeErrorText: { marginTop: 7, color: '#A43D2A', fontSize: 9, lineHeight: 14 },
  mapThumbs: { gap: 6, paddingVertical: 8 },
  mapThumb: { height: 27, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: '#ECE8E4', borderRadius: 14, backgroundColor: '#fff' },
  mapThumbSelected: { borderColor: ink, backgroundColor: ink },
  mapThumbText: { color: '#77716B', fontSize: 7, fontWeight: '600' },
  savedContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 20 },
  savedBanner: { height: 142, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', marginBottom: 14, paddingHorizontal: 16, borderRadius: 14 },
  savedBannerKicker: { color: '#ffffffad', fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  savedBannerTitle: { marginTop: 8, color: '#fff', fontSize: 19, fontWeight: '800', lineHeight: 24 },
  savedBannerIcon: { marginRight: 6, opacity: 0.75 },
  emptyButton: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13, paddingHorizontal: 11, borderRadius: 8, backgroundColor: accent },
  emptyButtonText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  profileContent: { paddingBottom: 24 },
  profileHero: { position: 'relative', alignItems: 'center', overflow: 'hidden', marginHorizontal: 16, marginTop: 10, paddingTop: 19, paddingBottom: 15, borderRadius: 15 },
  profileAvatarLarge: { position: 'relative', width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ffffffbd', borderRadius: 22, backgroundColor: '#FBF4EC' },
  profileAvatarText: { color: '#8D6048', fontSize: 16, fontWeight: '900' },
  profileName: { marginTop: 8, color: '#3D352F', fontSize: 13, fontWeight: '800' },
  profileSince: { marginTop: 3, color: '#81766D', fontSize: 8 },
  profileStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%', marginTop: 14, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#ffffff80' },
  profileStatItem: { alignItems: 'center' },
  profileStatValue: { color: '#4A4038', fontSize: 12, fontWeight: '800' },
  profileStatLabel: { marginTop: 3, color: '#897F75', fontSize: 6, fontWeight: '700', letterSpacing: 0.4 },
  profileStatDivider: { width: 1, height: 21, backgroundColor: '#ffffff99' },
  profileGroupLabel: { marginTop: 19, marginBottom: 7, paddingHorizontal: 18, color: '#A29A93', fontSize: 7, fontWeight: '800', letterSpacing: 0.85 },
  settingsGroup: { marginHorizontal: 16, paddingHorizontal: 11, borderWidth: 1, borderColor: '#F0ECE8', borderRadius: 12, backgroundColor: '#fff' },
  profileSettingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: '#F2EFEC' },
  noBorder: { borderBottomWidth: 0 },
  profileRowIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FFF2EB' },
  profileRowCopy: { flex: 1 },
  profileRowTitle: { color: '#514B46', fontSize: 9, fontWeight: '700' },
  profileRowSub: { marginTop: 3, color: '#A09A94', fontSize: 7 },
  profileFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 },
  profileFootText: { color: '#AAA39D', fontSize: 7 },
  bottomTabs: { height: 59, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 9, borderTopWidth: 1, borderTopColor: '#F0ECE8', backgroundColor: '#fff' },
  tabButton: { position: 'relative', minWidth: 61, alignItems: 'center', justifyContent: 'center', gap: 1 },
  tabIconWrap: { width: 30, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabIconActive: { backgroundColor: '#FFF0E9' },
  tabLabel: { color: '#A49D96', fontSize: 7, fontWeight: '600' },
  tabLabelActive: { color: accent, fontWeight: '800' },
  activeTabDot: { position: 'absolute', top: -5, width: 3, height: 3, borderRadius: 2, backgroundColor: accent },
  modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#211D1A77' },
  languageSheet: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: Platform.OS === 'web' ? 16 : 28, borderTopLeftRadius: 21, borderTopRightRadius: 21, backgroundColor: '#FBFAF8' },
  sheetHandle: { alignSelf: 'center', width: 35, height: 4, marginBottom: 17, borderRadius: 3, backgroundColor: '#D9D3CD' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 13 },
  sheetEyebrow: { color: accent, fontSize: 7, fontWeight: '800', letterSpacing: 0.9 },
  sheetTitle: { marginTop: 4, color: ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  sheetSub: { marginTop: 3, color: '#99928C', fontSize: 8 },
  sheetClose: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F0ECE8' },
  languageOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#EEEAE6', borderRadius: 10, backgroundColor: '#fff' },
  languageOptionSelected: { borderColor: accent, backgroundColor: '#FFF7F3' },
  languageOptionFlag: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F7F5F2' },
  languageOptionFlagText: { fontSize: 16 },
  languageOptionCopy: { flex: 1 },
  languageOptionName: { color: '#4F4944', fontSize: 10, fontWeight: '700' },
  languageOptionNative: { marginTop: 2, color: '#A29A94', fontSize: 7 },
  languageChecked: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: accent },
  languageRadio: { width: 17, height: 17, borderWidth: 1.5, borderColor: '#D9D3CD', borderRadius: 9 },
  sheetFootnote: { marginTop: 7, color: '#A9A29B', fontSize: 7, textAlign: 'center' },
  toast: { position: 'absolute', zIndex: 30, right: 19, bottom: 75, left: 19, minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#302C28', elevation: 5 },
  toastText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  tourCard: { height: 165, marginHorizontal: 16, marginTop: 12, borderRadius: 14, backgroundColor: '#333', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  tourImage: { flex: 1, justifyContent: 'flex-end', padding: 15 },
  tourContent: { zIndex: 2 },
  tourTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: accent, marginBottom: 8 },
  tourTagText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  tourTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 5, letterSpacing: -0.3 },
  tourRoute: { color: '#D4CDC7', fontSize: 10, fontWeight: '600', lineHeight: 16 },

  globalMiniPlayer: { position: 'absolute', bottom: 70, left: 16, right: 16, height: 56, backgroundColor: '#1A1816', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  miniPlayerProgress: { position: 'absolute', top: 0, left: 0, height: 2, backgroundColor: accent, zIndex: 10 },
  miniPlayerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  miniPlayerIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center' },
  miniPlayerInfo: { flex: 1, justifyContent: 'center' },
  miniPlayerEyebrow: { color: accent, fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  miniPlayerTitle: { color: '#fff', fontSize: 11, fontWeight: '700' },
  miniPlayerBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});

// Hàm tính khoảng cách đường chim bay (Haversine Formula) - Trả về đơn vị Mét
function describeRouteManeuver(maneuver, roadName) {
  const { type, modifier } = maneuver || {};
  const directions = {
    'sharp left': 'Rẽ gấp trái',
    left: 'Rẽ trái',
    'slight left': 'Chếch trái',
    straight: 'Đi thẳng',
    'slight right': 'Chếch phải',
    right: 'Rẽ phải',
    'sharp right': 'Rẽ gấp phải',
    'uturn': 'Quay đầu',
  };
  let instruction;
  if (type === 'arrive') instruction = 'Đã đến điểm tham quan';
  else if (type === 'depart') instruction = 'Bắt đầu đi';
  else if (type === 'roundabout' || type === 'rotary') instruction = 'Đi vào vòng xoay';
  else if (type === 'merge') instruction = 'Nhập vào đường';
  else if (type === 'continue' || type === 'new name') instruction = 'Tiếp tục đi';
  else instruction = directions[modifier] || 'Tiếp tục đi';
  return roadName ? `${instruction} vào ${roadName}` : instruction;
}

function formatRouteDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatRouteDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'dưới 1 phút';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) return 99999;
  const R = 6371e3; // Bán kính trái đất (mét)
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}
