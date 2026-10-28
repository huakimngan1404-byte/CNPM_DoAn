import { Platform } from 'react-native';
import { sites as fallbackSites } from '../data/heritage';

const defaultApiOrigin = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : Platform.OS === 'android'
        ? 'http://10.0.2.2:8000'
        : 'http://localhost:8000';
const addDefaultProtocol = (value) => (
    /^https?:\/\//i.test(value)
        ? value
        : `${value.includes('localhost') || value.startsWith('10.') ? 'http' : 'https'}://${value}`
);
const configuredApiOrigin = addDefaultProtocol(
    process.env.EXPO_PUBLIC_API_URL || defaultApiOrigin
);
const normalizedApiOrigin = configuredApiOrigin.replace(/\/+$/, '');
const translationUrl = new URL(
    addDefaultProtocol(
        process.env.EXPO_PUBLIC_TRANSLATION_URL || new URL(normalizedApiOrigin).origin
    )
);
if (!process.env.EXPO_PUBLIC_TRANSLATION_URL) translationUrl.port = '8001';
const translationBaseUrl = translationUrl.origin;

export const apiBaseUrl = normalizedApiOrigin.endsWith('/api/sites')
    ? normalizedApiOrigin
    : `${normalizedApiOrigin}/api/sites`;
const apiOrigin = normalizedApiOrigin.replace(/\/api\/sites\/?$/, '');

const parseResponse = async (response) => {
    if (!response.ok) {
        throw new Error(`Backend trả về lỗi HTTP ${response.status}.`);
    }
    return response.json();
};

const updateVisitorSession = async (action, sessionId, keepalive = false) => {
    const response = await fetch(`${apiOrigin}/api/visitors/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
        keepalive,
    });
    if (!response.ok) {
        throw new Error(`Backend trả về lỗi HTTP ${response.status} khi cập nhật phiên truy cập.`);
    }
};

export const heartbeatVisitor = (sessionId) => updateVisitorSession('heartbeat', sessionId);

export const leaveVisitor = (sessionId) => updateVisitorSession('leave', sessionId, true);

export const recordNarrationListen = async (siteCode, language) => {
    const device = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const response = await fetch(`${apiOrigin}/api/listens/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            site_code: siteCode,
            language,
            device,
        }),
    });
    if (!response.ok) {
        throw new Error(`Backend trả về lỗi HTTP ${response.status} khi ghi nhận lượt nghe.`);
    }
};

export const fetchSites = async () => {
    const response = await fetch(apiBaseUrl);
    const records = await parseResponse(response);
    return adaptSiteRecords(records);
};

export const fetchNearbySites = async (lat, lng, lang = 'vi') => {
    const response = await fetch(`${apiBaseUrl}/sync-location`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            user_id: 'mobile_user_01',
            lat,
            lng,
            lang,
        }),
    });
    return parseResponse(response);
};

export const fetchSiteAudio = async (siteCode, lang = 'vi') => {
    const response = await fetch(
        `${translationBaseUrl}/api/audio/${encodeURIComponent(siteCode)}?lang=${encodeURIComponent(lang)}`
    );
    const translation = await parseResponse(response);
    if (!translation.audio_url) {
        throw new Error('Máy chủ chưa trả về đường dẫn audio cho di tích này.');
    }

    const audioPath = new URL(translation.audio_url, `${translationBaseUrl}/`).pathname;
    return {
        ...translation,
        audioUrl: `${translationBaseUrl}${audioPath}`,
    };
};

export const adaptSiteRecords = (records) => {
    let data = records;
    if (records && Array.isArray(records.data)) data = records.data;
    if (records && Array.isArray(records.sites)) data = records.sites;
    if (!Array.isArray(data)) data = fallbackSites;

    return data.map((site) => {
        const coordinates = site.location?.coordinates;
        const latitudeValue = site.latitude ?? site.lat ?? coordinates?.[1];
        const longitudeValue = site.longitude ?? site.lng ?? coordinates?.[0];
        const parsedLatitude = latitudeValue == null ? null : Number(latitudeValue);
        const parsedLongitude = longitudeValue == null ? null : Number(longitudeValue);
        const latitude = Number.isFinite(parsedLatitude) && parsedLatitude >= -90 && parsedLatitude <= 90
            ? parsedLatitude
            : null;
        const longitude = Number.isFinite(parsedLongitude) && parsedLongitude >= -180 && parsedLongitude <= 180
            ? parsedLongitude
            : null;
        const audioUrl = site.audioUrl || site.audio_url;
        const image = site.image || site.image_url;
        const audioPath = audioUrl ? new URL(audioUrl, `${translationBaseUrl}/`).pathname : null;

        return {
            ...site,
            id: String(site.id ?? site._id ?? site.code ?? site.name),
            latitude,
            longitude,
            radius: site.radius ?? site.geofence_radius ?? 100,
            story: site.story || site.description,
            audioUrl: audioPath ? `${translationBaseUrl}${audioPath}` : audioUrl,
            image: image?.startsWith('/')
                ? `${normalizedApiOrigin}${image}`
                : image,
        };
    });
};
