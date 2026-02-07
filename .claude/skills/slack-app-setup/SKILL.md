---
name: slack-app-setup
description: OpenClaw 페르소나용 Slack App을 생성하고 .env 파일까지 완성하는 단계별 가이드. "/slack-app-setup", "Slack App 만들어줘", "슬랙 앱 설정", "페르소나 Slack 연결" 요청 시 사용한다.
---

# Slack App Setup

OpenClaw 페르소나 배포를 위한 Slack App 생성 워크플로우. 각 페르소나는 별도 Slack App이 필요하다 (Socket Mode 이벤트가 동일 App Token의 여러 연결에 라운드 로빈 분배되므로 공유 불가).

## Argument Parsing

- `/slack-app-setup` (인자 없음): 생성할 페르소나 선택 안내
- `/slack-app-setup {persona-name}`: 특정 페르소나의 Slack App 생성 안내
- `/slack-app-setup verify`: 기존 .env 파일들의 필수 키 검증

## Workflow

### Step A: 페르소나 확인

대상 페르소나를 확인한다. `.claude/skills/deploy/references/persona-registry.md`에서 사용 가능한 페르소나 목록을 읽는다.

사용자에게 어떤 페르소나의 Slack App을 만들 것인지 질문한다 (AskUserQuestion 사용).

기존 `.env` 파일이 있는지 확인:

```bash
ls infra/.env.{persona-name} 2>/dev/null
```

이미 존재하면 사용자에게 알리고, 덮어쓸지 확인한다.

### Step B: Manifest 준비 + 클립보드 복사

`persona-registry.md`에서 대상 페르소나의 `identity.name`과 `identity.creature` 값을 읽는다. 이 값을 jq `--arg`로 주입하여 `assets/manifest.json`을 가공한 뒤 pbcopy로 클립보드에 복사한다:

```bash
jq --arg name "Product Leader" --arg role "AI Product Advisor" '
  .display_information.name = $name |
  .display_information.description = ("OpenClaw " + $role) |
  .features.bot_user.display_name = $name
' .claude/skills/slack-app-setup/assets/manifest.json | pbcopy
```

`$name`과 `$role` 값은 페르소나에 맞게 대체한다.

클립보드 복사 완료를 알리고, 바로 Step C 안내로 넘어간다.

### Step C: Slack App 생성 안내

사용자에게 아래 절차를 한 번에 안내한다:

```
○ https://api.slack.com/apps → Create New App → From a manifest
○ 워크스페이스 선택 → JSON 탭 → 클립보드 붙여넣기 → Create
○ Install to Workspace → Allow
○ OAuth & Permissions → Bot User OAuth Token (xoxb-...) 복사
○ Basic Information → App-Level Tokens → Generate Token and Scopes
  - Token Name: socket / Add Scope: connections:write / Generate
  - 생성된 토큰 (xapp-...) 복사
```

안내 후 사용자가 대화로 두 토큰을 전달할 때까지 대기한다 (AskUserQuestion 사용하지 않음). 토큰 형식 검증:
- Bot Token: `xoxb-` 접두사
- App Token: `xapp-` 접두사

### Step D: .env 파일 생성

수집한 토큰으로 `infra/.env.{persona-name}` 파일을 생성한다.

Gateway Token은 자동 생성:

```bash
openssl rand -hex 32
```

Anthropic Setup Token은 기존 `infra/.env.lab`에서 `ANTHROPIC_SETUP_TOKEN` 값을 읽어온다.

최종 .env 파일 형식:

```
PERSONA_NAME={persona-name}
OPENCLAW_GATEWAY_TOKEN={생성된 hex}
SLACK_BOT_TOKEN={사용자 입력}
SLACK_APP_TOKEN={사용자 입력}
ANTHROPIC_SETUP_TOKEN={lab에서 복사}
```

파일 권한 설정:

```bash
chmod 600 infra/.env.{persona-name}
```

### Step E: 검증

생성된 .env 파일의 필수 키를 검증한다:

```bash
for key in PERSONA_NAME OPENCLAW_GATEWAY_TOKEN SLACK_BOT_TOKEN SLACK_APP_TOKEN ANTHROPIC_SETUP_TOKEN; do
  grep -q "^${key}=" "infra/.env.{persona-name}" && echo "$key: OK" || echo "$key: MISSING"
done
```

모든 키가 OK이면 완료 보고:

```
--- {persona-name} Slack App Setup 완료 ---
Bot Token: xoxb-...{마지막 4자리만}
App Token: xapp-...{마지막 4자리만}
.env 파일: infra/.env.{persona-name}

다음 단계: pulumi preview로 배포 확인
```

## 주의사항

- 토큰은 절대 전체를 출력하지 않는다. 마지막 4자리만 표시하여 식별한다.
- `.env` 파일은 `.gitignore`에 포함되어 있어 커밋되지 않는다.
- Socket Mode는 Webhook URL 없이 WebSocket으로 이벤트를 수신하므로, EC2에 별도 인바운드 포트가 필요 없다.
- 하나의 Slack App을 여러 EC2 인스턴스에서 동시 사용하면 이벤트가 랜덤 분배되어 메시지 유실이 발생한다.
