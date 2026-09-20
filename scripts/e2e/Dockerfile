FROM node:24.20.0-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends docker.io ca-certificates \
    && npm install --global playwright@1.60.0 \
    && playwright install --with-deps chromium webkit \
    && rm -rf /var/lib/apt/lists/*
COPY --from=docker:29.5.2-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /work
ENTRYPOINT ["bash", "-lc"]
