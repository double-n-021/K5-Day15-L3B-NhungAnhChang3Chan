# Hanoi EV Charging Dispatch — PyTorch PPO

Huấn luyện thuật toán **PPO (Proximal Policy Optimization)** bằng **PyTorch thuần** cho bài toán chọn trạm sạc & điều phối ca chạy xe điện tại Hà Nội, sử dụng trực tiếp dữ liệu trong `../K5-Day15-L3B-NhungAnhChang3Chan/data/`.

## Cấu trúc thư mục
- `env.py`: Môi trường `HanoiEVChargingEnv` + `VectorizedHanoiEVEnv` (thu thập rollout song song nhiều env) + `heuristic_policy` (baseline theo luật trong `codebase/tools.py`).
- `ppo.py`: Kiến trúc `ActorCritic` (MLP tách Actor/Critic, Orthogonal Init, LayerNorm, Action Masking), `RolloutBuffer` (GAE-λ), và `PPOAgent` (clipped surrogate, value clipping, entropy bonus, KL early stop).
- `train_ppo.py`: Script train PPO, so sánh trực tiếp với Random & Heuristic baseline, lưu `best_ppo.pt`, `final_ppo.pt` và `metrics.csv`.
- `eval_ppo.py`: Đánh giá checkpoint đã train và in chi tiết 1 ca chạy mẫu tại Hà Nội.

## Cách chạy (trong WSL / Linux hoặc Python đã cài PyTorch)
```bash
cd rl_ppo_ev
pip install -r requirements.txt

# Train PPO (80,000 steps ~ 1-2 phút trên CPU)
python3 train_ppo.py --total-timesteps 80000 --num-envs 8 --save-dir checkpoints

# Đánh giá & xem lộ trình mẫu
python3 eval_ppo.py --checkpoint checkpoints/best_ppo.pt --episodes 100
```

## Ghi chú về A3C / TD3
- **A3C**: `ActorCritic` trong `ppo.py` dùng chung cấu trúc mạng với A3C; `VectorizedHanoiEVEnv` thu thập rollout song song từ `N` môi trường (tương đương A2C/PPO đồng bộ — thường ổn định và nhanh hơn A3C bất đồng bộ trên CPU/GPU hiện đại).
- **TD3**: TD3 dành cho không gian hành động liên tục (continuous action); trong bài toán chọn trạm sạc rời rạc (`32 trạm + 1 bỏ qua`), PPO với Action Masking phù hợp hơn. Nếu mở rộng sang điều khiển **mức % pin mục tiêu liên tục** hoặc **công suất sạc liên tục**, có thể gắn thêm TD3 hoặc Hybrid PPO.
