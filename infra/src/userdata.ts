/**
 * userdata.ts — EC2 User Data 스크립트 생성 (통합형 멀티에이전트)
 *
 * S3에서 워크스페이스 다운로드, 통합 openclaw.json 배포,
 * 와일드카드 Traefik 설정.
 */

import { DeployConfig } from "./schema";
import { infraConfig, awsConfig } from "./config";
import { generateOpenclawConfig } from "./openclaw-config";

// --- Traefik configs (와일드카드 DNS Challenge) ---

function generateTraefikCompose(
  baseDomain: string,
  acmeEmail: string
): string {
  return `services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.file.filename=/etc/traefik/dynamic.yml"
      - "--providers.file.watch=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.dnschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=route53"
      - "--certificatesresolvers.letsencrypt.acme.dnschallenge.delayBeforeCheck=30"
      - "--certificatesresolvers.letsencrypt.acme.email=${acmeEmail}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /opt/openclaw/traefik-dynamic.yml:/etc/traefik/dynamic.yml:ro
      - letsencrypt:/letsencrypt
    environment:
      - AWS_REGION=ap-northeast-2
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

function generateTraefikDynamic(
  baseDomain: string,
  wildcardDomain: string
): string {
  return `http:
  routers:
    openclaw:
      rule: "HostRegexp(\`{subdomain:[a-z-]+}.openclaw.${baseDomain}\`)"
      entryPoints:
        - websecure
      service: openclaw
      tls:
        certResolver: letsencrypt
        domains:
          - main: "${wildcardDomain}"
  services:
    openclaw:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:18789"
`;
}

// --- Modular bash steps ---

function setupSwap(sizeGB: number): string {
  if (sizeGB <= 0) return "";
  return `# --- Swap (${sizeGB}GB — Node.js 힙 미반환 + 메모리 릭 대비) ---
fallocate -l ${sizeGB}G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab

# swappiness: 비활성 페이지를 적극적으로 swap (기본 60 → 10)
# Node.js GC가 해제하지 않는 old generation 힙을 swap으로 내보냄
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf
echo "=== Swap ${sizeGB}GB configured ==="`;
}

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

function downloadWorkspace(bucketName: string): string {
  return `# --- Download workspace from S3 ---
aws s3 cp s3://${bucketName}/workspace-manifest.json /tmp/workspace-manifest.json
echo "=== Workspace manifest downloaded ==="

# --- Deploy workspace files from manifest ---
sudo -u ec2-user node -e "
  const fs = require('fs');
  const path = require('path');
  const manifest = JSON.parse(fs.readFileSync('/tmp/workspace-manifest.json', 'utf8'));

  for (const [agentId, files] of Object.entries(manifest)) {
    const wsDir = path.join('/home/ec2-user/.openclaw', 'workspace-' + agentId);

    for (const file of files) {
      const filePath = path.join(wsDir, file.relativePath);
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, file.content);
    }

    console.log('Deployed workspace for ' + agentId + ': ' + files.length + ' files');
  }
"

chown -R ec2-user:ec2-user /home/ec2-user/.openclaw/workspace-*
echo "=== All workspaces deployed ==="`;
}

function runOnboard(): string {
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
  return `# --- OpenClaw config (통합 — onboard defaults에 merge) ---
sudo -u ec2-user \\
  OPENCLAW_STATE_DIR=$STATE_DIR \\
  node -e "
    const fs = require('fs');
    const configPath = '$STATE_DIR/openclaw.json';
    const base = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const override = JSON.parse(fs.readFileSync('/tmp/openclaw-config.json', 'utf8'));

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
rm /tmp/openclaw-config.json
echo "=== openclaw.json merged ==="`;
}

function injectEnvVars(env: Record<string, string>): string {
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

function startTraefik(baseDomain: string): string {
  const wildcardDomain = `*.openclaw.${baseDomain}`;
  const traefikCompose = generateTraefikCompose(
    baseDomain,
    infraConfig.acmeEmail
  );
  const traefikDynamic = generateTraefikDynamic(baseDomain, wildcardDomain);

  return `# --- Traefik (HTTPS reverse proxy — 와일드카드 DNS Challenge) ---
systemctl enable --now docker

cat > $STATE_DIR/traefik-dynamic.yml << 'DYNAMICEOF'
${traefikDynamic}DYNAMICEOF

cat > $STATE_DIR/docker-compose.yml << 'COMPOSEEOF'
${traefikCompose}COMPOSEEOF

cd $STATE_DIR
docker compose up -d`;
}

function writeConfigFile(configJson: string): string {
  return `# --- OpenClaw config (temporary, for merge) ---
cat > /tmp/openclaw-config.json << 'PCEOF'
${configJson}
PCEOF`;
}

// --- Main entry ---

export function generateUserData(
  config: DeployConfig,
  bucketName: string
): string {
  const configJson = generateOpenclawConfig(config);

  const steps = [
    `#!/bin/bash`,
    `set -euo pipefail`,
    `exec > >(tee /var/log/user-data.log) 2>&1`,
    `echo "=== User Data started at $(date) ==="`,
    `echo "=== Unified Multi-Agent Deployment ==="`,
    `echo "=== Agents: ${config.agents.map((a) => a.id).join(", ")} ==="`,
    ``,
    `# --- State directory ---`,
    `STATE_DIR=/opt/openclaw`,
    `mkdir -p $STATE_DIR`,
    `chown ec2-user:ec2-user $STATE_DIR`,
    `chmod 700 $STATE_DIR`,
    ``,
    setupSwap(config.instance.swapSizeGB),
    ``,
    installBase(),
    installSystemDeps(config.instance.systemDeps),
    installExtensions(config.instance.extensions),
    ``,
    injectEnvVars(config.env),
    ``,
    downloadWorkspace(bucketName),
    ``,
    runOnboard(),
    ``,
    writeConfigFile(configJson),
    writeOpenclawConfig(configJson),
    ``,
    setupSystemdEnv(),
  ];

  if (config.instance.traefik) {
    steps.push(``);
    steps.push(startTraefik(awsConfig.baseDomain));
  }

  steps.push(``);
  steps.push(`echo "=== User Data completed at $(date) ==="`);

  return steps.filter((s) => s !== undefined).join("\n");
}
