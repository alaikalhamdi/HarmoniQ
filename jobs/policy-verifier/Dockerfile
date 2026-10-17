# Nebius AI Cloud Serverless Job Container
FROM python:3.11-slim

WORKDIR /app

# Copy physics verifier script
COPY verifier.py /app/verifier.py
RUN chmod +x /app/verifier.py

# Run self-test during build to guarantee model stability
RUN python3 /app/verifier.py --self-test

ENTRYPOINT ["python3", "/app/verifier.py"]
