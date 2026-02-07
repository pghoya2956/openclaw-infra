import { PersonaConfig } from "./config";

// Traefik docker-compose (File provider, 고정 Docker 네트워크)
function generateTraefikCompose(domain: string): string {
  return `services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.file.filename=/etc/traefik/dynamic.yml"
      - "--providers.file.watch=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=chad@infograb.net"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /opt/openclaw/traefik-dynamic.yml:/etc/traefik/dynamic.yml:ro
      - letsencrypt:/letsencrypt
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      proxy:
        ipv4_address: 172.28.0.2
    restart: unless-stopped

networks:
  proxy:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/24

volumes:
  letsencrypt:
`;
}

// Traefik 동적 라우팅 설정 (호스트의 OpenClaw Gateway로 프록시)
function generateTraefikDynamic(domain: string): string {
  return `http:
  routers:
    openclaw:
      rule: "Host(\`${domain}\`)"
      entryPoints:
        - websecure
      service: openclaw
      tls:
        certResolver: letsencrypt
  services:
    openclaw:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:18789"
`;
}

// User Data 스크립트 생성 (openclaw onboard 기반)
export function generateUserData(
  persona: PersonaConfig,
  domain: string
): string {
  const traefikCompose = generateTraefikCompose(domain);
  const traefikDynamic = generateTraefikDynamic(domain);

  return `#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/user-data.log) 2>&1
echo "=== User Data started at $(date) ==="

# --- Node.js 22 + Docker ---
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs docker git

# --- Docker Compose V2 플러그인 (AL2023 기본 미포함) ---
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# --- OpenClaw ---
npm install -g openclaw@latest
echo "OpenClaw version: $(openclaw --version)"

# --- systemd user 서비스를 위한 linger 활성화 ---
# onboard --install-daemon이 자동으로 시도하지만, root에서 먼저 호출 (safety net)
loginctl enable-linger ec2-user

# --- 상태 디렉토리 ---
STATE_DIR=/opt/openclaw
mkdir -p $STATE_DIR
chown ec2-user:ec2-user $STATE_DIR
chmod 700 $STATE_DIR

# --- 환경변수 파일 (.env) ---
cat > $STATE_DIR/.env << 'ENVEOF'
OPENCLAW_STATE_DIR=/opt/openclaw
OPENCLAW_GATEWAY_TOKEN=${persona.env.OPENCLAW_GATEWAY_TOKEN}
SLACK_BOT_TOKEN=${persona.env.SLACK_BOT_TOKEN}
SLACK_APP_TOKEN=${persona.env.SLACK_APP_TOKEN}
ENVEOF
chown ec2-user:ec2-user $STATE_DIR/.env
chmod 600 $STATE_DIR/.env

# --- 환경변수 로드 ---
set -a
source $STATE_DIR/.env
set +a

# --- OpenClaw onboard (비대화형, 공식 경로) ---
EC2_USER_UID=$(id -u ec2-user)
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN \\
  SLACK_APP_TOKEN=$SLACK_APP_TOKEN \\
  XDG_RUNTIME_DIR=/run/user/$EC2_USER_UID \\
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$EC2_USER_UID/bus \\
  openclaw onboard \\
    --non-interactive \\
    --accept-risk \\
    --auth-choice token \\
    --token "${persona.env.ANTHROPIC_SETUP_TOKEN}" \\
    --token-provider anthropic \\
    --gateway-bind lan \\
    --gateway-port 18789 \\
    --gateway-token "$OPENCLAW_GATEWAY_TOKEN" \\
    --skip-channels \\
    --install-daemon

echo "=== onboard completed ==="

# --- 추가 설정 (onboard 이후) ---
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  openclaw config set tools.exec.ask always

# --- trustedProxies 설정 (Traefik Docker IP) ---
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  node -e "
    const fs = require('fs');
    const p = '$STATE_DIR/openclaw.json';
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    c.gateway = c.gateway || {};
    c.gateway.trustedProxies = ['172.28.0.2'];
    fs.writeFileSync(p, JSON.stringify(c, null, 2));
  "

# --- systemd 서비스에 Slack 환경변수 주입 ---
SYSTEMD_DIR=/home/ec2-user/.config/systemd/user/openclaw-gateway.service.d
sudo -u ec2-user mkdir -p $SYSTEMD_DIR
cat > $SYSTEMD_DIR/env.conf << OVERRIDEEOF
[Service]
EnvironmentFile=$STATE_DIR/.env
OVERRIDEEOF
chown ec2-user:ec2-user $SYSTEMD_DIR/env.conf

# --- Gateway 재시작 (설정 반영) ---
sudo -u ec2-user \\
  XDG_RUNTIME_DIR=/run/user/$EC2_USER_UID \\
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$EC2_USER_UID/bus \\
  systemctl --user daemon-reload

sudo -u ec2-user \\
  XDG_RUNTIME_DIR=/run/user/$EC2_USER_UID \\
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$EC2_USER_UID/bus \\
  systemctl --user restart openclaw-gateway || true

# --- Traefik (HTTPS 리버스 프록시) ---
systemctl enable --now docker

cat > $STATE_DIR/traefik-dynamic.yml << 'DYNAMICEOF'
${traefikDynamic}DYNAMICEOF

cat > $STATE_DIR/docker-compose.yml << 'COMPOSEEOF'
${traefikCompose}COMPOSEEOF

cd $STATE_DIR
docker compose up -d

echo "=== User Data completed at $(date) ==="
`;
}
