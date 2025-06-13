# Fail2ban Integration

This document describes the fail2ban integration added to the MP docker stack for enhanced security.

## Overview

Fail2ban has been integrated as a containerized service that monitors Caddy access logs and automatically blocks IP addresses showing malicious behavior. It works as an additional security layer alongside the existing rate limiting measures.

## Architecture

- **Caddy**: Acts as the reverse proxy and generates JSON-formatted access logs
- **Fail2ban**: Monitors Caddy logs and manages iptables rules to block malicious IPs
- **Shared Volumes**: Caddy logs are shared with fail2ban via Docker volumes

## Configuration

### Jails

Three main jails are configured:

1. **caddy-general**: Protects against common web application attacks
   - Monitors for: SQL injection, path traversal, admin panel access attempts
   - Ban time: 1 hour (3600s)
   - Max retries: 10 within 10 minutes

2. **caddy-auth**: Protects against authentication failures
   - Monitors for: 401/403 responses, failed login attempts
   - Ban time: 30 minutes (1800s)
   - Max retries: 5 within 5 minutes

3. **caddy-dos**: Protects against denial of service attacks
   - Monitors for: Rate limit violations (429 responses)
   - Ban time: 10 minutes (600s)
   - Max retries: 50 within 1 minute

### Environment Variables

Configure fail2ban behavior via environment variables in `.env.shared`:

- `FAIL2BAN_LOG_LEVEL`: Log level (INFO, DEBUG, etc.)
- `FAIL2BAN_DEFAULT_BANTIME`: Default ban time in seconds
- `FAIL2BAN_DEFAULT_FINDTIME`: Time window for finding failures
- `FAIL2BAN_DEFAULT_MAXRETRY`: Default maximum retry attempts

## Usage

### Starting the Stack

Fail2ban is included in the `prod` and `test` profiles:

```bash
cd docker
./dockerctl.sh prod up -d
```

### Monitoring

Check fail2ban status:

```bash
# View fail2ban logs
docker logs mp-fail2ban

# Check currently banned IPs
docker exec mp-fail2ban fail2ban-client status

# Check specific jail status
docker exec mp-fail2ban fail2ban-client status caddy-general
```

### Manual Management

```bash
# Ban an IP manually
docker exec mp-fail2ban fail2ban-client set caddy-general banip 192.168.1.100

# Unban an IP
docker exec mp-fail2ban fail2ban-client set caddy-general unbanip 192.168.1.100

# Reload configuration
docker exec mp-fail2ban fail2ban-client reload
```

## Log Format

Fail2ban expects Caddy to output logs in JSON format. The access log format includes:
- `remote_ip`: Client IP address
- `status`: HTTP status code
- `request.uri`: Request URI
- `request.method`: HTTP method

## Security Considerations

- Fail2ban requires `NET_ADMIN` and `NET_RAW` capabilities to manage iptables
- Uses `network_mode: host` to access the host's network stack
- Only runs in production and test environments (not in development)
- Logs are stored in persistent Docker volumes

## Integration with Existing Security

This fail2ban integration complements existing security measures:
- **Caddy rate limiting**: First line of defense with configurable rate limits
- **Application rate limiting**: Server-side rate limiting in the MP application
- **Fail2ban**: Network-level blocking of persistent attackers

The layered approach provides comprehensive protection against various attack vectors.