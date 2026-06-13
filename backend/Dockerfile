FROM python:3.11-slim

# Cache-bust: 2026-06-10a
ARG CACHEBUST=2026-06-13-finance-center

WORKDIR /app

# Install curl for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN echo "cache-bust: $CACHEBUST"
COPY . .

RUN mkdir -p uploads backups data

EXPOSE 8000

# Railway waits for this to pass before routing traffic to the new container.
# start-period=90s gives the app time to connect to DB before checks begin.
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -sf http://localhost:${PORT:-8000}/health | grep -q '"status"' || exit 1

CMD ["/bin/sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
