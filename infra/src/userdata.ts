/**
 * userdata.ts — EC2 User Data 스크립트 생성 (모듈화)
 *
 * 각 함수가 독립된 bash 스크립트 조각을 반환한다.
 * 채널/도구 등의 이름이 코드에 등장하지 않음 (channel-agnostic).
 */

import { PersonaConfig, WorkspaceFile } from "./schema";
import { infraConfig } from "./config";
import { generateOpenclawConfig } from "./openclaw-config";

// --- Traefik configs ---

function generateTraefikCompose(domain: string, acmeEmail: string): string {
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
      - "--certificatesresolvers.letsencrypt.acme.email=${acmeEmail}"
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

// --- Modular bash steps ---

function installBase(): string {
  return `# --- Node.js 22 + Docker ---
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs docker git

# --- Docker Compose V2 plugin (AL2023 default missing) ---
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \\
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# --- OpenClaw ---
npm install -g openclaw@latest
echo "OpenClaw version: $(openclaw --version)"

# --- systemd user linger ---
loginctl enable-linger ec2-user`;
}

function installSystemDeps(deps: string[]): string {
  if (deps.length === 0) return "";
  return `# --- System dependencies ---
dnf install -y ${deps.join(" ")}`;
}

function installExtensions(packages: string[]): string {
  if (packages.length === 0) return "";
  return `# --- OpenClaw extension channels ---
npm install -g ${packages.join(" ")}`;
}

function deployWorkspace(files: WorkspaceFile[]): string {
  if (files.length === 0) return "";

  const lines = [
    `# --- Workspace files (BEFORE onboard -- writeFileIfMissing won't overwrite) ---`,
    `WORKSPACE_DIR=/home/ec2-user/.openclaw/workspace`,
    `sudo -u ec2-user mkdir -p $WORKSPACE_DIR`,
  ];

  for (const file of files) {
    // 하위 디렉토리가 있으면 생성
    const dir = file.relativePath.includes("/")
      ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
      : null;

    if (dir) {
      lines.push(`sudo -u ec2-user mkdir -p $WORKSPACE_DIR/${dir}`);
    }

    // heredoc delimiter를 파일별로 고유하게 생성
    const safeName = file.relativePath
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toUpperCase();
    const delimiter = `WS_${safeName}_EOF`;

    lines.push(`cat > $WORKSPACE_DIR/${file.relativePath} << '${delimiter}'`);
    lines.push(file.content);
    lines.push(delimiter);
    lines.push(
      `chown ec2-user:ec2-user $WORKSPACE_DIR/${file.relativePath}`
    );
  }

  lines.push(`echo "=== Workspace files deployed (${files.length} files) ==="`);
  return lines.join("\n");
}

function runOnboard(persona: PersonaConfig): string {
  return `# --- OpenClaw onboard (non-interactive) ---
EC2_USER_UID=$(id -u ec2-user)
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  XDG_RUNTIME_DIR=/run/user/$EC2_USER_UID \\
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$EC2_USER_UID/bus \\
  openclaw onboard \\
    --non-interactive \\
    --accept-risk \\
    --auth-choice token \\
    --token "\${ANTHROPIC_SETUP_TOKEN}" \\
    --token-provider anthropic \\
    --gateway-bind lan \\
    --gateway-port 18789 \\
    --gateway-token "$OPENCLAW_GATEWAY_TOKEN" \\
    --skip-channels \\
    --install-daemon

echo "=== onboard completed ==="`;
}

function writeOpenclawConfig(configJson: string): string {
  return `# --- OpenClaw config (deep-merge with onboard defaults) ---
# onboard가 생성한 openclaw.json을 읽고, persona config를 merge한다
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  node -e "
    const fs = require('fs');
    const configPath = '$STATE_DIR/openclaw.json';
    const base = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const override = JSON.parse(fs.readFileSync('/tmp/persona-config.json', 'utf8'));

    function deepMerge(b, o) {
      const r = { ...b };
      for (const [k, v] of Object.entries(o)) {
        if (v === null) { delete r[k]; }
        else if (Array.isArray(v) || typeof v !== 'object') { r[k] = v; }
        else if (typeof r[k] === 'object' && r[k] !== null && !Array.isArray(r[k])) {
          r[k] = deepMerge(r[k], v);
        } else { r[k] = v; }
      }
      return r;
    }

    const merged = deepMerge(base, override);
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  "
rm /tmp/persona-config.json
echo "=== openclaw.json merged ==="`;
}

function injectEnvVars(env: Record<string, string>): string {
  // .env.{name}의 모든 키-값을 EC2 .env에 기록 — 채널 비의존
  const envLines = [
    `OPENCLAW_STATE_DIR=/opt/openclaw`,
    `OPENCLAW_DISABLE_BONJOUR=1`,
  ];

  for (const [key, value] of Object.entries(env)) {
    envLines.push(`${key}=${value}`);
  }

  return `# --- Environment file (.env) ---
cat > $STATE_DIR/.env << 'ENVEOF'
${envLines.join("\n")}
ENVEOF
chown ec2-user:ec2-user $STATE_DIR/.env
chmod 600 $STATE_DIR/.env

# --- Load environment ---
set -a
source $STATE_DIR/.env
set +a`;
}

function setupSystemdEnv(): string {
  return `# --- Inject env vars into systemd service ---
EC2_USER_UID=$(id -u ec2-user)
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
  systemctl --user restart openclaw-gateway || true`;
}

function startTraefik(domain: string): string {
  const traefikCompose = generateTraefikCompose(domain, infraConfig.acmeEmail);
  const traefikDynamic = generateTraefikDynamic(domain);

  return `# --- Traefik (HTTPS reverse proxy) ---
systemctl enable --now docker

cat > $STATE_DIR/traefik-dynamic.yml << 'DYNAMICEOF'
${traefikDynamic}DYNAMICEOF

cat > $STATE_DIR/docker-compose.yml << 'COMPOSEEOF'
${traefikCompose}COMPOSEEOF

cd $STATE_DIR
docker compose up -d`;
}

function writePersonaConfigFile(configJson: string): string {
  return `# --- Persona config (temporary, for merge) ---
cat > /tmp/persona-config.json << 'PCEOF'
${configJson}
PCEOF`;
}

// --- Main entry ---

export function generateUserData(persona: PersonaConfig, domain: string): string {
  const configJson = generateOpenclawConfig(persona);

  const steps = [
    `#!/bin/bash`,
    `set -euo pipefail`,
    `exec > >(tee /var/log/user-data.log) 2>&1`,
    `echo "=== User Data started at $(date) ==="`,
    `echo "=== Persona: ${persona.name} ==="`,
    ``,
    `# --- State directory ---`,
    `STATE_DIR=/opt/openclaw`,
    `mkdir -p $STATE_DIR`,
    `chown ec2-user:ec2-user $STATE_DIR`,
    `chmod 700 $STATE_DIR`,
    ``,
    installBase(),
    installSystemDeps(persona.systemDeps),
    installExtensions(persona.extensions),
    ``,
    injectEnvVars(persona.env),
    ``,
    deployWorkspace(persona.workspace),
    ``,
    runOnboard(persona),
    ``,
    writePersonaConfigFile(configJson),
    writeOpenclawConfig(configJson),
    ``,
    setupSystemdEnv(),
  ];

  // Traefik은 조건부
  if (persona.traefik) {
    steps.push(``);
    steps.push(startTraefik(domain));
  }

  steps.push(``);
  steps.push(`echo "=== User Data completed at $(date) ==="`);

  return steps.filter((s) => s !== undefined).join("\n");
}
