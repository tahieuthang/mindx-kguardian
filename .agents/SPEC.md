# BẢN ĐẶC TẢ KỸ THUẬT (SYSTEM SPECIFICATION)

## Tên dự án: MindX OpsCoPilot (K-Guardian Extension)
**Phiên bản:** 1.0  
**Đối tượng áp dụng:** Đội ngũ IT Helpdesk/Intern - MindX

---

## 1. Tổng Quan Hệ Thống (System Overview)

Hệ thống hỗ trợ chẩn đoán và quản trị tri thức vận hành dành riêng cho nhân sự IT Helpdesk tại MindX khi làm việc trên trang hệ thống nội bộ `https://hrm.mindx.edu.vn`.

* **Client (Chrome Extension):** Giao diện nhúng (Injected Modal) sử dụng kiến trúc hiện đại, tự động đọc bối cảnh (context) của ticket qua DOM để hỗ trợ tra cứu ngữ nghĩa và đóng góp tri thức tại chỗ.
* **Backend (Serverless):** Sử dụng hạ tầng Cloud của Supabase tích hợp extension `pgvector` để lưu trữ cấu trúc dữ liệu và thực hiện tìm kiếm tương đồng (Semantic Search).
* **Workflow Kiểm Duyệt:** Quy trình quản trị tri thức hai bước (Staging Queue -> AI Deduplication Check -> Admin Approve) giúp duy trì kho dữ liệu sạch, chất lượng cao và chống trùng lặp tri thức.

---

## 2. Kiến Trúc Dữ Liệu (Database Schema - Supabase)

Hệ thống yêu cầu kích hoạt extension `pgvector` trên PostgreSQL của Supabase. Cơ sở dữ liệu được chia làm 2 bảng độc lập nhằm phục vụ cơ chế kiểm duyệt.

### 2.1. Bảng chính thức: `knowledge_base`
Nơi lưu trữ các case tri thức đã được kiểm duyệt, là nguồn dữ liệu duy nhất để Extension gọi API tra cứu giải pháp.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Primary Key, Auto Increment | ID duy nhất của bài viết |
| `title` | `text` | Not Null | Tiêu đề ngắn gọn của lỗi/case |
| `content` | `text` | Not Null | Nội dung chi tiết (Nguyên nhân + Hướng xử lý) |
| `reporter` | `text` | Not Null | Tên nhân sự đóng góp bài viết |
| `embedding` | `vector(768)` | Khoảng cách Cosine | Vector ngữ nghĩa sinh ra từ `title` + `content` (Dùng Gemini) |
| `created_at` | `timestamp` | Default: `now()` | Thời gian tạo bản ghi |
| `updated_at` | `timestamp` | Default: `now()` | Thời gian cập nhật bản ghi |

### 2.2. Bảng hàng đợi: `knowledge_queue`
Nơi tiếp nhận các yêu cầu đóng góp tri thức mới từ các user thông qua Extension.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Primary Key, Auto Increment | ID duy nhất của yêu cầu trong hàng đợi |
| `title` | `text` | Not Null | Tiêu đề do user nhập |
| `content` | `text` | Not Null | Nội dung do user nhập (Nguyên nhân + Hướng xử lý) |
| `reporter` | `text` | Not Null | Tên user thực hiện đóng góp |
| `embedding` | `vector(768)` | Khoảng cách Cosine | Vector ngữ nghĩa phục vụ quét trùng lặp |
| `status` | `text` | Default: `'pending'` | Trạng thái kiểm duyệt (`'pending'`, `'approved'`, `'rejected'`) |
| `ai_notes` | `jsonb` | Nullable | Lưu danh sách các Case trùng lặp do Script AI phát hiện |
| `created_at` | `timestamp` | Default: `now()` | Thời gian gửi yêu cầu |

---

## 3. Đặc Tả Tính Năng Trên Extension (Frontend Spec)

Giao diện Extension được thiết kế dưới dạng một Modal hình chữ nhật nhúng trực tiếp vào trang web (Injected Modal) khi user click vào biểu tượng Extension trên Browser. Giao diện chia làm 2 Tab rõ rệt:

### 3.1. Tab 1: Tra cứu Tri thức (Search View)
* **DOM Scraping:** Khi user kích hoạt Extension tại trang chi tiết ticket của `https://hrm.mindx.edu.vn`, hệ thống tự động bóc tách tiêu đề và mô tả của ticket thông qua DOM Selector theo đường dẫn:
    * Bắt đầu quét từ thẻ cha: `div` class `o_portal_wrap` -> thẻ `div` con class `ticket_content` -> thẻ `div` id `card`.
    * Bên trong `div` id `card` có 2 thẻ `div` con là:
        * `div` id `card_header`: Truy cập vào thẻ `span` trong cùng của thẻ `div` này, có class `h3` để lấy tiêu đề ticket (`title`).
        * `div` id `card_body`: Bên trong có thẻ `div` con với attribute `name="description"`, lấy tất cả nội dung text trong thẻ này để làm mô tả ticket (`description`).
* **Embedding Request:** Gộp tiêu đề (`title`) và mô tả (`description`) vừa bóc tách để gửi đến Gemini API chuyển đổi thành chuỗi Vector Embedding (768 chiều).
* **Semantic Search Query:** Extension gọi hàm RPC `match_documents` trên Supabase, truyền chuỗi Vector vào để so sánh khoảng cách Cosine với bảng `knowledge_base`.
* **Render UI:** Trả về danh sách tất cả các case liên quan nhất dưới dạng các thẻ Card (xếp hạng theo độ tương đồng `similarity`).
    * Mỗi Card hiển thị: `title`, `reporter`.
    * Tích hợp hiệu ứng Accordion: Khi click vào một Card bất kỳ sẽ xổ xuống phần `content` hiển thị chi tiết thông tin về **Nguyên nhân** và **Hướng xử lý**.

### 3.2. Tab 2: Đóng góp Tri thức (Contribution View)
* **Giao diện form:** Cung cấp Form nhập liệu chuẩn hóa (Schema Input) gồm 3 trường chính:
    * *Tiêu đề:* `title` (Input text)
    * *Nội dung (Nguyên nhân & Hướng xử lý):* `content` (Textarea)
    * *Người báo cáo:* `reporter` (Input text)
* **Xử lý sự kiện Submit:** Khi user bấm nút gửi:
    1.  Extension gọi Gemini API để tạo Vector Embedding từ `title` + `content` vừa nhập.
    2.  Gọi API `POST` của Supabase để chèn (Insert) toàn bộ dữ liệu thô và Vector vào bảng `knowledge_queue` với trạng thái mặc định là `status = 'pending'`.
    3.  Reset Form và hiển thị thông báo thành công trực quan trên UI.

---

## 4. Kiến Trúc Kỹ Thuật & Cấu Trúc Thư Mục

### 4.1. Tech Stack
* **Bundler/Build Tool:** Vite + `@crxjs/vite-plugin` (Tiêu chuẩn xây dựng Extension Manifest V3, hỗ trợ Hot Module Replacement).
* **Language:** TypeScript (TS) - Đảm bảo chặt chẽ về kiểu dữ liệu khi tương tác với các Object JSON từ API.
* **Framework:** Vue 3 (Composition API) - Quản lý trạng thái các Tab và Render dữ liệu động mượt mà.
* **Styling:** TailwindCSS - Xử lý giao diện Modal, Card, Accordion nhanh chóng, gọn nhẹ.

### 4.2. Cấu trúc thư mục dự kiến
```text
mindx-kguardian/
├── src/
│   ├── content-script/     # Logic chạy ngầm trên trang hrm.mindx.edu.vn
│   │   ├── index.ts        # Kích hoạt nhúng Vue App Modal khi click Extension
│   │   └── dom-parser.ts   # Chuyên trách bóc tách các DOM Selector của trang HRM
│   ├── sidepanel/          # Khung giao diện Modal hình chữ nhật
│   │   ├── App.vue         # Điều hướng chính (Tab 1 & Tab 2)
│   │   ├── main.ts
│   │   └── index.html
│   ├── composables/        # Các hàm logic tái sử dụng
│   │   ├── useSupabase.ts  # Kết nối REST API của Supabase
│   │   └── useGemini.ts    # Kết nối API Embedding của Google
│   └── styles/
│       └── tailwind.css    # Cấu hình Tailwind cho UI Extension
├── manifest.json           # File cấu hình bắt buộc của Chrome Extension V3
├── vite.config.ts          # Cấu hình Vite tích hợp CRXJS
└── tsconfig.json
```

## 5. Đặc Tả Quy Trình Kiểm Duyệt (Admin Moderation Workflow)
Một mã nguồn Script độc lập (chạy môi trường CLI/Local do Admin kích hoạt) chịu trách nhiệm kiểm soát chất lượng và rà soát trùng lặp tự động.

### 5.1. Thuật toán kiểm tra và chú thích (Deduplication Check)
* **Lấy dữ liệu:** Script kết nối Supabase, truy vấn tất cả các hàng có `status = 'pending'` trong bảng `knowledge_queue`.
* **Rà soát chéo bằng AI:** Với mỗi request tìm thấy, lấy giá trị cột `embedding` của nó đem đi gọi hàm SQL `check_duplicate_in_prod` trên Supabase để so sánh với bảng chính thức `knowledge_base`.
* **Tự động ghi chú (Auto-Note):** 
    * Nếu phát hiện có case cũ trong `knowledge_base` đạt độ tương đồng cao (similarity > 0.8), script tự động tổng hợp thông tin (ID bài cũ, Tiêu đề bài cũ, % trùng lặp).
    * Cập nhật thông tin trùng lặp này vào trường `ai_notes` của bản ghi đó ngay trong bảng `knowledge_queue`.

### 5.2. Giao diện duyệt của Admin (Admin Approval CLI/UI)
Hệ thống hiển thị danh sách các bài viết đang đợi duyệt kèm theo thông tin chú thích từ trường `ai_notes` (nếu có) để Admin đánh giá khách quan.

* **Hành động Quyết định (Decision Making):**
    * **Approve (Chấp nhận):** Nếu bài viết đạt chất lượng và không trùng lặp, Admin kích hoạt lệnh Approve. Hệ thống thực hiện một chuỗi Transaction: Chèn bản ghi sạch vào bảng `knowledge_base`, đồng thời cập nhật `status = 'approved'` (hoặc xóa) trong bảng `knowledge_queue`.
    * **Reject (Từ chối):** Nếu bài viết bị trùng hoặc sai format, Admin chọn từ chối, bản ghi chuyển trạng thái `status = 'rejected'`.