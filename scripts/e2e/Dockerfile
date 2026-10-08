FROM node:24.20.0-bookworm-slim AS git-build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl make gcc libc6-dev libssl-dev libcurl4-openssl-dev zlib1g-dev gettext libexpat1-dev xz-utils \
    && curl -fsSL https://www.kernel.org/pub/software/scm/git/git-2.55.0.tar.xz -o /tmp/git.tar.xz \
    && echo '457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357  /tmp/git.tar.xz' | sha256sum -c - \
    && tar -xJf /tmp/git.tar.xz -C /tmp \
    && make -C /tmp/git-2.55.0 -j4 prefix=/usr/local NO_TCLTK=YesPlease NO_RUST=YesPlease install

FROM node:24.20.0-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends docker.io ca-certificates \
    && npm install --global playwright@1.60.0 \
    && playwright install --with-deps chromium webkit \
    && rm -rf /var/lib/apt/lists/*
COPY --from=docker:29.5.2-cli /usr/local/bin/docker /usr/local/bin/docker
RUN apt-get update && apt-get install -y --no-install-recommends libcurl4 libexpat1 perl && rm -rf /var/lib/apt/lists/*
COPY --from=git-build /usr/local/bin/git /usr/local/bin/git
COPY --from=git-build /usr/local/libexec/git-core /usr/local/libexec/git-core
COPY --from=git-build /usr/local/share/git-core /usr/local/share/git-core
WORKDIR /work
ENTRYPOINT ["bash", "-lc"]
