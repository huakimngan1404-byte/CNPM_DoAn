const defaultApiUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
const defaultApiBaseUrl = import.meta.env.DEV ? '' : defaultApiUrl;
const configuredApiUrl = import.meta.env.VITE_API_URL ?? defaultApiBaseUrl;
export const apiBaseUrl = (configuredApiUrl && !/^https?:\/\//i.test(configuredApiUrl)
  ? `https://${configuredApiUrl}`
  : configuredApiUrl).replace(/\/+$/, '');

const adminTokenStorageKey = 'ditichq1-admin-token';

export async function heartbeatVisitor(sessionId) {
  await requestSite('/api/visitors/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function leaveVisitor(sessionId) {
  await requestSite('/api/visitors/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
    keepalive: true,
  });
}

function withAdminToken(options = {}) {
  const token = sessionStorage.getItem(adminTokenStorageKey);
  if (!token) return options;
  return {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  };
}

async function handleExpiredAdminSession(response) {
  if (response.status === 401 && sessionStorage.getItem(adminTokenStorageKey)) {
    sessionStorage.removeItem(adminTokenStorageKey);
    window.dispatchEvent(new Event('ditichq1-admin-auth-expired'));
  }
}

export async function loginAdmin(username, password) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    let message = `Đăng nhập thất bại (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') message = body.detail;
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new Error(message);
  }
  const session = await response.json();
  if (typeof session.access_token !== 'string' || !session.access_token) {
    throw new Error('Backend trả về phiên đăng nhập không hợp lệ.');
  }
  return session;
}

export async function updateAdminCredentials(currentPassword, username, newPassword) {
  const session = await requestSite('/api/auth/credentials', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_password: currentPassword,
      username,
      new_password: newPassword,
    }),
  }, true);
  if (typeof session.access_token !== 'string' || !session.access_token) {
    throw new Error('Backend trả về phiên đăng nhập không hợp lệ.');
  }
  sessionStorage.setItem(adminTokenStorageKey, session.access_token);
  return session;
}

export async function fetchSites() {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api/sites/?lang=vi&include_audio=false`);
  } catch {
    throw new Error(`Không kết nối được Backend tại ${apiBaseUrl || 'địa chỉ proxy hiện tại'}.`);
  }

  if (!response.ok) {
    throw new Error(`Backend phản hồi lỗi (${response.status}).`);
  }

  const records = await response.json();
  if (!Array.isArray(records)) {
    throw new Error('Backend trả về dữ liệu di tích không hợp lệ.');
  }

  const colors = ['mint', 'rose', 'gold', 'blue', 'lilac'];
  return records.map((record, index) => ({
    id: record.code || record._id,
    code: record.code,
    name: record.name,
    category: record.category || 'Di tích lịch sử',
    address: record.address || '',
    description: record.description || '',
    lat: record.lat ?? record.location?.coordinates?.[1] ?? '',
    lng: record.lng ?? record.location?.coordinates?.[0] ?? '',
    isActive: record.is_active !== false,
    languages: ['VI'],
    narrations: 1,
    status: record.is_active === false ? 'Đóng cửa' : 'Mở cửa',
    color: colors[index % colors.length],
    image: record.image_url || '',
  }));
}

async function requestSite(path, options = {}, requiresAdmin = false) {
  let response;
  try {
    response = await fetch(
      `${apiBaseUrl}${path}`,
      requiresAdmin ? withAdminToken(options) : options,
    );
  } catch {
    throw new Error(`Không kết nối được Backend tại ${apiBaseUrl || 'địa chỉ proxy hiện tại'}.`);
  }
  if (requiresAdmin) await handleExpiredAdminSession(response);
  if (!response.ok) {
    let detail = `Backend phản hồi lỗi (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new Error(detail);
  }
  return response.status === 204 ? null : response.json();
}

export async function fetchAdminSites() {
  const records = await requestSite('/api/sites/admin', {}, true);
  if (!Array.isArray(records)) {
    throw new Error('Backend trả về danh sách di tích không hợp lệ.');
  }
  const colors = ['mint', 'rose', 'gold', 'blue', 'lilac'];
  return records.map((record, index) => ({
    id: record.code || record._id,
    code: record.code,
    name: record.name,
    category: record.category || 'Di tích lịch sử',
    address: record.address || '',
    description: record.description || '',
    lat: record.lat ?? record.location?.coordinates?.[1] ?? '',
    lng: record.lng ?? record.location?.coordinates?.[0] ?? '',
    isActive: record.is_active !== false,
    languages: Array.isArray(record.languages)
      ? record.languages
        .filter((language) => typeof language === 'string')
        .map((language) => language.toUpperCase())
      : [],
    status: record.is_active === false ? 'Đóng cửa' : 'Mở cửa',
    color: colors[index % colors.length],
    image: record.image_url || '',
  }));
}

function validateLanguageRecords(records) {
  if (!Array.isArray(records) || records.some((language) => (
    typeof language?.code !== 'string'
    || typeof language?.name !== 'string'
    || typeof language?.flag !== 'string'
    || typeof language?.is_active !== 'boolean'
    || !Number.isInteger(language?.places)
  ))) {
    throw new Error('Backend trả về danh sách ngôn ngữ không hợp lệ.');
  }
  return records;
}

export async function fetchAdminLanguages() {
  return validateLanguageRecords(await requestSite('/api/languages/admin', {}, true));
}

export async function fetchActiveLanguages() {
  return validateLanguageRecords(await requestSite('/api/languages/'));
}

export async function createLanguage(language) {
  return requestSite('/api/languages/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: language.code,
      name: language.name.trim(),
      flag: language.flag.trim(),
    }),
  }, true);
}

export async function updateLanguage(code, language) {
  return requestSite(`/api/languages/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: language.name.trim(),
      flag: language.flag.trim(),
      is_active: language.is_active,
    }),
  }, true);
}

export async function fetchAdminNarrations() {
  const records = await requestSite('/api/narrations/admin', {}, true);
  if (!Array.isArray(records) || records.some((narration) => (
    typeof narration?.site_code !== 'string'
    || typeof narration?.site_name !== 'string'
    || typeof narration?.lang !== 'string'
    || typeof narration?.language_name !== 'string'
    || typeof narration?.description !== 'string'
    || typeof narration?.is_active !== 'boolean'
  ))) {
    throw new Error('Backend trả về danh sách bài thuyết minh không hợp lệ.');
  }
  return records;
}

export async function createNarration(narration) {
  return requestSite('/api/narrations/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_code: narration.site_code,
      lang: narration.lang,
      description: narration.description.trim(),
    }),
  }, true);
}

export async function updateNarration(siteCode, lang, description) {
  return requestSite(`/api/narrations/${encodeURIComponent(siteCode)}/${encodeURIComponent(lang)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: description.trim() }),
  }, true);
}

export async function deleteNarration(siteCode, lang) {
  return requestSite(`/api/narrations/${encodeURIComponent(siteCode)}/${encodeURIComponent(lang)}`, {
    method: 'DELETE',
  }, true);
}

export async function fetchRecentActivity() {
  const records = await requestSite('/api/sites/activity', {}, true);
  if (!Array.isArray(records)) {
    throw new Error('Backend trả về lịch sử hoạt động không hợp lệ.');
  }
  return records;
}

export async function fetchActiveVisitors() {
  const result = await requestSite('/api/visitors/active', {}, true);
  if (!Number.isInteger(result?.active_visitors) || result.active_visitors < 0) {
    throw new Error('Backend trả về số người truy cập trực tiếp không hợp lệ.');
  }
  return result.active_visitors;
}

export async function recordNarrationListen(siteCode, language, device = 'web') {
  return requestSite('/api/listens/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_code: siteCode,
      language,
      device,
    }),
  });
}

export async function fetchListenStats(period, date, device = 'all') {
  const query = new URLSearchParams({ period, date, device });
  const result = await requestSite(`/api/listens/stats?${query}`, {}, true);
  if (!Number.isInteger(result?.total) || !Array.isArray(result?.buckets) || !Array.isArray(result?.top_sites)) {
    throw new Error('Backend trả về thống kê lượt nghe không hợp lệ.');
  }
  return result;
}

function toSitePayload(site) {
  return {
    name: site.name.trim(),
    lat: Number(site.lat),
    lng: Number(site.lng),
    address: site.address.trim(),
    category: site.category,
    description: site.description.trim(),
    is_active: site.status === 'Mở cửa',
  };
}

export async function createSite(site) {
  const payload = toSitePayload(site);
  payload.code = site.code.trim();
  return requestSite('/api/sites/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, true);
}

export async function updateSite(code, site) {
  return requestSite(`/api/sites/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toSitePayload(site)),
  }, true);
}

export async function deleteSite(code) {
  return requestSite(`/api/sites/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  }, true);
}

export async function fetchSiteNarration(siteCode, lang = 'vi') {
  return requestSite(
    `/api/sites/${encodeURIComponent(siteCode)}/narration?lang=${encodeURIComponent(lang)}`,
  );
}
