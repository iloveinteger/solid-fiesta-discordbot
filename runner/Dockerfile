FROM python:3.13-alpine

RUN addgroup -S runner && adduser -S -G runner -u 10001 runner
WORKDIR /app
COPY safe_interpreter.py /app/safe_interpreter.py
USER 10001:10001
ENTRYPOINT ["python", "-I", "-B", "/app/safe_interpreter.py"]
