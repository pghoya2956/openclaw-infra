import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import * as yaml from "js-yaml";
import {
  AgentYaml,
  InstanceYaml,
  InstanceConfig,
  AgentConfig,
  DeployConfig,
  WorkspaceFile,
  validateAgentYaml,
  validateInstanceYaml,
  validateSecrets,
} from "./schema";

// Load shared .env (infra config)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// --- Utility ---

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}. See .env.example`);
  }
  return value;
}

// --- AWS Infrastructure (loaded from infra/.env) ---

export const awsConfig = {
  vpcId: requireEnv("AWS_VPC_ID"),
  subnetId: requireEnv("AWS_SUBNET_ID"),
  keyName: requireEnv("AWS_KEY_NAME"),
  hostedZoneId: requireEnv("AWS_HOSTED_ZONE_ID"),
  baseDomain: requireEnv("BASE_DOMAIN"),
};

export const infraConfig = {
  sshKeyPath: process.env.SSH_KEY_PATH || "~/.ssh/id_ed25519",
  acmeEmail: requireEnv("ACME_EMAIL"),
  tags: {
    Owner: requireEnv("EC2_TAG_OWNER"),
    Purpose: process.env.EC2_TAG_PURPOSE || "OpenClaw AI Assistant",
    Environment: process.env.EC2_TAG_ENVIRONMENT || "production",
    Expiry: process.env.EC2_TAG_EXPIRY || "",
  },
};

// --- Paths ---

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const PERSONAS_DIR = path.join(PROJECT_ROOT, "personas");

// --- Deep Merge ---

/**
 * Deep-merge: 객체는 재귀 병합 (override 우선), 배열은 replace, null은 키 삭제
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };

  for (const [key, val] of Object.entries(override)) {
    if (val === null) {
      delete result[key];
    } else if (
      Array.isArray(val) ||
      typeof val !== "object" ||
      val === undefined
    ) {
      result[key] = val;
    } else if (
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        val as Record<string, unknown>
      );
    } else {
      result[key] = val;
    }
  }

  return result;
}

// --- YAML Loading ---

function loadInstanceYaml(): InstanceConfig {
  const instancePath = path.join(PERSONAS_DIR, "instance.yml");
  if (!fs.existsSync(instancePath)) {
    throw new Error(`personas/instance.yml not found`);
  }

  const raw = yaml.load(
    fs.readFileSync(instancePath, "utf-8")
  ) as InstanceYaml;
  validateInstanceYaml(raw);

  return {
    type: raw.instance.type,
    volumeSize: raw.instance.volumeSize,
    swapSizeGB: raw.instance.swapSizeGB ?? 0,
    traefik: raw.infra?.traefik ?? true,
    extensions: raw.infra?.extensions || [],
    systemDeps: raw.infra?.systemDeps || [],
  };
}

function loadDefaults(): Record<string, unknown> {
  const defaultsPath = path.join(PERSONAS_DIR, "defaults.yml");
  if (!fs.existsSync(defaultsPath)) {
    return {};
  }
  return yaml.load(fs.readFileSync(defaultsPath, "utf-8")) as Record<
    string,
    unknown
  >;
}

function loadAgentYaml(name: string): AgentYaml {
  const agentPath = path.join(PERSONAS_DIR, name, "agent.yml");
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent file not found: ${agentPath}`);
  }

  const raw = yaml.load(fs.readFileSync(agentPath, "utf-8")) as AgentYaml;
  validateAgentYaml(name, raw);
  return raw;
}

// --- Workspace Loading ---

function loadWorkspaceDir(name: string): WorkspaceFile[] {
  const workspaceDir = path.join(PERSONAS_DIR, name, "workspace");
  if (!fs.existsSync(workspaceDir)) {
    return [];
  }

  const files: WorkspaceFile[] = [];

  function walk(dir: string, prefix: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        files.push({
          relativePath,
          content: fs.readFileSync(fullPath, "utf-8"),
        });
      }
    }
  }

  walk(workspaceDir, "");
  return files;
}

// --- Secret Loading ---

function loadSecrets(): Record<string, string> {
  const envPath = path.join(__dirname, "..", ".env.secrets");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Secrets file not found: ${envPath}. See .env.example`);
  }
  return dotenv.parse(fs.readFileSync(envPath));
}

// --- Agent Enumeration ---

function getAgentDirs(): string[] {
  const enabledRaw = process.env.ENABLED_AGENTS;

  if (enabledRaw) {
    return enabledRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // 미지정 시 personas/ 디렉토리의 모든 agent.yml 보유 디렉토리
  return fs
    .readdirSync(PERSONAS_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        fs.existsSync(path.join(PERSONAS_DIR, d.name, "agent.yml"))
    )
    .map((d) => d.name)
    .sort();
}

// --- Main Entry ---

export function getDeployConfig(): DeployConfig {
  const instance = loadInstanceYaml();
  const defaults = loadDefaults();
  const defaultsOpenclaw = (defaults.openclaw || {}) as Record<
    string,
    unknown
  >;
  const env = loadSecrets();

  const agentNames = getAgentDirs();
  const agents: AgentConfig[] = agentNames.map((name) => {
    const agentYaml = loadAgentYaml(name);
    const workspace = loadWorkspaceDir(name);

    // defaults.yml openclaw + agent.yml openclaw 병합
    const agentOpenclaw = agentYaml.openclaw
      ? deepMerge(defaultsOpenclaw, agentYaml.openclaw)
      : { ...defaultsOpenclaw };

    return {
      id: name,
      subdomain: agentYaml.subdomain,
      slackAccount: agentYaml.slackAccount,
      workspace,
      openclaw: agentOpenclaw,
    };
  });

  validateSecrets(agents, env);

  return {
    instance,
    agents,
    openclaw: defaultsOpenclaw,
    env,
  };
}

// Re-export types
export type {
  InstanceConfig,
  AgentConfig,
  DeployConfig,
  WorkspaceFile,
} from "./schema";
