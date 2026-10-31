# MuScriptor service

Chép nhạc **đa nhạc cụ** cho lớp "nhạc cụ" của melody v2. Mỗi nốt có nhãn nhạc cụ, theo 36 nhóm MT3_FULL_PLUS. Lớp vocal **không** dùng service này; lớp đó chạy SCNet → Basic Pitch trong `sheetsage/`.

| | |
|---|---|
| Model | `MuScriptor/muscriptor-medium`, revision `f322369`, khoảng 300M tham số |
| Code | `muscriptor/muscriptor` commit `8a1ef88`, giấy phép MIT |
| Giấy phép weights | **CC BY-NC 4.0**: không dùng thương mại |
| GPU | VRAM torch đỉnh khoảng 2.3 GB (F32). Tốc độ 0.1–0.9 lần thời lượng bài |
| Cổng | 8084 (chỉ trong mạng Docker) |

## Điều khoản gate (đọc trước khi dùng)

Model bị gate. Điều kiện sử dụng ghi:

> "Prohibited uses include … inputting music files and transcribing them to MIDI/music sheet without having all the necessary rights".

Chạy MuScriptor trên bài nhạc mà bạn không có quyền thì trái điều khoản này, kể cả khi app không thương mại. Rủi ro này đã được chấp nhận khi chọn MuScriptor (xem `eval_sandbox/REPORT.md` mục 4.9 và mục 6).

## Weights

Weights không nằm trong image. Cách lấy:

1. Đồng ý điều khoản tại https://huggingface.co/MuScriptor/muscriptor-medium.
2. `hf auth login`
3. `cd muscriptor && python download_weights.py`
   - Hoặc copy từ bản đã có: `python download_weights.py --from ../eval_sandbox/vendor/models/muscriptor-medium`

File sẽ được kiểm sha256 và lưu vào `muscriptor/ckpts/muscriptor-medium/`. Thư mục này đã nằm trong gitignore và được mount read-only vào `/app/ckpts`.

## API

| | |
|---|---|
| `GET /health[?warmup=1]` | Trạng thái. `warmup=1` sẽ nạp model và trả 503 nếu thiếu weights |
| `GET /info` | Thông tin model và thiết bị |
| `POST /transcribe {jobId, inputPath}` | `inputPath` là đường dẫn tương đối trong volume audio. Trả `{notes:[{onset, offset, pitch, instrument}]}`, đã bỏ trống |
| `GET /progress/<jobId>` | Tiến độ 0..1 |

Các job chạy lần lượt: GPU worker của frontend (`src/server/gpu/gpuWorker.ts`) không cho MuScriptor chạy cùng lúc với SCNet.
