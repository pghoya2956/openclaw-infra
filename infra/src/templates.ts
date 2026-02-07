import { PersonaConfig, WorkspaceFiles } from "./config";

// Traefik docker-compose (File provider)
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

// Traefik dynamic routing config
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

// User Data script generation
export function generateUserData(
  persona: PersonaConfig,
  domain: string,
  workspaceFiles: WorkspaceFiles
): string {
  const traefikCompose = generateTraefikCompose(domain);
  const traefikDynamic = generateTraefikDynamic(domain);

  return `#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/user-data.log) 2>&1
echo "=== User Data started at $(date) ==="
echo "=== Persona: ${persona.name} ==="

# --- Node.js 22 + Docker ---
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs docker git

# --- Docker Compose V2 plugin (AL2023 default missing) ---
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# --- OpenClaw ---
npm install -g openclaw@latest
echo "OpenClaw version: $(openclaw --version)"

# --- systemd user linger ---
loginctl enable-linger ec2-user

# --- State directory ---
STATE_DIR=/opt/openclaw
mkdir -p $STATE_DIR
chown ec2-user:ec2-user $STATE_DIR
chmod 700 $STATE_DIR

# --- Environment file (.env) ---
cat > $STATE_DIR/.env << 'ENVEOF'
OPENCLAW_STATE_DIR=/opt/openclaw
OPENCLAW_GATEWAY_TOKEN=${persona.env.OPENCLAW_GATEWAY_TOKEN}
SLACK_BOT_TOKEN=${persona.env.SLACK_BOT_TOKEN}
SLACK_APP_TOKEN=${persona.env.SLACK_APP_TOKEN}
OPENCLAW_DISABLE_BONJOUR=1
ENVEOF
chown ec2-user:ec2-user $STATE_DIR/.env
chmod 600 $STATE_DIR/.env

# --- Load environment ---
set -a
source $STATE_DIR/.env
set +a

# --- Workspace files (BEFORE onboard -- writeFileIfMissing won't overwrite) ---
WORKSPACE_DIR=/home/ec2-user/.openclaw/workspace
sudo -u ec2-user mkdir -p $WORKSPACE_DIR

cat > $WORKSPACE_DIR/SOUL.md << 'SOULEOF'
${workspaceFiles.soul}
SOULEOF
chown ec2-user:ec2-user $WORKSPACE_DIR/SOUL.md

cat > $WORKSPACE_DIR/IDENTITY.md << 'IDENTITYEOF'
${workspaceFiles.identity}
IDENTITYEOF
chown ec2-user:ec2-user $WORKSPACE_DIR/IDENTITY.md

cat > $WORKSPACE_DIR/AGENTS.md << 'AGENTSEOF'
${workspaceFiles.agents}
AGENTSEOF
chown ec2-user:ec2-user $WORKSPACE_DIR/AGENTS.md

echo "=== Workspace files deployed ==="

# --- OpenClaw onboard (non-interactive) ---
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

# --- Post-onboard config ---
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  openclaw config set tools.exec.ask always

# --- Security hardening ---
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  openclaw config set channels.defaults.groupPolicy allowlist

sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  openclaw config set channels.slack.groupPolicy allowlist

sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  openclaw config set logging.redactSensitive tools

sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  openclaw config set logging.redactPatterns --json '["xoxb-","xapp-","sk-ant-"]'

# --- trustedProxies (Traefik Docker IP) ---
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

# --- Inject Slack env vars into systemd service ---
SYSTEMD_DIR=/home/ec2-user/.config/systemd/user/openclaw-gateway.service.d
sudo -u ec2-user mkdir -p $SYSTEMD_DIR
cat > $SYSTEMD_DIR/env.conf << OVERRIDEEOF
[Service]
EnvironmentFile=$STATE_DIR/.env
OVERRIDEEOF
chown ec2-user:ec2-user $SYSTEMD_DIR/env.conf

# --- Restart Gateway (apply config) ---
sudo -u ec2-user \\
  XDG_RUNTIME_DIR=/run/user/$EC2_USER_UID \\
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$EC2_USER_UID/bus \\
  systemctl --user daemon-reload

sudo -u ec2-user \\
  XDG_RUNTIME_DIR=/run/user/$EC2_USER_UID \\
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$EC2_USER_UID/bus \\
  systemctl --user restart openclaw-gateway || true

# --- Traefik (HTTPS reverse proxy) ---
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
