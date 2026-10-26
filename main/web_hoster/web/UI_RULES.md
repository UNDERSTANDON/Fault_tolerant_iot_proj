# BỘ LUẬT BẤT DI BẤT DỊCH PHÁT TRIỂN GIAO DIỆN FRONTEND (UI_RULES.md)

> **Dự án**: Nghiên cứu giao diện chịu lỗi khi mất kết nối Internet trong nhà thông minh  
> **Mã đề tài**: 6.1 — Computing Research Project  
> **Phạm vi áp dụng**: Toàn bộ mã nguồn Frontend (`smart-home`)  
> **Hiệu lực**: Vĩnh viễn và bắt buộc tuân thủ 100% trước, trong và sau mọi thao tác lập trình.

---

## LỜI TUYÊN THỆ & CAM KẾT TUÂN THỦ (COMMITMENT)

Tất cả các lượt tạo mới, chỉnh sửa, tái cấu trúc (refactor) hoặc tích hợp tính năng trên mã nguồn giao diện này **BẮT BUỘC** phải tuân thủ nghiêm ngặt các điều luật dưới đây. 

Tuyệt đối không được vì thêm tính năng mới mà làm thay đổi hoặc gây lỗi cho giao diện đã hoàn thiện trước đó (**Zero UI Regressions**). Nếu một thay đổi vi phạm bất kỳ điều luật nào trong tài liệu này, thay đổi đó bị coi là **không hợp lệ** và phải được hủy bỏ hoặc sửa lại ngay lập tức.

---

## CHƯƠNG I: CÁC ĐIỀU LUẬT CHỐNG HỒI QUY & BẢO VỆ LAYOUT

### Điều 1: Đóng băng Khung giao diện (App Shell Invariance)
1. **Cấu trúc khung chính (App Shell)** bao gồm: Header trạng thái kết nối, Thanh điều hướng (nếu có), Lưới hiển thị các phòng (Dashboard Grid) và Khung Footer sau khi đã định hình và duyệt sẽ được coi là **BẤT BIẾN**.
2. Khi can thiệp vào một component con (ví dụ: công tắc đèn, thẻ cảm biến), **nghiêm cấm** thay đổi cấu trúc thẻ cha, wrapper, flexbox hoặc CSS Grid của trang chính.
3. Không được tự ý thay đổi padding/margin của khung bao ngoài (`main`, `container`, `section`) khi chỉ có yêu cầu chỉnh sửa nội dung bên trong.

### Điều 2: Cách ly CSS tuyệt đối (CSS Scoping & Isolation)
1. **Tuyệt đối cấm** viết các class mang tên chung chung (như `.card`, `.btn`, `.title`, `.active`, `.icon`, `.status`) vào các file CSS toàn cục (`index.css`, `App.css`).
2. Mọi component phải sử dụng cơ chế đóng gói phạm vi kiểu dáng:
   * **Ưu tiên hàng đầu**: Sử dụng **CSS Modules** (`[ComponentName].module.css`) cho từng component.
   * Hoặc áp dụng tiền tố BEM nghiêm ngặt mang tên component: `.sh-room-card__title`, `.sh-device-switch--active`.
3. Việc sửa style của một component chỉ được phép diễn ra trong file CSS thuộc về component đó, bảo đảm 100% không ảnh hưởng chéo đến các thành phần khác.

### Điều 3: Nguyên tắc Mở rộng không Phá hủy (Non-Destructive Refactoring)
1. Khi bổ sung tính năng mới (ví dụ: thêm cảm biến độ ẩm vào phòng bếp), phải thực hiện theo nguyên tắc **mở rộng (Extend)**:
   * Bổ sung component mới vào vị trí quy định.
   * Không sửa đổi, không xóa, không viết lại các hàm và component đang chạy ổn định của các phòng khác.
2. Giữ nguyên tất cả các thuộc tính định danh (`id`, `key`, `data-testid`) đã được gắn cho các phần tử UI.

---

## CHƯƠNG II: HỆ THỐNG DESIGN TOKENS & MÀU SẮC NGỮ NGHĨA BẤT BIẾN

### Điều 4: Tập trung hóa thông số thiết kế (Design Tokens)
1. Mọi biến màu sắc, khoảng cách (spacing), bán kính bo góc (border-radius), kiểu chữ (typography) và hiệu ứng đổ bóng (box-shadow) phải được khai báo tập trung tại `src/styles/variables.css`.
2. **Cấm tuyệt đối** việc gõ mã màu cứng (hardcoded hex/rgb như `#ffffff`, `#ff0000`, `rgb(...)`) hay khoảng cách tùy ý (như `margin: 17px`) rải rác trong code. Phải luôn dùng biến CSS chuẩn: `var(--color-...)`, `var(--spacing-...)`.

### Điều 5: Ma trận màu sắc trạng thái kết nối (Connection State Palette)
Hệ thống màu sắc thể hiện các trạng thái mạng được **khóa cứng** theo bảng chuẩn sau, không được phép thay đổi:

| Trạng thái | Ý nghĩa ngữ nghĩa | Tên biến CSS | Mã màu chuẩn | Mục đích UI |
| :--- | :--- | :--- | :--- | :--- |
| **NORMAL** | Mạng bình thường, Online | `--state-normal` | `#10B981` (Emerald Green) | Chấm xanh, badge "ONLINE", hệ thống ổn định |
| **SWITCHING**| Vừa mất Internet, đang dò LAN | `--state-switching` | `#0284C7` (Sky Blue) | Spinner, thông báo chuyển tiếp |
| **LOCAL** | Chế độ chịu lỗi (Mất Internet, còn LAN) | `--state-local` | `#F59E0B` (Amber Orange) | **Banner cảnh báo nổi bật**, badge "LOCAL MODE" |
| **RECONNECTING**| Internet đã phục hồi, đang kết nối lại | `--state-reconnecting`| `#6366F1` (Indigo) | Badge đang khôi phục |
| **UNAVAILABLE**| Mất toàn bộ (Hỏng LAN/Mất thiết bị) | `--state-unavailable` | `#EF4444` (Rose Red) | Báo lỗi, làm mờ thiết bị mất kết nối |

---

## CHƯƠNG III: KIẾN TRÚC PHÂN TÁCH GIAO DIỆN & DỮ LIỆU

### Điều 6: Phân tách Pure Presentational và Logic Hooks
1. **Tầng Giao Diện Thuần (Presentational Components)**:
   * Các component như `DeviceControl`, `SensorCard`, `RoomCard`, `ModeBanner`, `ConnectionStatus` chỉ là giao diện hiển thị.
   * Các component này **chỉ nhận dữ liệu qua `props`** (ví dụ: `name`, `status`, `value`, `unit`, `onToggle`, `disabled`).
   * **Tuyệt đối cấm** viết logic kết nối MQTT, API fetch, WebSocket hoặc `setTimeout` phức tạp trực tiếp bên trong các component hiển thị này.
2. **Tầng Dữ Liệu & Kết Nối (Container / Custom Hooks)**:
   * Mọi logic xử lý trạng thái mạng, tính toán chuyển mode, gửi nhận lệnh MQTT/API phải được đặt trong các custom hooks (`useDevices`, `useConnectionStatus`) hoặc state management riêng biệt (`src/services/`, `src/hooks/`).
   * *Mục đích*: Khi chuyển từ Mock Data sang kết nối ESP32/MQTT thật, giao diện UI không bị xê dịch hay thay đổi dù chỉ 1 pixel.

### Điều 7: Nguyên tắc Mock-First & Safe-Fallback (Không bao giờ sập)
1. Toàn bộ giao diện phải chạy hoàn chỉnh và trực quan với **Mock Data** trước khi kết nối phần cứng.
2. Cấu trúc cấu hình phải có cờ bật tắt: `VITE_USE_MOCK_DATA = true/false`.
3. Giao diện **không bao giờ được phép trắng màn hình (crash)** khi mất kết nối mạng hoặc khi ESP32 chưa phản hồi:
   * Nếu dữ liệu cảm biến chưa về: Hiển thị giá trị gần nhất kèm nhãn `(stale)` hoặc dấu `--`.
   * Luôn có thông báo trạng thái rõ ràng thay vì để giao diện bị treo.

---

## CHƯƠNG IV: QUY TẮC BẤT BIẾN VỀ CHỊU LỖI & PHẠM VI MÔ HÌNH PHÒNG

### Điều 8: Quy tắc Ứng xử Giao diện ở Chế độ Chịu Lỗi (Local Mode Contract)
1. **Không khóa chức năng hợp lệ**: Khi hệ thống chuyển sang `LOCAL MODE` (mất Internet nhưng LAN còn hoạt động), **tuyệt đối KHÔNG ĐƯỢC disable các nút bật/tắt đèn, quạt trong nhà**. Người dùng vẫn phải bấm điều khiển được bình thường qua mạng cục bộ.
2. **Hiển thị minh bạch**: Bắt buộc phải có `ModeBanner` nổi bật thông báo rõ:
   * Lý do: *"Mất kết nối Internet"*.
   * Tình trạng: *"Đang duy trì điều khiển nội bộ (Local LAN Control)"*.
3. **Chỉ khóa thiết bị khi thật sự UNAVAILABLE**: Nút điều khiển chỉ bị `disabled` và làm mờ (opacity giảm, có icon gạch chéo) khi thiết bị đó thực sự mất kết nối LAN hoặc phần cứng offline.

### Điều 9: Khóa Phạm vi Mô hình Phòng (Model Scope Lock)
Bám sát mô hình thiết kế căn hộ 20×20 cm cho 1 người ở, các phòng và thiết bị sau là **cố định**, không tự ý vẽ thêm thiết bị ngoài phạm vi:
* **Hành lang / Cửa chính**: Đèn hành lang, Khóa cửa NFC, Nguồn dự phòng UPS.
* **Phòng khách**: Đèn trần, Quạt, Cảm biến khói & nhiệt độ, Access Point / ESP32 Gateway.
* **Phòng bếp**: Đèn bếp, Cảm biến nhiệt, Cảm biến khói, Cảm biến độ ẩm.
* **Phòng ngủ**: Đèn phòng ngủ, Cảm biến nhiệt, Cảm biến khói.

Mỗi phòng hiển thị dưới dạng một `RoomCard` độc lập. Việc thêm bớt thông tin cảm biến trong một phòng không được làm xô lệch kích thước thẻ của các phòng còn lại.

### Điều 10: Cô lập Bảng Thử nghiệm Lỗi (Test Mode / Fault Simulation Isolation)
1. Để phục vụ mục tiêu nghiên cứu của đề tài (đo thời gian chuyển mode, tỷ lệ lệnh thành công khi rút mạng), dự án sẽ có bảng điều khiển giả lập lỗi (Fault Simulation Panel).
2. Bảng điều khiển này **BẮT BUỘC phải được cô lập**:
   * Đặt tại một Drawer ẩn ở cạnh màn hình, một thanh công cụ thu gọn ở đáy trang (Bottom Bar) hoặc một trang riêng `/test`.
   * **Tuyệt đối không nhúng các nút giả lập lỗi vào giữa Dashboard của người dùng**, bảo đảm giao diện chính giữ nguyên tính thực tế của một hệ thống thương mại.

---

## CHƯƠNG V: QUY TRÌNH KIỂM TRA CHỐNG HỒI QUY & NGÔN NGỮ CHUẨN HÓA

### Điều 11: Ngôn ngữ Giao diện Chuẩn hóa Tiếng Anh (English UI Exclusivity - BẮT BUỘC)
1. **Toàn bộ văn bản hiển thị trên giao diện người dùng (UI)** bao gồm: Tiêu đề trang, tên phòng, tên thiết bị, tên cảm biến, nhãn trạng thái (badges), nội dung thông báo (toast notifications), banner cảnh báo, các nút bấm thao tác và bảng đo lường kiểm thử nghiên cứu **BẮT BUỘC 100% PHẢI SỬ DỤNG TIẾNG ANH CHUYÊN NGÀNH**.
2. Không sử dụng tiếng Việt hoặc ngôn ngữ hỗn hợp trên giao diện frontend (phù hợp với chuẩn báo cáo nghiên cứu học thuật quốc tế của BTEC).

### Điều 12: Checklist Nghiệm Thu Bắt Buộc Trước Khi Hoàn Thành Nhiệm Vụ
Trước khi đánh dấu hoàn thành bất kỳ nhiệm vụ hoặc chuyển giao code mới, phải kiểm tra đầy đủ 5 tiêu chí:

- [ ] **1. English UI Check (Kiểm tra ngôn ngữ)**: Tất cả chữ hiển thị trên màn hình đều là tiếng Anh chuẩn mực, không còn sót tiếng Việt.
- [ ] **2. Visual Check (Kiểm tra hiển thị)**:
  * Giao diện `NORMAL MODE` có giữ nguyên bố cục ban đầu không?
  * Kích thước, khoảng cách các Card phòng có bị lệch không?
- [ ] **3. Fault Mode Check (Kiểm tra chịu lỗi)**:
  * Chuyển sang `LOCAL MODE`: Banner cảnh báo có hiện đúng vị trí và màu sắc không? Các nút bật/tắt có còn bấm được không?
- [ ] **4. Build & Syntax Check (Kiểm tra biên dịch)**:
  * Chạy lệnh `npm run build` thành công, không phát sinh lỗi hoặc cảnh báo nghiêm trọng.
- [ ] **5. Console Cleanliness (Kiểm tra lỗi ngầm)**:
  * Mở F12 Console của trình duyệt, không xuất hiện lỗi đỏ (`Uncaught Error`, `Warning`).

---

**TÀI LIỆU NÀY LÀ KHUÔN VÀNG THƯỚC NGỌC CHO MỌI THAO TÁC LẬP TRÌNH FRONTEND TRONG TOÀN BỘ DỰ ÁN.**

