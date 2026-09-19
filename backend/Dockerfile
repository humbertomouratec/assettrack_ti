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
    && apt-get install -y --no-install-recommends ca-certificates tzdata postgresql-client bash default-jdk-headless python3 \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=America/Sao_Paulo

WORKDIR /app
COPY --from=builder /server /app/server

RUN mkdir -p /app/uploads
RUN mkdir -p /workspace

EXPOSE 8080

CMD ["/app/server"]
