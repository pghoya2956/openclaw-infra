import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load shared .env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Persona configuration
export interface PersonaConfig {
  name: string;
  subdomain: string;
  instanceType: string;
  volumeSize: number;
  channels: string[];
  env: Record<string, string>;
  personaDir: string;
  identity: {
    name: string;
    emoji: string;
  };
}

// Workspace files loaded from persona directory
export interface WorkspaceFiles {
  soul: string;
  identity: string;
  agents: string;
}

// Persona definitions (metadata only, secrets loaded from .env.{name})
type PersonaDefinition = Omit<PersonaConfig, "env">;

const PERSONA_DEFINITIONS: Record<string, PersonaDefinition> = {
  lab: {
    name: "lab",
    subdomain: "lab.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/lab",
    identity: { name: "Lab", emoji: "beaker" },
  },
  "product-leader": {
    name: "product-leader",
    subdomain: "product.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/product-leader",
    identity: { name: "Product Leader", emoji: "compass" },
  },
  "engineering-lead": {
    name: "engineering-lead",
    subdomain: "eng.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/engineering-lead",
    identity: { name: "Engineering Lead", emoji: "wrench" },
  },
  "growth-expert": {
    name: "growth-expert",
    subdomain: "growth.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/growth-expert",
    identity: { name: "Growth Expert", emoji: "chart_with_upwards_trend" },
  },
  "ceo-advisor": {
    name: "ceo-advisor",
    subdomain: "ceo.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/ceo-advisor",
    identity: { name: "CEO Advisor", emoji: "briefcase" },
  },
  "strategy-consultant": {
    name: "strategy-consultant",
    subdomain: "strategy.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/strategy-consultant",
    identity: { name: "Strategy Consultant", emoji: "chess_pawn" },
  },
  "design-director": {
    name: "design-director",
    subdomain: "design.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/design-director",
    identity: { name: "Design Director", emoji: "art" },
  },
  "data-scientist": {
    name: "data-scientist",
    subdomain: "data.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/data-scientist",
    identity: { name: "Data Scientist", emoji: "bar_chart" },
  },
  "marketing-director": {
    name: "marketing-director",
    subdomain: "marketing.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    personaDir: ".claude/skills/deploy/personas/marketing-director",
    identity: { name: "Marketing Director", emoji: "loudspeaker" },
  },
};

// Load persona-specific .env
export function loadPersonaEnv(personaName: string): Record<string, string> {
  const envPath = path.join(__dirname, "..", `.env.${personaName}`);
  if (!fs.existsSync(envPath)) {
    throw new Error(`Persona env file not found: ${envPath}`);
  }

  const parsed = dotenv.parse(fs.readFileSync(envPath));
  return parsed;
}

// Load workspace files (SOUL.md, IDENTITY.md, AGENTS.md) from persona directory
export function loadWorkspaceFiles(personaDir: string): WorkspaceFiles {
  const projectRoot = path.join(__dirname, "..", "..");
  const dir = path.join(projectRoot, personaDir);

  const soulPath = path.join(dir, "SOUL.md");
  if (!fs.existsSync(soulPath)) {
    throw new Error(`SOUL.md not found: ${soulPath}`);
  }

  const identityPath = path.join(dir, "IDENTITY.md");
  const agentsPath = path.join(dir, "AGENTS.md");

  return {
    soul: fs.readFileSync(soulPath, "utf-8"),
    identity: fs.existsSync(identityPath)
      ? fs.readFileSync(identityPath, "utf-8")
      : "",
    agents: fs.existsSync(agentsPath)
      ? fs.readFileSync(agentsPath, "utf-8")
      : "",
  };
}

// AWS Infrastructure constants
export const awsConfig = {
  vpcId: "vpc-098d05350c6ddeaa0", // IG-POC-SBX-VPC
  subnetId: "subnet-0df3efe6e8373fa82", // IG-POC-SBX-SBN1-AZa (public)
  keyName: "Chad",
  hostedZoneId: "Z06071792MIKNXBV41TCQ", // sbx.infograb.io
  baseDomain: "sbx.infograb.io",
};

// Load enabled personas based on ENABLED_PERSONAS env var
export function getPersonas(): PersonaConfig[] {
  const enabled = (process.env.ENABLED_PERSONAS || "lab")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return enabled.map((name) => {
    const def = PERSONA_DEFINITIONS[name];
    if (!def) {
      const available = Object.keys(PERSONA_DEFINITIONS).join(", ");
      throw new Error(`Unknown persona: "${name}". Available: ${available}`);
    }

    const env = loadPersonaEnv(name);

    const required = [
      "OPENCLAW_GATEWAY_TOKEN",
      "SLACK_BOT_TOKEN",
      "SLACK_APP_TOKEN",
      "ANTHROPIC_SETUP_TOKEN",
    ];
    for (const key of required) {
      if (!env[key]) {
        throw new Error(`Missing required env var in .env.${name}: ${key}`);
      }
    }

    return {
      ...def,
      env: {
        PERSONA_NAME: env.PERSONA_NAME || name,
        OPENCLAW_GATEWAY_TOKEN: env.OPENCLAW_GATEWAY_TOKEN,
        SLACK_BOT_TOKEN: env.SLACK_BOT_TOKEN,
        SLACK_APP_TOKEN: env.SLACK_APP_TOKEN,
        ANTHROPIC_SETUP_TOKEN: env.ANTHROPIC_SETUP_TOKEN,
      },
    };
  });
}
