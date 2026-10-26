# Smart Home Web Interface (Fault-Tolerant IoT - Topic 6.1)

Web UI điều khiển và giám sát hệ thống Smart Home chịu lỗi (Fault-Tolerant IoT System), được nhúng trực tiếp vào vi điều khiển **ESP32-S3** thông qua module `web_hoster`.

---

## 1. Cấu trúc thư mục `main/web_hoster/web/`

```
main/web_hoster/web/
├── index.html                  # [Firmware Asset] Trang chủ nhúng vào ESP32 (served at /)
├── style.css                   # [Firmware Asset] CSS stylesheet nhúng vào ESP32 (served at /style.css)
├── app.js                      # [Firmware Asset] JS React bundle nhúng vào ESP32 (served at /app.js)
├── IOT_INTERFACE_CONTRACT.md   # Hợp đồng chuẩn MQTT topics, JSON schemas, WebSocket endpoints
├── UI_RULES.md                 # Quy tắc thiết kế UI/UX & Color Scheme (Nest Smart Home)
├── README.md                   # Tài liệu hướng dẫn này
└── react_app/                  # Toàn bộ mã nguồn React (Vite + Tailwind CSS + Lucide Icons)
    ├── src/                    # Mã nguồn các màn hình, components, context, mock data
    ├── public/                 # Static assets
    ├── package.json            # Dependencies & scripts
    ├── vite.config.js          # Cấu hình build tự động xuất ra thư mục cha (..)
    └── index.html              # HTML template cho chế độ dev (localhost)
```

---

## 2. Cơ chế nhúng vào Firmware ESP-IDF

Module `main/web_hoster/web_hoster.cpp` và `main/CMakeLists.txt` đã cấu hình nhúng 3 file nhị phân vào flash của ESP32:
- `index.html` (MIME: `text/html; charset=utf-8`)
- `style.css` (MIME: `text/css; charset=utf-8`)
- `app.js` (MIME: `application/javascript; charset=utf-8`)

Khi ESP32 khởi động HTTP Server trên cổng 80:
- Người dùng truy cập `http://fault-tolerant-iot.local/` hoặc `http://192.168.x.x/` sẽ tải toàn bộ ứng dụng web một trang (SPA) chạy mượt mà ngay trên vi điều khiển.
- Các kỹ sư firmware **không cần cài đặt Node.js hay npm**; chỉ cần chạy `idf.py build flash` là firmware đã tích hợp sẵn giao diện mới nhất.

---

## 3. Dành cho lập trình viên Web (Frontend Development)

Nếu bạn muốn thay đổi giao diện, thêm tính năng hoặc sửa mã nguồn React:

### Bước 1: Cài đặt thư viện
```bash
cd main/web_hoster/web/react_app
npm install
```

### Bước 2: Chạy môi trường phát triển (Hot Reloading)
```bash
npm run dev
```
Mở trình duyệt tại `http://localhost:5173` để chỉnh sửa giao diện với phản hồi tức thì.

### Bước 3: Build đóng gói cho ESP32
```bash
npm run build
```
Lệnh này sẽ tự động biên dịch toàn bộ code React và cập nhật trực tiếp 3 file:
- `../index.html`
- `../style.css`
- `../app.js`

Sau đó, chỉ cần commit và nạp lại vào ESP32!

---

## 4. Các màn hình chính (Screens)
1. **S1: Dashboard Overview** - Giám sát toàn bộ trạng thái nguồn lưới / UPS, CB, mạng, các phòng.
2. **S2: Room Detail Control** - Bật tắt đèn, quạt, khóa cửa NFC, xem nhiệt độ, độ ẩm từng phòng.
3. **S3: Network & Connectivity Diagnostics** - Ping, RSSI, trạng thái House Wi-Fi / ESP32 Fallback AP, MQTT broker.
4. **S4: Local Fallback Monitor** - Giám sát chế độ ngoại tuyến khi mất Internet / mất điện lưới.
5. **S5: Cloud Synchronization** - Kiểm tra hàng đợi đồng bộ Firebase (10 phút/lần hoặc tức thì khi có sự cố).
6. **S6: Research Experiment Lab** - Công cụ giả lập sự cố (mất mạng, mất điện, nhảy CB) và xuất log CSV phục vụ báo cáo Topic 6.1.

