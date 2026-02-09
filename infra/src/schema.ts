/**
 * schema.ts — 통합형 멀티에이전트 타입 정의 + 검증
 *
 * 인프라가 해석하는 필드만 strict 타입.
 * openclaw 섹션은 통째로 passthrough (OpenClaw 네이티브 스키마).
 */

// --- agent.yml 원본 타입 ---

export interface AgentYaml {
  subdomain: string;
  slackAccount: string;

  // 에이전트별 OpenClaw 설정 (defaults.yml과 병합)
  openclaw?: Record<string, unknown>;
}

// --- instance.yml 원본 타입 ---

export interface InstanceYaml {
  instance: {
    type: string;
    volumeSize: number;
    swapSizeGB?: number;
  };
  infra: {
    traefik: boolean;
    extensions: string[];
    systemDeps: string[];
  };
}

// --- 런타임 타입 ---

export interface InstanceConfig {
  type: string;
  volumeSize: number;
  swapSizeGB: number;
  traefik: boolean;
  extensions: string[];
  systemDeps: string[];
}

export interface AgentConfig {
  id: string; // 디렉토리명에서 파생
  subdomain: string;
  slackAccount: string;
  workspace: WorkspaceFile[];
  openclaw: Record<string, unknown>;
}

export interface DeployConfig {
  instance: InstanceConfig;
  agents: AgentConfig[];
  openclaw: Record<string, unknown>; // defaults.yml의 공유 openclaw 설정
  env: Record<string, string>; // 통합 .env.secrets
}

export interface WorkspaceFile {
  /** EC2에서의 상대 경로 (예: "SOUL.md", "skills/delegate/SKILL.md") */
  relativePath: string;
  content: string;
}

// --- 검증 ---

export function validateAgentYaml(name: string, yml: AgentYaml): void {
  if (!yml.subdomain) {
    throw new Error(`personas/${name}/agent.yml: 'subdomain' is required`);
  }

  if (typeof yml.subdomain !== "string") {
    throw new Error(`personas/${name}/agent.yml: 'subdomain' must be a string`);
  }

  if (!yml.slackAccount) {
    throw new Error(`personas/${name}/agent.yml: 'slackAccount' is required`);
  }
}

export function validateInstanceYaml(yml: InstanceYaml): void {
  if (!yml.instance) {
    throw new Error(`personas/instance.yml: 'instance' section is required`);
  }

  if (!yml.instance.type) {
    throw new Error(`personas/instance.yml: 'instance.type' is required`);
  }

  if (
    typeof yml.instance.volumeSize !== "number" ||
    yml.instance.volumeSize < 8
  ) {
    throw new Error(
      `personas/instance.yml: 'instance.volumeSize' must be >= 8`
    );
  }
}

/**
 * 통합 .env.secrets의 필수 환경변수를 검증한다.
 * 항상 필수: OPENCLAW_GATEWAY_TOKEN, ANTHROPIC_SETUP_TOKEN
 * 에이전트별: Slack 토큰 쌍 (활성 에이전트만)
 */
export function validateSecrets(
  agents: AgentConfig[],
  env: Record<string, string>
): void {
  const alwaysRequired = ["OPENCLAW_GATEWAY_TOKEN", "ANTHROPIC_SETUP_TOKEN"];
  for (const key of alwaysRequired) {
    if (!env[key]) {
      throw new Error(`Missing required env var in .env.secrets: ${key}`);
    }
  }

  // 에이전트별 Slack 토큰 검증
  for (const agent of agents) {
    const suffix = agent.slackAccount.toUpperCase();
    const botKey = `SLACK_BOT_TOKEN__${suffix}`;
    const appKey = `SLACK_APP_TOKEN__${suffix}`;

    if (!env[botKey]) {
      console.warn(
        `WARNING: Missing ${botKey} for agent '${agent.id}'. Slack binding will fail.`
      );
    }
    if (!env[appKey]) {
      console.warn(
        `WARNING: Missing ${appKey} for agent '${agent.id}'. Slack binding will fail.`
      );
    }
  }
}
