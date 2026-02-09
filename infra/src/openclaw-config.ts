/**
 * openclaw-config.ts — 통합 openclaw.json 생성
 *
 * 모든 에이전트의 설정을 하나의 openclaw.json으로 합성한다.
 * agents.list[], bindings[], channels.slack.accounts를 자동 생성.
 */

import { DeployConfig } from "./schema";

/**
 * onboard가 생성하는 기본 openclaw.json 구조.
 */
function getOnboardDefaults(): Record<string, unknown> {
  return {
    gateway: {
      mode: "local",
    },
  };
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

/**
 * 통합 openclaw.json을 생성한다.
 *
 * 흐름:
 *   onboard 기본값 + defaults.yml openclaw → deep-merge
 *   + agents.list[] (에이전트별)
 *   + bindings[] (Slack accountId → agentId)
 *   + channels.slack.accounts (${VAR} 치환 참조)
 */
export function generateOpenclawConfig(config: DeployConfig): string {
  const base = getOnboardDefaults();
  const merged = deepMerge(base, config.openclaw);

  // agents.list 생성
  const agentsList = config.agents.map((agent, i) => ({
    id: agent.id,
    workspace: `/home/ec2-user/.openclaw/workspace-${agent.id}`,
    ...(i === 0 ? { default: true } : {}),
  }));

  // bindings 생성 (Slack accountId → agentId)
  const bindings = config.agents.map((agent) => ({
    agentId: agent.id,
    match: {
      channel: "slack",
      accountId: agent.slackAccount,
    },
  }));

  // channels.slack.accounts 생성 (${VAR} 치환 참조)
  const accounts: Record<string, Record<string, string>> = {};
  for (const agent of config.agents) {
    const suffix = agent.slackAccount.toUpperCase();
    accounts[agent.slackAccount] = {
      botToken: `\${SLACK_BOT_TOKEN__${suffix}}`,
      appToken: `\${SLACK_APP_TOKEN__${suffix}}`,
    };
  }

  // 최종 config 합성
  const final = {
    ...merged,
    agents: {
      ...(merged.agents as Record<string, unknown> | undefined),
      list: agentsList,
    },
    bindings,
    channels: deepMerge(
      (merged.channels || {}) as Record<string, unknown>,
      {
        slack: {
          accounts,
        },
      }
    ),
  };

  return JSON.stringify(final, null, 2);
}
