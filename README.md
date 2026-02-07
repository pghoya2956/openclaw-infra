# OpenClaw AWS 배포

Pulumi IaC로 AWS EC2에 OpenClaw 인스턴스를 배포하고, Slack 연동 + HTTPS 웹 접근을 구성한다.

## 아키텍처

```
Internet
  |
  +-- Slack API (Socket Mode, outbound only)
  |     <-> WebSocket (인바운드 포트 불필요)
  |
  v
+-------------------------------------------------------+
|  EC2 (t3.medium, Amazon Linux 2023)                    |
|                                                        |
|  systemd user service: openclaw-gateway                |
|  openclaw gateway --bind lan --port 18789              |
|                                                        |
|  State: /opt/openclaw/                                 |
|  +-- openclaw.json (gateway/auth 설정)                 |
|  +-- agents/main/agent/auth-profiles.json (인증)       |
|  +-- .env (환경변수)                                    |
|                  | :18789                               |
|  Docker: Traefik v3 (HTTPS)                            |
|  :443 -> host:18789 (Let's Encrypt auto-TLS)           |
|                                                        |
+-------------------------------------------------------+
        |
        v
  Route53: <subdomain>.sbx.infograb.io -> EC2 Public IP
```

## 사전 요구사항

- AWS 계정 + CLI 프로필 (`AWS_PROFILE` 설정)
- Pulumi CLI (`pulumi` 명령)
- Node.js 18+
- Anthropic **Max 요금제** (Setup Token 발급용)
- Slack App (Socket Mode 활성화)

## 시크릿 준비

### Anthropic Setup Token

로컬에서 Claude Code CLI로 Setup Token을 생성한다:

```bash
claude setup-token
```

출력된 `sk-ant-oat01-...` 토큰을 복사한다. 이 토큰은 Max 요금제 계정에 연결되며, API Key와 달리 별도 과금이 없다.

### Slack App 토큰

Slack API (https://api.slack.com/apps) 에서 앱을 생성하고 아래 설정을 완료한다:

**필수 설정:**
- Socket Mode: Enable
- App-Level Token 생성 (`connections:write` 스코프) → `xapp-...`
- Event Subscriptions: Enable
- Subscribe to bot events: `message.im`, `message.channels`, `app_mention`
- Bot Token Scopes: `chat:write`, `im:history`, `channels:history`, `app_mentions:read`, `users:read`
- Install to Workspace → Bot Token `xoxb-...` 복사
- App Home → Messages Tab: Enable

### Gateway Token

랜덤 토큰을 생성한다:

```bash
openssl rand -hex 32
```

## 설정

### .env.lab 파일 생성

```bash
cd infra
cp .env.example .env.lab
```

`.env.lab`을 편집하여 시크릿을 채운다:

```
PERSONA_NAME=lab
OPENCLAW_GATEWAY_TOKEN=<openssl rand -hex 32 결과>
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ANTHROPIC_SETUP_TOKEN=sk-ant-oat01-...
```

### AWS 인프라 상수

`infra/src/config.ts`의 `awsConfig` 객체에서 VPC, Subnet, Key Pair 등을 환경에 맞게 수정한다.

## 배포

```bash
cd infra
npm install
export AWS_PROFILE=sandbox    # 본인의 AWS 프로필

pulumi preview   # 변경 사항 확인
pulumi up        # 배포 실행
```

배포 완료 후 출력:

```
Outputs:
    domain     : "lab.openclaw.sbx.infograb.io"
    gatewayUrl : "https://lab.openclaw.sbx.infograb.io"
    publicIp   : "x.x.x.x"
    sshCommand : "ssh -i ~/.ssh/id_ed25519 ec2-user@x.x.x.x"
```

## 배포 후 확인

### SSH 접속

```bash
ssh -i ~/.ssh/id_ed25519 ec2-user@<publicIp>
```

### User Data 로그 확인

```bash
sudo tail -f /var/log/user-data.log
```

`=== User Data completed ===` 메시지가 나올 때까지 대기한다 (약 2~3분).

### 서비스 상태 확인

```bash
export OPENCLAW_STATE_DIR=/opt/openclaw

# Gateway 프로세스
systemctl --user status openclaw-gateway

# Anthropic 인증
openclaw models status

# Slack 연결
openclaw channels status --probe
```

정상 출력 예시:

```
# systemctl --user status openclaw-gateway
● openclaw-gateway.service - OpenClaw Gateway
     Active: active (running)

# openclaw models status
Auth store    : /opt/openclaw/agents/main/agent/auth-profiles.json
Providers w/ OAuth/tokens (1): anthropic (1)
- anthropic:default=token:sk-ant-o...

# openclaw channels status --probe
- Slack default: enabled, configured, running, works
```

### HTTPS 접속

브라우저에서 `https://<domain>` 접속 → Control UI 확인.

Let's Encrypt 인증서 발급에 수십 초 소요될 수 있다. 첫 접속 시 잠시 대기.

### Slack 테스트

- 봇에게 DM 전송 → AI 응답 수신
- 채널에서 `@봇이름 안녕` 멘션 → AI 응답 수신

## EC2에서 실행되는 것

User Data 스크립트가 다음을 자동으로 수행한다:

```
Node.js 22 + Docker + Git 설치
  → Docker Compose V2 플러그인 설치
  → npm install -g openclaw@latest
  → loginctl enable-linger ec2-user
  → /opt/openclaw 디렉토리 생성 + .env 파일 작성
  → openclaw onboard (비대화형)
      --auth-choice token (Setup Token으로 Anthropic 인증)
      --gateway-bind lan --gateway-port 18789
      --install-daemon (systemd user 서비스 설치)
  → trustedProxies 설정 (Traefik Docker IP)
  → systemd 서비스에 Slack 환경변수 주입
  → Gateway 재시작
  → Traefik 컨테이너 시작 (HTTPS 프록시)
```

## 운영

### 서비스 재시작

```bash
systemctl --user restart openclaw-gateway
```

### 로그 확인

```bash
journalctl --user -u openclaw-gateway -f
```

### OpenClaw 업데이트

```bash
sudo npm install -g openclaw@latest
systemctl --user restart openclaw-gateway
```

### Setup Token 갱신

토큰 만료 시 두 가지 방법:

**방법 A — Pulumi 재배포:**
로컬에서 `claude setup-token` → `.env.lab` 업데이트 → `pulumi up`

**방법 B — SSH 수동 갱신:**
```bash
ssh -i ~/.ssh/id_ed25519 ec2-user@<IP>
export OPENCLAW_STATE_DIR=/opt/openclaw
openclaw models auth setup-token --provider anthropic
# → 로컬에서 claude setup-token 실행 후 토큰 붙여넣기
```

### 인스턴스 중지/시작

비용 절감을 위해 미사용 시 중지:

```bash
# AWS CLI로 중지
aws ec2 stop-instances --instance-ids <instanceId>

# 재시작
aws ec2 start-instances --instance-ids <instanceId>
```

재시작 후 Public IP가 변경되므로, `pulumi up`으로 DNS를 업데이트하거나 Elastic IP를 할당한다.

### 인프라 삭제

```bash
cd infra
pulumi destroy
```

## 디렉토리 구조

```
OpenClaw/
├── CLAUDE.md              # 프로젝트 컨텍스트
├── README.md              # 이 문서
├── .env                   # 프로젝트 수준 시크릿
├── docs/
│   └── troubleshooting.md
├── tasks/                 # 작업 추적
├── openclaw/              # 서브모듈 (수정 금지)
└── infra/                 # Pulumi IaC
    ├── index.ts           # 엔트리포인트
    ├── src/
    │   ├── config.ts      # 페르소나 설정 + AWS 상수
    │   ├── templates.ts   # User Data + Traefik 템플릿
    │   ├── ec2.ts         # EC2 인스턴스
    │   ├── dns.ts         # Route53 레코드
    │   └── security.ts    # Security Group
    ├── .env.lab           # lab 페르소나 시크릿
    └── .env.example       # 시크릿 템플릿
```

## 핵심 설계 결정

| 결정 | 이유 |
|------|------|
| Setup Token (Max 요금제) | API Key는 사용량 과금. Setup Token은 Max 구독에 포함 |
| npm 전역 설치 | 공식 Docker 이미지 없음. npm이 공식 설치 경로 |
| systemd user 서비스 | `openclaw onboard --install-daemon`이 자동 생성 |
| Traefik File provider | OpenClaw는 호스트에서 실행 (Docker 아님). File provider로 호스트 포트에 프록시 |
| 고정 Docker 네트워크 | trustedProxies에 Traefik IP를 지정하기 위해 `172.28.0.0/24` 고정 |
| Slack Socket Mode | 인바운드 포트 불필요. 방화벽 친화적 |
