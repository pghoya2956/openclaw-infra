/**
 * openclaw-config.ts — persona.yml의 openclaw 섹션을 openclaw.json 문자열로 변환
 *
 * onboard가 생성하는 기본 openclaw.json에 persona config를 deep-merge한다.
 * 실제로는 빌드 타임에 최종 config를 생성하고, EC2에서 onboard 후 파일을 교체한다.
 */

import { PersonaConfig } from "./schema";

/**
 * onboard가 생성하는 기본 openclaw.json 구조.
 * onboard --non-interactive가 설정하는 최소 필드만 포함.
 * 나머지는 persona.yml의 openclaw 섹션으로 덮어쓴다.
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
 * persona.yml의 openclaw 섹션을 최종 openclaw.json 문자열로 변환한다.
 *
 * 흐름:
 *   onboard 기본값 + persona.yml openclaw → deep-merge → JSON 문자열
 *
 * onboard가 먼저 실행되어 기본 구조를 만들고,
 * 이 함수의 출력이 EC2에서 openclaw.json을 교체한다.
 */
export function generateOpenclawConfig(persona: PersonaConfig): string {
  const base = getOnboardDefaults();
  const merged = deepMerge(base, persona.openclaw);
  return JSON.stringify(merged, null, 2);
}
