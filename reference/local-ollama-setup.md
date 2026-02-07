# OpenClaw + 로컬 Ollama 모델 설정 가이드

> 출처: [GitHub Gist - Hegghammer](https://gist.github.com/Hegghammer/86d2070c0be8b3c62083d6653ad27c23)

## 개요

48GB VRAM으로 로컬 Moltbot/OpenClaw 인스턴스를 Ollama와 함께 설정하여 클라우드 API 의존성 없이 도구 사용 및 에이전틱 태스크를 수행합니다.

## 하드웨어 요구사항

- **GPU**: 최소 48GB VRAM (테스트: 2x RTX 3090)
- **RAM**: 64GB+ 권장
- **Storage**: 모델 파일용 ~50GB

## 소프트웨어 요구사항

- Ollama (특정 환경 플래그와 함께 실행)
- Moltbot/OpenClaw (npm으로 설치)
- Node.js 22+

## 모델 설정

`qwen2.5:72b-instruct-q3_K_M`을 수정하여 커스텀 "qwen-agentic" 모델 생성.

Modelfile에 도구 사용을 위한 시스템 프롬프트 포함:
- "USE THEM directly without asking for confirmation" 지시

## 핵심 설정

### Ollama 환경 변수

```bash
export OLLAMA_CONTEXT_LENGTH=16384
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_NEW_ENGINE=1
```

### Moltbot Provider 설정

**중요**: `api` 설정은 반드시 `'openai-completions'`여야 합니다.
`'openai-responses'`는 파싱 실패로 빈 응답을 유발합니다.

```json
{
  "providers": {
    "ollama": {
      "api": "openai-completions"
    }
  }
}
```

### 도구 설정

```json
{
  "tools": {
    "allow": ["read", "write", "exec", "web"],
    "exec": {
      "ask": "off",
      "security": "full"
    }
  }
}
```

- `"read"`를 allow 배열에 포함 필수 (스킬 파일 접근에 필수)
- `exec.ask: "off"`: 승인 팝업 방지
- `exec.security: "full"`: 제한 없는 명령 실행

## Verbosity 관리

`SOUL.md`에 명시적 간결성 지시 추가:
- 문서 덤프 방지
- 전체 JSON 응답 표시 방지
- 불필요한 확인 요청 방지

## 대안: Nemotron 모델

`nemotron-3-nano`는 유사한 성능을 제공하면서:
- **24.6GB** VRAM만 사용
- 최대 **512K** 컨텍스트 윈도우 지원
- 훨씬 효율적
