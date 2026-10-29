// Ngôn ngữ giao diện mặc định; danh sách ngôn ngữ audio được tải từ Backend.
export const languages = [
    { id: 'vi', flag: '🇻🇳', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
    { id: 'en', flag: '🇬🇧', name: 'English', nativeName: 'English' },
    { id: 'ja', flag: '🇯🇵', name: 'Japanese', nativeName: '日本語' },
    { id: 'zh', flag: '🇨🇳', name: 'Chinese', nativeName: '中文' },
    { id: 'fr', flag: '🇫🇷', name: 'French', nativeName: 'Français' }
];

// 2. Danh sách điểm tham quan mặc định trong Quận 1
export const sites = [
    {
        id: 'ben_nha_rong',
        code: 'ben-nha-rong',
        name: 'Bến Nhà Rồng',
        latitude: 10.7687,
        longitude: 106.7066,
        radius: 50,
        address: '01 Nguyễn Tất Thành, Quận 1',
        category: 'Di tích lịch sử',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/ben-nha-rong.jpg' }, 
        color: '#F04D2E',
        description: 'Chào mừng bạn đến với Bến Nhà Rồng, một địa điểm gắn liền với hành trình tìm đường cứu nước của Nguyễn Tất Thành. Ngày 5 tháng 6 năm 1911, từ thương cảng Sài Gòn, người thanh niên ấy rời Tổ quốc trên con tàu Amiral Latouche-Tréville. Sự kiện này mở đầu cho chặng đường dài bôn ba, học hỏi và hoạt động cách mạng ở nhiều quốc gia. Công trình ban đầu được xây dựng làm trụ sở của hãng vận tải biển Messageries Maritimes, nổi bật với kiến trúc kết hợp giữa phong cách phương Tây và các chi tiết trang trí phương Đông, đặc biệt là hình rồng trên mái. Ngày nay, nơi đây là Bảo tàng Hồ Chí Minh - Chi nhánh Thành phố Hồ Chí Minh, lưu giữ hình ảnh, tư liệu và hiện vật về cuộc đời hoạt động của Chủ tịch Hồ Chí Minh. Khi đứng bên sông Sài Gòn, bạn có thể hình dung khung cảnh bến cảng đầu thế kỷ trước và câu chuyện về quyết tâm ra đi để tìm con đường độc lập cho dân tộc.'
    },
    {
        id: 'dinh_doc_lap',
        code: 'dinh-doc-lap',
        name: 'Dinh Độc Lập',
        latitude: 10.777022,
        longitude: 106.69525,
        radius: 50,
        address: '135 Nam Kỳ Khởi Nghĩa, Quận 1',
        category: 'Di tích lịch sử',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/dinh-doc-lap.jpg' }, 
        description: 'Dinh Độc Lập, còn được gọi là Hội trường Thống Nhất, là một địa chỉ quan trọng để tìm hiểu lịch sử hiện đại Việt Nam. Công trình hiện nay do kiến trúc sư Ngô Viết Thụ thiết kế và được xây dựng trong thập niên 1960 trên khu đất từng có Dinh Norodom. Không gian bên trong gồm nhiều phòng tiếp khách, phòng họp và khu vực làm việc, được tổ chức quanh các khoảng sân và hành lang rộng. Kiến trúc của dinh kết hợp cách bố trí hiện đại với những gợi ý từ triết lý phương Đông, thể hiện qua hình khối và các chi tiết trang trí. Ngày 30 tháng 4 năm 1975, xe tăng tiến vào dinh; sự kiện này gắn với thời khắc kết thúc chiến tranh và đất nước thống nhất. Trong chuyến tham quan, bạn hãy để ý những hiện vật, căn phòng và dấu tích được bảo tồn tại chỗ: mỗi nơi kể một lát cắt khác nhau về đời sống chính trị và bối cảnh của Sài Gòn trong thế kỷ 20.'
    },
    {
        id: 'nha_tho_duc_ba',
        code: 'nha-tho-duc-ba-sai-gon',
        name: 'Nhà thờ Đức Bà Sài Gòn',
        latitude: 10.779783,
        longitude: 106.699018,
        radius: 50,
        address: '01 Công xã Paris, Quận 1',
        category: 'Di tích kiến trúc',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/nha-tho-duc-ba.jpg' }, 
        description: 'Nhà thờ Đức Bà Sài Gòn nằm giữa quảng trường Công xã Paris, ngay trung tâm thành phố. Công trình được xây dựng vào cuối thế kỷ 19, với vật liệu và nhiều chi tiết kiến trúc mang ảnh hưởng châu Âu. Hai tháp chuông cao là dấu mốc dễ nhận ra từ các tuyến đường xung quanh; phía trước nhà thờ là quảng trường rộng, nơi người dân và du khách thường dừng chân. Hãy quan sát mặt tiền, những ô cửa và bố cục cân xứng của công trình để cảm nhận phong cách kiến trúc tôn giáo thời kỳ đó. Nhà thờ cũng là một phần của quần thể di sản đô thị gần Bưu điện Trung tâm và đường Đồng Khởi, giúp bạn hình dung diện mạo khu trung tâm Sài Gòn qua nhiều giai đoạn. Công trình có thể đang được bảo tồn, tu sửa hoặc hạn chế tiếp cận ở một số khu vực; bạn nên quan sát từ không gian công cộng và tuân thủ các hướng dẫn tại chỗ.'
    },
    {
        id: 'buu_dien_trung_tam',
        code: 'buu-dien-trung-tam-sai-gon',
        name: 'Bưu điện Trung tâm Sài Gòn',
        latitude: 10.779729,
        longitude: 106.699586,
        radius: 50,
        address: '02 Công xã Paris, Quận 1',
        category: 'Di tích kiến trúc',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/buu-dien-trung-tam-sai-gon.jpg' }, 
        description: 'Bưu điện Trung tâm Sài Gòn là một công trình công cộng lâu đời vẫn nằm giữa nhịp sống của Quận 1. Được xây dựng vào cuối thế kỷ 19, tòa nhà gây ấn tượng với mặt tiền rộng, đồng hồ lớn và những ô cửa vòm. Bước vào bên trong, bạn sẽ thấy không gian mái vòm cao, các quầy giao dịch và những bản đồ cổ trang trí trên tường. Kiến trúc vừa phục vụ công năng bưu chính vừa cho thấy cách người ta tổ chức các công trình đô thị trong giai đoạn Sài Gòn phát triển thành một trung tâm thương mại. Ngày nay, nơi đây vẫn là điểm tham quan được nhiều người ghé thăm và là địa chỉ gửi thư, bưu phẩm. Bạn có thể dành ít phút quan sát các chi tiết sắt, gỗ và bảng chỉ dẫn, đồng thời lưu ý giữ lối đi thông thoáng để hoạt động của bưu điện không bị ảnh hưởng.'
    },
    {
        id: 'nha_hat_thanh_pho',
        code: 'nha-hat-thanh-pho',
        name: 'Nhà hát Thành phố',
        latitude: 10.77649,
        longitude: 106.70331,
        radius: 50,
        address: '07 Công trường Lam Sơn, Quận 1',
        category: 'Di tích kiến trúc',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/nha-hat-thanh-pho.jpg' }, 
        description: 'Nhà hát Thành phố, thường được gọi là Nhà hát Lớn, được khánh thành năm 1900 tại quảng trường Lam Sơn. Mặt tiền mang phong cách kiến trúc châu Âu cuối thế kỷ 19, với các chi tiết trang trí và bậc thềm hướng ra quảng trường. Qua thời gian, công trình có những giai đoạn được sử dụng cho nhiều mục đích khác nhau, trước khi trở lại với chức năng biểu diễn nghệ thuật. Ngày nay, nhà hát là địa điểm tổ chức các chương trình sân khấu, âm nhạc và sự kiện văn hóa. Nếu có dịp vào xem biểu diễn, bạn sẽ cảm nhận rõ hơn không gian khán phòng và lịch sử hoạt động của nơi này; nếu chỉ tham quan bên ngoài, hãy quan sát sự tương phản giữa công trình cổ và những tuyến phố sôi động xung quanh. Nhà hát cũng nằm gần phố đi bộ Nguyễn Huệ, vì vậy đây là điểm dừng thuận tiện trong hành trình khám phá trung tâm thành phố.'
    },
    {
        id: 'cho_ben_thanh',
        code: 'cho-ben-thanh',
        name: 'Chợ Bến Thành',
        latitude: 10.77249,
        longitude: 106.698083,
        radius: 50,
        address: 'Lê Lợi, Quận 1',
        category: 'Di sản đô thị',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/cho-ben-thanh.jpg' }, 
        description: 'Chợ Bến Thành là một trong những hình ảnh quen thuộc nhất của Thành phố Hồ Chí Minh. Ngôi chợ hiện nay được khánh thành năm 1914, sau quá trình đô thị mở rộng và hình thành những tuyến phố mới ở trung tâm. Cổng chính nhìn ra quảng trường Quách Thị Trang nổi bật với tháp đồng hồ, thường được xem là dấu hiệu nhận diện của khu chợ. Bên trong, các lối đi tập trung nhiều quầy hàng thực phẩm, đồ thủ công, quần áo và đặc sản địa phương. Chợ vừa là nơi mua bán thường ngày vừa là điểm gặp gỡ của du khách muốn tìm hiểu nhịp sống thương mại của thành phố. Khi tham quan, bạn có thể hỏi giá trước khi mua, chú ý bảo quản tư trang và để ý lối đi đông người. Nếu không định mua sắm, chỉ cần dừng lại quan sát cổng chợ và dòng người qua lại cũng đủ cảm nhận sự nhộn nhịp rất riêng của khu vực này.'
    },
    {
        id: 'bao_tang_thanh_pho',
        code: 'bao-tang-thanh-pho-ho-chi-minh',
        name: 'Bảo tàng Thành phố Hồ Chí Minh',
        latitude: 10.77564,
        longitude: 106.6998,
        radius: 50,
        address: '65 Lý Tự Trọng, Quận 1',
        category: 'Bảo tàng',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/bao-tang-Ho-Chi-Minh.jpg' }, 
        description: 'Bảo tàng Thành phố Hồ Chí Minh nằm trong một tòa nhà cổ ở trung tâm Quận 1, gần các tuyến đường Lý Tự Trọng và Nam Kỳ Khởi Nghĩa. Bản thân kiến trúc của tòa nhà đã là một phần đáng chú ý trong chuyến tham quan: hãy quan sát mặt đứng, hành lang và những khoảng không gian rộng bên trong. Các phòng trưng bày giới thiệu nhiều chủ đề về lịch sử hình thành, đời sống văn hóa, kinh tế và quá trình phát triển của thành phố qua các thời kỳ. Tư liệu, hình ảnh và hiện vật giúp kết nối những biến đổi của Sài Gòn với câu chuyện của người dân nơi đây. Bạn có thể chọn một chủ đề mình quan tâm để xem kỹ thay vì cố gắng đi thật nhanh qua toàn bộ không gian. Khi tham quan, hãy tuân theo quy định về chụp ảnh và bảo vệ hiện vật. Đây là điểm dừng phù hợp để hiểu thêm bối cảnh lịch sử phía sau những con phố hiện đại của thành phố.'
    },
    {
        id: 'bao_tang_ton_duc_thang',
        code: 'bao-tang-ton-duc-thang',
        name: 'Bảo tàng Tôn Đức Thắng',
        latitude: 10.782651,
        longitude: 106.704322,
        radius: 50,
        address: '05 Tôn Đức Thắng, Quận 1',
        category: 'Bảo tàng',
        image: { uri: 'https://raw.githubusercontent.com/huakimngan1404-byte/CNPM_DoAn/main/DoAn/FE/APP/thuyet-minh-app/assets/img/bao-tang-Ton-Duc-Thang.jpg' }, 
        description: 'Bảo tàng Tôn Đức Thắng dành riêng không gian giới thiệu cuộc đời và sự nghiệp của Chủ tịch Tôn Đức Thắng, người sinh ra tại cù lao Ông Hổ, tỉnh An Giang. Qua hình ảnh, tư liệu và hiện vật, khách tham quan có thể theo dõi các chặng đường hoạt động của ông, từ tuổi trẻ, thời gian tham gia phong trào công nhân đến những năm tháng đảm nhiệm các trọng trách của đất nước. Cách trưng bày giúp câu chuyện cá nhân được đặt trong bối cảnh lịch sử rộng hơn, đồng thời nhấn mạnh những phẩm chất thường được nhắc đến như sự giản dị và tinh thần gắn bó với người lao động. Khi đi qua từng phòng, bạn có thể dành thời gian đọc chú thích để hiểu vì sao mỗi hiện vật được lưu giữ và câu chuyện nào được kể lại. Bảo tàng là một điểm tham quan yên tĩnh bên bờ sông Sài Gòn, bổ sung góc nhìn về lịch sử và con người cho hành trình khám phá Quận 1.'
    }
];