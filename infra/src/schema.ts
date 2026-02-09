/**
 * schema.ts — persona.yml 타입 정의 + 검증
 *
 * 인프라가 해석하는 필드만 strict 타입.
 * openclaw 섹션은 통째로 passthrough (OpenClaw 네이티브 스키마).
 */

// --- persona.yml 원본 타입 ---

export interface PersonaYaml {
  subdomain: string;

  instance?: {
    type?: string;
    volumeSize?: number;
  };

  infra?: {
    traefik?: boolean;
    extensions?: string[];
    systemDeps?: string[];
  };

  // openclaw.json에 1:1 매핑되는 passthrough 섹션
  openclaw: Record<string, unknown>;
}

// --- 병합 후 런타임 타입 ---

export interface PersonaConfig {
  name: string;
  subdomain: string;
  instanceType: string;
  volumeSize: number;
  traefik: boolean;
  extensions: string[];
  systemDeps: string[];
  openclaw: Record<string, unknown>;
  env: Record<string, string>;
  workspace: WorkspaceFile[];
}

export interface WorkspaceFile {
  /** EC2에서의 상대 경로 (예: "SOUL.md", "skills/my-skill/SKILL.md") */
  relativePath: string;
  content: string;
}

// --- 채널별 필수 환경변수 매핑 ---

export const CHANNEL_SECRET_MAP: Record<string, string[]> = {
  slack: ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"],
  telegram: ["TELEGRAM_BOT_TOKEN"],
  discord: ["DISCORD_BOT_TOKEN"],
  line: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"],
  // whatsapp: QR 페어링, 토큰 불필요
  // signal: signal-cli 자체 관리
};

// --- 검증 ---

export function validatePersonaYaml(name: string, yaml: PersonaYaml): void {
  if (!yaml.subdomain) {
    throw new Error(`personas/${name}/persona.yml: 'subdomain' is required`);
  }

  if (typeof yaml.subdomain !== "string") {
    throw new Error(
      `personas/${name}/persona.yml: 'subdomain' must be a string`
    );
  }

  if (!yaml.openclaw || typeof yaml.openclaw !== "object") {
    throw new Error(
      `personas/${name}/persona.yml: 'openclaw' section is required`
    );
  }

  if (yaml.instance?.volumeSize !== undefined) {
    if (typeof yaml.instance.volumeSize !== "number" || yaml.instance.volumeSize < 8) {
      throw new Error(
        `personas/${name}/persona.yml: 'instance.volumeSize' must be >= 8`
      );
    }
  }
}

/**
 * 활성 채널 기반으로 .env.{name}의 필수 환경변수를 검증한다.
 * 항상 필수: OPENCLAW_GATEWAY_TOKEN, ANTHROPIC_SETUP_TOKEN
 * 채널별: CHANNEL_SECRET_MAP 참조
 */
export function validateSecrets(
  name: string,
  openclaw: Record<string, unknown>,
  env: Record<string, string>
): void {
  const alwaysRequired = ["OPENCLAW_GATEWAY_TOKEN", "ANTHROPIC_SETUP_TOKEN"];
  for (const key of alwaysRequired) {
    if (!env[key]) {
      throw new Error(`Missing required env var in .env.${name}: ${key}`);
    }
  }

  // 활성 채널에서 필수 환경변수 추출
  const channels = openclaw.channels as Record<string, unknown> | undefined;
  if (!channels) return;

  for (const [channelName, channelConfig] of Object.entries(channels)) {
    if (channelName === "defaults") continue;
    if (channelConfig === null || channelConfig === false) continue;

    const requiredKeys = CHANNEL_SECRET_MAP[channelName];
    if (!requiredKeys) continue; // 알 수 없는 채널은 건너뜀 (passthrough)

    for (const key of requiredKeys) {
      if (!env[key]) {
        throw new Error(
          `Missing env var in .env.${name}: ${key} (required by channel '${channelName}')`
        );
      }
    }
  }
}

// --- 워크스페이스 크기 체크 ---

const WORKSPACE_SIZE_WARNING_BYTES = 12 * 1024; // 12KB

export function checkWorkspaceSize(
  name: string,
  files: WorkspaceFile[]
): void {
  const totalBytes = files.reduce(
    (sum, f) => sum + Buffer.byteLength(f.content, "utf-8"),
    0
  );

  if (totalBytes > WORKSPACE_SIZE_WARNING_BYTES) {
    console.warn(
      `WARNING: personas/${name}/workspace total size is ${(totalBytes / 1024).toFixed(1)}KB ` +
      `(exceeds ${WORKSPACE_SIZE_WARNING_BYTES / 1024}KB). ` +
      `User Data 16KB limit may be exceeded. Consider S3 upload for large workspaces.`
    );
  }
}
