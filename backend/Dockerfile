FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# .dockerignore keeps .env, venv, tests and backups out of the image.
# Configuration and secrets are injected at runtime (env vars / secret store).
COPY . .

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

# Apply migrations explicitly before starting a new release:
#   docker run --env-file .env <image> alembic upgrade head
# --proxy-headers trusts X-Forwarded-* from the reverse proxy (client IPs for
# rate limiting); restrict --forwarded-allow-ips to the proxy address.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
