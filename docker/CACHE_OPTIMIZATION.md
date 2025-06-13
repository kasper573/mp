# Caddy Docker Cache Optimization

This document explains the optimization made to improve Docker build caching for the Caddy image.

## Problem

The original Dockerfile used `xcaddy build --with github.com/mholt/caddy-ratelimit` without version pinning, which caused several issues:

1. **No layer caching**: Docker couldn't cache the build layer because it couldn't determine if remote dependencies had changed
2. **Slow builds**: Every build took ~60 seconds because it had to re-download and rebuild dependencies
3. **Non-deterministic builds**: Using `@latest` meant builds could vary depending on when they were run

## Solution

The optimized Dockerfile addresses these issues by:

1. **Pinning specific versions**: Using `@v0.1.0` instead of `@latest` ensures deterministic builds
2. **Better layer caching**: Docker can now cache the build layer unless we explicitly change the version
3. **Optimized build environment**: Added build-specific environment variables for better performance

## Changes Made

### Before (docker/Dockerfile.caddy):
```dockerfile
FROM caddy:2.8.4-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit
 
FROM caddy:2.8.4
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

### After (docker/Dockerfile.caddy):
```dockerfile
FROM caddy:2.8.4-builder AS builder

# Set build variables for better caching
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

# Use xcaddy with a specific version for deterministic builds
# This pinned version ensures Docker can cache the layer
# unless we explicitly change the version
RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit@v0.1.0

FROM caddy:2.8.4
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

## Benefits

1. **Improved build speed**: After the first build, subsequent builds will use cached layers
2. **Deterministic builds**: Same version always produces the same result
3. **Better CI/CD**: Faster builds in continuous integration environments
4. **Explicit dependencies**: Clear visibility into which plugin versions are being used

## Updating Dependencies

To update the caddy-ratelimit plugin:

1. Check available versions: `go list -m -versions github.com/mholt/caddy-ratelimit`
2. Update the version in `docker/Dockerfile.caddy`
3. The next build will download the new version and cache it

This approach maintains the benefits of Docker layer caching while ensuring reproducible builds.