FROM python:3.12-slim

WORKDIR /app

# build-essential covers any wheel-less deps pulled in by python-jobspy
# curl is used by the compose healthcheck
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 9500

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9500"]