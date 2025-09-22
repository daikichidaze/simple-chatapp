# Simple Group Chat - Deployment Guide

This guide covers how to deploy the Simple Group Chat application to various platforms.

## Prerequisites

1. **Environment Variables**: Copy `.env.production.example` to `.env.production` and fill in your values:
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with your actual values
   ```

2. **Google OAuth Setup**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google+ API
   - Create OAuth 2.0 credentials
   - Add your domain to authorized origins

## Quick Start (Docker)

The easiest way to deploy is using Docker:

```bash
# Run the deployment script
./scripts/deploy.sh docker

# Or manually:
docker build -t simple-group-chat .
docker run -d --name simple-group-chat \
  --env-file .env.production \
  -p 3000:3000 -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  simple-group-chat
```

## Deployment Platforms

### 1. Docker Compose (Recommended for VPS)

Best for: VPS, dedicated servers, local production

```bash
# Deploy with Nginx reverse proxy
./scripts/deploy.sh compose

# Or manually:
docker-compose --profile production up -d
```

Features:
- ✅ Nginx reverse proxy with SSL termination
- ✅ Rate limiting and security headers
- ✅ Automatic container restart
- ✅ Health checks
- ✅ Resource limits

### 2. Render.com

Best for: Quick deployment, automatic scaling, managed hosting

```bash
# Prepare Render configuration
./scripts/deploy.sh render
```

Manual steps:
1. Push code to GitHub/GitLab
2. Connect repository to Render.com
3. Update environment variables in Render dashboard
4. Deploy automatically triggers

Features:
- ✅ Free tier available
- ✅ Automatic HTTPS
- ✅ Git-based deployment
- ✅ Built-in monitoring

### 3. Fly.io

Best for: Global deployment, edge computing, WebSocket support

```bash
# Prepare Fly configuration
./scripts/deploy.sh fly

# Then deploy:
flyctl deploy
```

Features:
- ✅ Excellent WebSocket support
- ✅ Global edge deployment
- ✅ Competitive pricing
- ✅ Built-in PostgreSQL (if needed)

### 4. Railway

Best for: Developer-friendly deployment, database integration

```bash
# Prepare Railway deployment
./scripts/deploy.sh railway

# Then deploy:
railway up
```

Features:
- ✅ Simple deployment process
- ✅ Built-in database options
- ✅ Automatic HTTPS
- ✅ Great developer experience

## Environment Configuration

### Required Environment Variables

```env
NEXTAUTH_SECRET=your-secret-key-min-32-chars
NEXTAUTH_URL=https://your-domain.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### Optional Environment Variables

```env
DATABASE_PATH=/app/data/chat.db    # SQLite database path
LOG_LEVEL=info                     # Logging level
RATE_LIMIT=60                      # Requests per minute
MAX_MESSAGE_LENGTH=2000            # Maximum message length
MAX_DISPLAY_NAME_LENGTH=50         # Maximum display name length
```

## Database Setup

The application uses SQLite by default, which works well for small to medium deployments. The database will be automatically created on first run.

### Database Location

- **Docker**: Volume mounted at `/app/data/chat.db`
- **Local**: `./data/chat.db`
- **Production**: Set via `DATABASE_PATH` environment variable

### Database Backups

```bash
# Create backup
sqlite3 ./data/chat.db ".backup ./data/chat-backup-$(date +%Y%m%d).db"

# Restore from backup
sqlite3 ./data/chat.db ".restore ./data/chat-backup-20231201.db"
```

## Health Checks and Monitoring

The application provides a health check endpoint at `/api/health`:

```bash
# Check application health
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2023-12-01T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0",
  "checks": {
    "database": "ok",
    "memory": {
      "used": 128,
      "total": 256,
      "rss": 180
    }
  }
}
```

## Security Considerations

### 1. Environment Variables
- Never commit `.env.production` to version control
- Use strong, unique secrets for `NEXTAUTH_SECRET`
- Rotate secrets regularly

### 2. Network Security
- Use HTTPS in production (handled automatically by most platforms)
- Configure proper CORS settings
- Use rate limiting (built into Nginx config)

### 3. Database Security
- Regular backups
- Proper file permissions for SQLite database
- Consider database encryption for sensitive data

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   ```bash
   # Check if WebSocket port is accessible
   telnet your-domain.com 3001

   # Verify Nginx WebSocket proxy configuration
   nginx -t && nginx -s reload
   ```

2. **OAuth Errors**
   ```bash
   # Verify OAuth configuration
   echo $GOOGLE_CLIENT_ID
   echo $NEXTAUTH_URL

   # Check Google Console authorized origins
   ```

3. **Database Permissions**
   ```bash
   # Fix database permissions (Docker)
   docker exec -it simple-group-chat chown -R nextjs:nodejs /app/data
   ```

4. **Memory Issues**
   ```bash
   # Check memory usage
   docker stats simple-group-chat

   # Increase memory limit in docker-compose.yml
   ```

### Logs and Debugging

```bash
# View application logs (Docker)
docker logs simple-group-chat -f

# View application logs (Docker Compose)
docker-compose logs -f app

# Health check debugging
curl -v http://localhost:3000/api/health
```

## Performance Optimization

### 1. Resource Limits

For Docker deployments, set appropriate resource limits:

```yaml
# docker-compose.yml
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
    reservations:
      memory: 256M
      cpus: '0.25'
```

### 2. Nginx Optimization

The provided `nginx.conf` includes:
- Gzip compression
- Static file caching
- Rate limiting
- Security headers

### 3. Database Optimization

For high-traffic deployments:
- Enable WAL mode for SQLite
- Regular VACUUM operations
- Consider PostgreSQL for very high traffic

## Scaling

### Horizontal Scaling

For multiple instances:
1. Use external database (PostgreSQL)
2. Implement Redis for session storage
3. Use load balancer with sticky sessions for WebSocket

### Vertical Scaling

- Increase memory allocation
- Use more CPU cores
- Optimize database queries

## Backup and Recovery

### Automated Backups

```bash
# Add to crontab for daily backups
0 2 * * * sqlite3 /app/data/chat.db ".backup /app/data/backup-$(date +\%Y\%m\%d).db"

# Keep only 7 days of backups
0 3 * * * find /app/data -name "backup-*.db" -mtime +7 -delete
```

### Disaster Recovery

1. Regular database backups
2. Environment variable backup
3. Container image versioning
4. DNS failover configuration

## Support

For deployment issues:
1. Check the health endpoint
2. Review application logs
3. Verify environment variables
4. Test WebSocket connectivity
5. Check database permissions

## Security Updates

Regular maintenance:
1. Update base Docker images monthly
2. Update Node.js dependencies
3. Monitor security advisories
4. Review access logs