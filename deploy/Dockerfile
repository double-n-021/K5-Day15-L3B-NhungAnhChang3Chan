FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    API_HOST=0.0.0.0 \
    PORT=8000

WORKDIR /app

# Chỉ chép mã nguồn cần cho API & dữ liệu (không chép rl_ppo_ev/ hay .env)
COPY codebase/ ./codebase/
COPY data/ ./data/

# Thư mục mount file APK phát hành trên VPS
RUN mkdir -p /app/releases && \
    useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

CMD ["python", "-u", "codebase/api_server.py"]
