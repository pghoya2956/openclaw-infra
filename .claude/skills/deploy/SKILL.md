---
name: deploy
description: OpenClaw EC2 인스턴스에 expert-team 페르소나를 배포한다. "/deploy", "배포해줘", "OpenClaw 띄워줘", "페르소나 배포", "{역할} 띄워줘", "인스턴스 생성해줘", "deploy status" 요청 시 사용한다. 페르소나별 SOUL.md/IDENTITY.md/AGENTS.md를 관리하고, Pulumi IaC로 AWS EC2에 배포한다.
---

# Deploy

OpenClaw EC2 인스턴스에 expert-team 페르소나를 Pulumi IaC로 배포한다.

## Persona Management

각 페르소나의 워크스페이스 파일은 `personas/{name}/` 하위에 관리된다:

```
personas/{name}/
├── SOUL.md        # 성격, 전문성, 프레임워크 (Core Truths/Boundaries/Vibe/Continuity)
├── IDENTITY.md    # 표시 이름, 이모지, 바이브 (마크다운 key-value 형식)
└── AGENTS.md      # 운영 규칙, 도구 사용법
```

사용 가능한 페르소나와 인프라 매핑은 `references/persona-registry.md` 참조.
페르소나 원본 전문성은 `/expert-team` 스킬의 `references/{name}.md`에서 유래.

## Argument Parsing

- `/deploy` (인자 없음): 페르소나 목록 표시 후 선택 안내
- `/deploy {name}`: 특정 페르소나 1개 배포
- `/deploy {name},{name},...`: 복수 페르소나 동시 배포
- `/deploy list`: 사용 가능한 페르소나 목록과 현재 배포 상태
- `/deploy status`: 배포된 인스턴스의 서비스 상태 확인

## Workflow

### Step A: Environment Check

```bash
aws sts get-caller-identity    # AWS 인증
pulumi version                  # Pulumi CLI
node --version                  # Node.js 18+
```

`infra/` 디렉토리에 `node_modules`가 없으면 `npm install` 실행.

### Step B: Persona Selection

1. `references/persona-registry.md`에서 사용 가능한 페르소나 확인
2. 요청된 페르소나의 `personas/{name}/` 디렉토리 존재 확인
3. SOUL.md 내용이 비어있지 않은지 확인

### Step C: Secret Collection

각 페르소나별 `infra/.env.{name}` 파일을 확인한다. 없거나 불완전하면 수집:

| 키 | 설명 | 생성 방법 |
|-----|------|----------|
| `PERSONA_NAME` | 페르소나 이름 | 자동 설정 |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 인증 토큰 | `openssl rand -hex 32` |
| `SLACK_BOT_TOKEN` | Slack Bot Token | Slack API에서 복사 (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack App Token | Socket Mode 생성 (`xapp-...`) |
| `ANTHROPIC_SETUP_TOKEN` | Anthropic Setup Token | `claude setup-token` (`sk-ant-oat01-...`) |

**Slack App Checklist** (신규 페르소나용):

```
Slack API (https://api.slack.com/apps):
- Create New App -> From scratch
- Socket Mode: Enable
- App-Level Token (connections:write) -> xapp-...
- Event Subscriptions: Enable
- Subscribe to bot events: message.im, message.channels, app_mention
- Bot Token Scopes: chat:write, im:history, channels:history, app_mentions:read, users:read
- Install to Workspace -> Bot Token xoxb-...
- App Home -> Messages Tab: Enable
```

**주의**: 각 페르소나는 **별도 Slack App** 필요. Socket Mode에서 동일 App Token의 여러 연결은 이벤트를 라운드 로빈 분배하여 메시지가 유실된다.

`ANTHROPIC_SETUP_TOKEN`은 모든 페르소나에서 공유 가능 (동일 Max 요금제).

### Step D: Secret Validation

```
OPENCLAW_GATEWAY_TOKEN — hex, 최소 32자
SLACK_BOT_TOKEN — "xoxb-" prefix
SLACK_APP_TOKEN — "xapp-" prefix
ANTHROPIC_SETUP_TOKEN — "sk-ant-oat01-" prefix, 최소 80자
```

### Step E: Deploy

```bash
cd infra
export AWS_PROFILE=sandbox
export ENABLED_PERSONAS=lab,product-leader   # 쉼표 구분
pulumi preview
```

Preview 결과에서 **openclaw 리소스만 영향받는지** 확인 후 사용자 승인:

```bash
pulumi up --yes
```

### Step F: Wait for User Data

각 EC2에 SSH 접속하여 완료 확인:

```bash
ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no ec2-user@<publicIp>
sudo tail -f /var/log/user-data.log
# "=== User Data completed ===" 확인 (최대 5분)
```

### Step G: Service Verification

각 인스턴스에서:

```bash
export OPENCLAW_STATE_DIR=/opt/openclaw
export XDG_RUNTIME_DIR=/run/user/$(id -u)

systemctl --user status openclaw-gateway       # active (running)
openclaw models status                          # anthropic: token
openclaw channels status --probe                # Slack: works
curl -sk -o /dev/null -w "%{http_code}" https://<domain>/   # HTTP 200
cat ~/.openclaw/workspace/SOUL.md               # 페르소나 내용 존재
```

### Step H: Device Pairing

HTTPS 접속 시 "pairing required" 표시되면:

```bash
ssh ec2-user@<IP>
export OPENCLAW_STATE_DIR=/opt/openclaw
openclaw devices list          # Pending 요청 확인
openclaw devices approve <requestId>
```

### Step I: Result Report

```
OpenClaw 배포 완료
---
페르소나: {name}
Instance: {instanceId}
IP: {publicIp}
Domain: {subdomain}.sbx.infograb.io

서비스:
- Gateway: active (running)
- Anthropic: token
- Slack: works
- HTTPS: 200

접속:
- SSH: ssh -i ~/.ssh/id_ed25519 ec2-user@{IP}
- Web: https://{domain}
- Slack: @{봇이름}으로 DM 또는 멘션
```

## Error Recovery

| 에러 | 진단 | 해결 |
|------|------|------|
| npm install 실패 | git 미설치 | `sudo dnf install -y git` |
| docker compose 실패 | compose 미설치 | compose 바이너리 수동 설치 |
| onboard 실패 | 토큰 오류 | `.env.{name}` 토큰 재확인 |
| Slack 미연결 | 토큰 누락 | Slack App 체크리스트 재확인 |
| HTTPS 미응답 | Traefik 미시작 | `sudo docker compose up -d` |
| pairing required | 기기 미승인 | `openclaw devices approve` |
| SOUL.md 미적용 | 파일 경로 오류 | `~/.openclaw/workspace/SOUL.md` 확인 |

## Important Notes

- 다른 EC2 인스턴스를 절대 건드리지 않는다
- `.env.*` 파일은 시크릿 — Git 커밋 금지
- Setup Token 만료 시: `claude setup-token` 재실행 → `.env.*` 업데이트 → `pulumi up`
- 비용 절감: 미사용 시 `aws ec2 stop-instances`
- SOUL.md는 20,000자 이내 (시스템 프롬프트 주입 시 truncation)
- 워크스페이스 파일은 onboard **이전에** 배포 (`writeFileIfMissing()` 활용)
