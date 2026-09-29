# Build stage
FROM golang:alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# Runtime stage
FROM node:22-trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata postgresql-client bash python3 git curl tar \
    && ARCH="$(uname -m)" \
    && if [ "$ARCH" = "x86_64" ]; then DOCKER_ARCH="x86_64"; COMPOSE_ARCH="x86_64"; \
       elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then DOCKER_ARCH="aarch64"; COMPOSE_ARCH="aarch64"; \
       else DOCKER_ARCH="x86_64"; COMPOSE_ARCH="x86_64"; fi \
    && curl -fsSL "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-27.3.1.tgz" | tar -xz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && rm -rf /tmp/docker \
    && mkdir -p /usr/local/lib/docker/cli-plugins \
    && curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-${COMPOSE_ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose \
    && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
    && ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global --add safe.directory '*'
ENV TZ=America/Sao_Paulo

WORKDIR /app
COPY --from=builder /server /app/server

RUN mkdir -p /app/uploads
RUN mkdir -p /workspace

EXPOSE 8080

CMD ["/app/server"]
