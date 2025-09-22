#!/bin/bash

# Simple Group Chat Application - Deployment Script
# This script handles deployment to various platforms

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if .env file exists
check_env() {
    if [[ ! -f .env.production ]]; then
        error ".env.production file not found!"
        echo "Please create .env.production with the following variables:"
        echo "  NEXTAUTH_SECRET=your-secret-here"
        echo "  NEXTAUTH_URL=https://your-domain.com"
        echo "  GOOGLE_CLIENT_ID=your-google-client-id"
        echo "  GOOGLE_CLIENT_SECRET=your-google-client-secret"
        exit 1
    fi
}

# Docker deployment
deploy_docker() {
    log "Starting Docker deployment..."

    # Build the image
    log "Building Docker image..."
    docker build -t simple-group-chat:latest .

    # Stop existing container if running
    if docker ps -a --format 'table {{.Names}}' | grep -q 'simple-group-chat'; then
        log "Stopping existing container..."
        docker stop simple-group-chat || true
        docker rm simple-group-chat || true
    fi

    # Create data directory
    mkdir -p ./data

    # Run the new container
    log "Starting new container..."
    docker run -d \
        --name simple-group-chat \
        --env-file .env.production \
        -p 3000:3000 \
        -p 3001:3001 \
        -v "$(pwd)/data:/app/data" \
        --restart unless-stopped \
        simple-group-chat:latest

    success "Docker deployment completed!"
    log "Application is running at http://localhost:3000"
}

# Docker Compose deployment
deploy_compose() {
    log "Starting Docker Compose deployment..."

    # Load environment variables
    export $(cat .env.production | grep -v '#' | xargs)

    # Build and start services
    docker-compose up -d --build

    success "Docker Compose deployment completed!"
    log "Application is running at http://localhost:3000"
}

# Render.com deployment
deploy_render() {
    log "Preparing for Render.com deployment..."

    # Check if render.yaml exists
    if [[ ! -f render.yaml ]]; then
        log "Creating render.yaml configuration..."
        cat > render.yaml << EOF
services:
  - type: web
    name: simple-group-chat
    env: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
    plan: starter
    region: oregon
    branch: main
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: NEXTAUTH_SECRET
        generateValue: true
      - key: NEXTAUTH_URL
        value: https://your-app-name.onrender.com
      - key: GOOGLE_CLIENT_ID
        sync: false
      - key: GOOGLE_CLIENT_SECRET
        sync: false
EOF
        warning "Please update render.yaml with your actual app name and Google OAuth credentials"
    fi

    log "Next steps for Render.com deployment:"
    echo "1. Push your code to a Git repository (GitHub, GitLab, etc.)"
    echo "2. Connect your repository to Render.com"
    echo "3. Update environment variables in Render dashboard"
    echo "4. Deploy will happen automatically"
}

# Fly.io deployment
deploy_fly() {
    log "Preparing for Fly.io deployment..."

    # Check if fly.toml exists
    if [[ ! -f fly.toml ]]; then
        log "Creating fly.toml configuration..."
        cat > fly.toml << EOF
app = "simple-group-chat"
primary_region = "dfw"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [[http_service.checks]]
    interval = "30s"
    grace_period = "5s"
    method = "get"
    path = "/api/health"
    protocol = "http"
    timeout = "10s"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[env]
  NODE_ENV = "production"
  PORT = "3000"
EOF
        warning "Please update fly.toml with your actual app name"
    fi

    log "Next steps for Fly.io deployment:"
    echo "1. Install Fly CLI: curl -L https://fly.io/install.sh | sh"
    echo "2. Login to Fly: flyctl auth login"
    echo "3. Deploy: flyctl deploy"
    echo "4. Set secrets: flyctl secrets set NEXTAUTH_SECRET=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=..."
}

# Railway deployment
deploy_railway() {
    log "Preparing for Railway deployment..."

    log "Next steps for Railway deployment:"
    echo "1. Install Railway CLI: npm install -g @railway/cli"
    echo "2. Login to Railway: railway login"
    echo "3. Initialize project: railway init"
    echo "4. Add environment variables in Railway dashboard"
    echo "5. Deploy: railway up"
}

# Health check after deployment
health_check() {
    local url=${1:-"http://localhost:3000"}
    log "Performing health check at $url/api/health..."

    for i in {1..30}; do
        if curl -f -s "$url/api/health" > /dev/null; then
            success "Health check passed!"
            return 0
        fi
        log "Waiting for application to start... ($i/30)"
        sleep 5
    done

    error "Health check failed - application may not be running correctly"
    return 1
}

# Main deployment logic
main() {
    local platform=${1:-"docker"}

    log "Starting deployment for platform: $platform"

    # Check environment file
    check_env

    case $platform in
        docker)
            deploy_docker
            health_check
            ;;
        compose)
            deploy_compose
            health_check
            ;;
        render)
            deploy_render
            ;;
        fly)
            deploy_fly
            ;;
        railway)
            deploy_railway
            ;;
        *)
            error "Unknown platform: $platform"
            echo "Supported platforms: docker, compose, render, fly, railway"
            exit 1
            ;;
    esac

    success "Deployment process completed for $platform!"
}

# Show help
show_help() {
    echo "Simple Group Chat - Deployment Script"
    echo ""
    echo "Usage: $0 [PLATFORM]"
    echo ""
    echo "Platforms:"
    echo "  docker    Deploy using Docker (default)"
    echo "  compose   Deploy using Docker Compose with Nginx"
    echo "  render    Prepare for Render.com deployment"
    echo "  fly       Prepare for Fly.io deployment"
    echo "  railway   Prepare for Railway deployment"
    echo ""
    echo "Examples:"
    echo "  $0 docker     # Deploy with Docker"
    echo "  $0 compose    # Deploy with Docker Compose"
    echo "  $0 render     # Prepare for Render.com"
}

# Check arguments
if [[ $1 == "--help" ]] || [[ $1 == "-h" ]]; then
    show_help
    exit 0
fi

# Run main function
main "$@"