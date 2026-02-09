import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import * as yaml from "js-yaml";
import {
  PersonaYaml,
  PersonaConfig,
  WorkspaceFile,
  validatePersonaYaml,
  validateSecrets,
  checkWorkspaceSize,
} from "./schema";

// Load shared .env
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

// --- YAML Loading ---

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const PERSONAS_DIR = path.join(PROJECT_ROOT, "personas");

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

/**
 * Deep-merge: 객체는 재귀 병합 (override 우선), 배열은 replace, null은 키 삭제
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };

  for (const [key, val] of Object.entries(override)) {
    if (val === null) {
      // null → 키 삭제
      delete result[key];
    } else if (
      Array.isArray(val) ||
      typeof val !== "object" ||
      val === undefined
    ) {
      // 배열, 원시값 → replace
      result[key] = val;
    } else if (
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      // 양쪽 모두 객체 → 재귀 병합
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

function loadPersonaYaml(name: string): PersonaYaml {
  const personaPath = path.join(PERSONAS_DIR, name, "persona.yml");
  if (!fs.existsSync(personaPath)) {
    throw new Error(`Persona file not found: ${personaPath}`);
  }

  const raw = yaml.load(fs.readFileSync(personaPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const defaults = loadDefaults();
  const merged = deepMerge(defaults, raw) as unknown as PersonaYaml;

  validatePersonaYaml(name, merged);

  return merged;
}

// --- Workspace Loading (glob-based) ---

function loadWorkspaceDir(name: string): WorkspaceFile[] {
  const workspaceDir = path.join(PERSONAS_DIR, name, "workspace");
  if (!fs.existsSync(workspaceDir)) {
    return [];
  }

  const files: WorkspaceFile[] = [];

  function walk(dir: string, prefix: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // .DS_Store 등 무시

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

export function loadPersonaEnv(personaName: string): Record<string, string> {
  const envPath = path.join(__dirname, "..", `.env.${personaName}`);
  if (!fs.existsSync(envPath)) {
    throw new Error(`Persona env file not found: ${envPath}`);
  }
  return dotenv.parse(fs.readFileSync(envPath));
}

// --- Main Entry ---

export function getPersonas(): PersonaConfig[] {
  const enabled = (process.env.ENABLED_PERSONAS || "lab")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return enabled.map((name) => {
    const yamlConfig = loadPersonaYaml(name);
    const env = loadPersonaEnv(name);
    const workspace = loadWorkspaceDir(name);

    validateSecrets(name, yamlConfig.openclaw, env);
    checkWorkspaceSize(name, workspace);

    return {
      name,
      subdomain: yamlConfig.subdomain,
      instanceType: yamlConfig.instance?.type || "t3.medium",
      volumeSize: yamlConfig.instance?.volumeSize || 30,
      traefik: yamlConfig.infra?.traefik ?? true,
      extensions: yamlConfig.infra?.extensions || [],
      systemDeps: yamlConfig.infra?.systemDeps || [],
      openclaw: yamlConfig.openclaw,
      env,
      workspace,
    };
  });
}

// Re-export for ec2.ts etc.
export type { PersonaConfig, WorkspaceFile } from "./schema";
