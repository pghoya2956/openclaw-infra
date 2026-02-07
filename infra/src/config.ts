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
}

// Load persona-specific .env
export function loadPersonaEnv(personaName: string): Record<string, string> {
  const envPath = path.join(__dirname, "..", `.env.${personaName}`);
  if (!fs.existsSync(envPath)) {
    throw new Error(`Persona env file not found: ${envPath}`);
  }

  const parsed = dotenv.parse(fs.readFileSync(envPath));
  return parsed;
}

// AWS Infrastructure constants
export const awsConfig = {
  vpcId: "vpc-098d05350c6ddeaa0", // IG-POC-SBX-VPC
  subnetId: "subnet-0df3efe6e8373fa82", // IG-POC-SBX-SBN1-AZa (public)
  keyName: "Chad",
  hostedZoneId: "Z06071792MIKNXBV41TCQ", // sbx.infograb.io
  baseDomain: "sbx.infograb.io",
};

// Lab persona configuration (hardcoded for Phase 0)
export function getLabPersona(): PersonaConfig {
  const env = loadPersonaEnv("lab");

  const required = ["OPENCLAW_GATEWAY_TOKEN", "SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "ANTHROPIC_SETUP_TOKEN"];
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required env var in .env.lab: ${key}`);
    }
  }

  return {
    name: "lab",
    subdomain: "lab.openclaw",
    instanceType: "t3.medium",
    volumeSize: 30,
    channels: ["slack"],
    env: {
      PERSONA_NAME: env.PERSONA_NAME || "lab",
      OPENCLAW_GATEWAY_TOKEN: env.OPENCLAW_GATEWAY_TOKEN,
      SLACK_BOT_TOKEN: env.SLACK_BOT_TOKEN,
      SLACK_APP_TOKEN: env.SLACK_APP_TOKEN,
      ANTHROPIC_SETUP_TOKEN: env.ANTHROPIC_SETUP_TOKEN,
    },
  };
}
