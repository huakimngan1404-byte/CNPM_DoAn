import { sites as fallbackSites } from '../data/heritage';

// Địa chỉ IPv4 Backend của bạn
export const apiBaseUrl = 'http://192.168.2.9:8002/api/sites';

// 1. Hàm lấy danh sách di tích (Có bọc lỗi dự phòng)
export const fetchSites = async () => {
    try {
        const response = await fetch(apiBaseUrl);
        const data = await response.json();
        return adaptSiteRecords(data);
    } catch (error) {
        console.log("Lỗi lấy danh sách di tích từ BE, đang dùng dữ liệu dự phòng.");
        return fallbackSites; // Trả về data mẫu nếu BE lỗi
    }
};

// 2. Hàm gửi tọa độ GPS lên Backend
export const fetchNearbySites = async (lat, lng, lang = 'vi') => {
    try {
        const payload = {
            user_id: "mobile_user_01",
            lat: lat,
            lng: lng,
            lang: lang
        };
        
        console.log("Đang gửi tọa độ lên BE:", payload);

        const response = await fetch(`${apiBaseUrl}/sync-location`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        console.log("BE trả lời:", data);
        return data;

    } catch (error) {
        console.error("Lỗi không kết nối được BE:", error);
        return null;
    }
};

// 3. Hàm xử lý dữ liệu thông minh
export const adaptSiteRecords = (records) => {
    let data = records;
    if (records && Array.isArray(records.data)) data = records.data;
    if (records && Array.isArray(records.sites)) data = records.sites;
    if (!Array.isArray(data)) data = fallbackSites; // fallbackSites đã được import từ bài trước

    // Duyệt qua danh sách và gắn IP thật vào file audio/hình ảnh
    return data.map(site => ({
        ...site,
        audioUrl: site.audioUrl?.startsWith('/') 
            ? `http://192.168.2.9:8002${site.audioUrl}` 
            : site.audioUrl,
        image: site.image?.startsWith('/') 
            ? `http://192.168.2.9:8002${site.image}` 
            : site.image
    }));
};