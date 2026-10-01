# BOT TELEGRAM ĐỊNH LƯỢNG THỰC CHIẾN // PHẠM ANH KHÔI (v5.2 PRO)

Hệ thống Bot Telegram tự động bắt cầu định lượng Tài Xỉu & MD5 thế hệ mới phát triển bởi **Phạm Anh Khôi** (Telegram: [@anhkhoi_xabc](https://t.me/anhkhoi_xabc)).

---

## 🔑 Thông Tin Cấu Hình Sẵn
* **Bot Token**: `8724702628:AAFPupnoByVjoniPajBWp4K36QE5uziw4LI`
* **Admin ID**: `6094686933` (Đã được cấu hình tự động nhận quyền Admin Tối Cao)
* **Master Setup Key**: `anhkhoi_xabc2102` (Dùng để kích hoạt quyền admin nếu đổi tài khoản)
* **Ngôn ngữ**: 100% Tiếng Việt thân thiện, chuyên nghiệp.

---

## 🚀 Các Tính Năng Nổi Bật

### 1. Phân Quyền Chặt Chẽ (Admin Tối Cao & Thành Viên Có Key)
* **Quyền hạn Admin Tối Cao**:
  * Tạo key bản quyền linh hoạt theo giờ, theo ngày hoặc vĩnh viễn:
    * `/taokey 1h` ➔ Tạo key dùng thử 1 giờ
    * `/taokey 12h` ➔ Tạo key 12 giờ
    * `/taokey 1d` ➔ Tạo key 1 ngày
    * `/taokey 7d 3` ➔ Tạo 3 key 7 ngày cùng lúc
    * `/taokey 30d` ➔ Tạo key 30 ngày
    * `/taokey vv` ➔ Tạo key vĩnh viễn (Lifetime)
    *(Có thể bấm tạo trực tiếp trên giao diện nút bấm Inline của Admin).*
  * Quản lý & tra cứu danh sách key: `/danhsachkey`
  * Thu hồi / xóa key lập tức: `/xoakey <mã_key>`
  * Gia hạn thời gian sử dụng trực tiếp cho thành viên: `/giahan <user_id> <thời_gian>`
  * Xem thống kê toàn hệ thống: `/thongke`
  * Phát tin nhắn thông báo (Broadcast) đến toàn bộ thành viên: `/thongbao <nội_dung>`
* **Người dùng thông thường**:
  * Khi chưa kích hoạt: Tuyệt đối không xem được bất kỳ dữ liệu dự đoán hay menu quản trị nào.
  * Kích hoạt bằng lệnh: `/key <mã_key>`
  * Khi đã có key hợp lệ: Được xem dự đoán Bàn Hũ, Bàn MD5, thống kê 30 phiên, và bật/tắt nhận báo kèo tự động.

### 2. Tự Động Báo Kèo Từng Bàn Độc Lập ("Bật Cái Gì Chạy Đó, Không Loạn")
* Thành viên có 2 công tắc độc lập ngay trên Menu:
  * `⚡ Tự Báo Hũ: [ BẬT 🟢 / TẮT 🔴 ]`
  * `⚡ Tự Báo MD5: [ BẬT 🟢 / TẮT 🔴 ]`
* **Cơ chế tách bạch**: Khi bàn Hũ ra phiên mới, bot **chỉ gửi thông báo cho những ai bật Hũ**; khi bàn MD5 ra phiên mới, bot **chỉ gửi cho người bật MD5**. Tiêu đề và nội dung phân biệt rõ ràng, không bao giờ bị lẫn lộn giữa 2 bàn.

### 3. Thuật Toán Bắt Cầu Đa Tầng Cực Xịn
* Khắc phục triệt để lỗi so sánh "TÀI" vs "TAI" (tỷ lệ thắng hiển thị chuẩn xác 75% - 85%).
* Đồng bộ phiên thời gian thực từ sàn tele68, không có phiên ảo hay nhảy số lạ khi treo máy.
* Phân tích nhịp cầu bệt (3-8 tay), cầu đảo 1-1, song hành 2-2, bậc thang 1-2-3, 3-2-1, cầu kẹp 2-1-2, mô hình chuyển trạng thái Markov và hồi quy điểm số xúc xắc quanh mốc 10.5.

---

## 🛠️ Hướng Dẫn Chạy & Triển Khai Render.com

### Chạy cục bộ:
```bash
node bot.js
```

### Triển khai lên Render.com:
1. Đưa toàn bộ thư mục lên GitHub.
2. Tại Render.com -> Chọn **New +** -> **Web Service** (hoặc Background Worker).
3. Cấu hình:
   * **Runtime**: `Node`
   * **Start Command**: `node bot.js`
   * **Environment Variables**:
     * `BOT_TOKEN`: `8724702628:AAFPupnoByVjoniPajBWp4K36QE5uziw4LI`
     * `ADMIN_ID`: `6094686933`
4. Bấm **Deploy**. Bot tích hợp sẵn cổng HTTP phục vụ Health Check của Render nên sẽ online 24/7!
