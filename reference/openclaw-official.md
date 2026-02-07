# OpenClaw 공식 레퍼런스

> 출처: [GitHub - openclaw/openclaw](https://github.com/openclaw/openclaw)

## 개요

OpenClaw은 로컬에서 실행되는 개인 AI 어시스턴트로, WhatsApp, Telegram, Slack, Discord 등 메시징 플랫폼과 통합됩니다.

## 설치

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

## 빠른 시작

```bash
openclaw onboard --install-daemon
openclaw gateway --port 18789 --verbose
openclaw message send --to +1234567890 --message "Hello from OpenClaw"
openclaw agent --message "Ship checklist" --thinking high
```

## 지원 채널

- WhatsApp (Baileys)
- Telegram (grammY)
- Slack (Bolt)
- Discord (discord.js)
- Google Chat
- Signal (signal-cli)
- iMessage
- BlueBubbles
- Microsoft Teams
- Matrix
- Zalo

## 주요 기능

- **Multi-channel inbox**: 통합 라우팅
- **Voice Wake / Talk Mode**: 음성 활성화 (macOS/iOS/Android, ElevenLabs 연동)
- **Live Canvas**: A2UI 에이전트 드리븐 워크스페이스
- **Browser control**: 전용 Chrome/Chromium 제어
- **Skills platform**: 번들/관리/워크스페이스 스킬 지원
- **자동화**: Cron jobs, webhooks, Gmail Pub/Sub

## 기본 설정

`~/.openclaw/openclaw.json`:

```json
{
  "agent": {
    "model": "anthropic/claude-opus-4-5"
  }
}
```

## 보안 설정

기본적으로 메인 세션에서 도구는 호스트에서 실행됩니다.

그룹 안전을 위해:
```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main"
      }
    }
  }
}
```

DM 정책은 기본 "pairing" 모드 - 알 수 없는 발신자는 승인 전 코드를 받습니다.

## 채팅 명령어

메시징 앱에서 사용:
- `/status` — 세션 상태 (모델, 토큰, 비용)
- `/new` 또는 `/reset` — 세션 리셋
- `/think <level>` — 사고 레벨 설정
- `/verbose on|off` — 상세 출력 토글

## 개발

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm ui:build
pnpm build
pnpm openclaw onboard --install-daemon
pnpm gateway:watch
```

## 리소스

- 웹사이트: https://openclaw.ai
- 문서: https://docs.openclaw.ai
- Discord: https://discord.gg/clawd
