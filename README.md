# openclaw-infra

Pulumi IaC로 AWS EC2에 OpenClaw 인스턴스를 배포한다. 페르소나별 독립 EC2 인스턴스에 Slack 연동, HTTPS, 전문가 페르소나를 자동 구성한다.

## 아키텍처

```
                    Slack API (Socket Mode)
                    ┌──────────────┐
                    │  Workspace   │
       ┌────────────┤              ├──────────────┐
       │            └──────┬───────┘               │
       │                   │                       │
  [Slack App A]      [Slack App B]           [Slack App N]
       │                   │                       │
       v                   v                       v
  EC2: lab            EC2: product           EC2: growth
  SOUL.md             SOUL.md                SOUL.md
  (범용 어시스턴트)    (제품 전략)             (성장 전략)
       │                   │                       │
       v                   v                       v
  Traefik (HTTPS)    Traefik (HTTPS)         Traefik (HTTPS)
       │                   │                       │
  lab.openclaw.      product.openclaw.       growth.openclaw.
  {BASE_DOMAIN}      {BASE_DOMAIN}           {BASE_DOMAIN}
```

각 EC2 내부:

```
EC2 (t3.medium, Amazon Linux 2023)
├── OpenClaw Gateway (systemd user service, :18789)
│   ├── SOUL.md       — 페르소나 정체성/전문성
│   ├── IDENTITY.md   — 봇 표시 이름/이모지
│   └── AGENTS.md     — 운영 규칙
├── Traefik (Docker, :443 → :18789, Let's Encrypt)
└── State: /opt/openclaw/
```

## 페르소나

| 이름 | 서브도메인 | 역할 |
|------|-----------|------|
| lab | lab.openclaw | 범용 AI 어시스턴트 |
| product-leader | product.openclaw | 제품 전략, 우선순위, 로드맵 |
| engineering-lead | eng.openclaw | 아키텍처, 기술 의사결정 |
| growth-expert | growth.openclaw | 퍼널 분석, 성장 전략 |
| ceo-advisor | ceo.openclaw | CEO 관점 의사결정 |
| strategy-consultant | strategy.openclaw | 전략 분석 |
| design-director | design.openclaw | UX/UI 디자인 |
| data-scientist | data.openclaw | 데이터 분석, 실험 설계 |
| marketing-director | marketing.openclaw | 마케팅 전략 |

각 페르소나의 전체 도메인은 `{subdomain}.{BASE_DOMAIN}` 형태 (예: `lab.openclaw.example.com`).
상위 4개가 현재 배포 대상. 나머지 5개는 워크스페이스 파일만 준비됨.

## 사전 요구사항

- AWS CLI + 프로필
- Pulumi CLI
- Node.js 18+
- Anthropic Max 요금제 (Setup Token 발급용)
- 페르소나별 Slack App (Socket Mode)

## 빠른 시작

```bash
# 서브모듈 포함 clone
git clone --recurse-submodules https://github.com/your-username/openclaw-infra.git
cd openclaw-infra/infra
npm install

# 인프라 환경변수 설정
cp .env.example .env
# .env 편집 (AWS VPC, 도메인, 태그 등)

# 페르소나별 시크릿 파일 생성
cp .env.example .env.lab
# .env.lab 편집 (Slack/Anthropic 토큰)

# 배포
export ENABLED_PERSONAS=lab
pulumi preview
pulumi up
```

## 환경변수

### 인프라 공용 (`infra/.env`)

| 변수 | 필수 | 설명 |
|------|------|------|
| `AWS_VPC_ID` | O | VPC ID |
| `AWS_SUBNET_ID` | O | Public Subnet ID |
| `AWS_KEY_NAME` | O | EC2 Key Pair 이름 |
| `AWS_HOSTED_ZONE_ID` | O | Route53 Hosted Zone ID |
| `BASE_DOMAIN` | O | 베이스 도메인 |
| `ACME_EMAIL` | O | Let's Encrypt 이메일 |
| `EC2_TAG_OWNER` | O | EC2 태그 Owner |
| `EC2_TAG_PURPOSE` | | 기본: `OpenClaw AI Assistant` |
| `EC2_TAG_ENVIRONMENT` | | 기본: `production` |
| `EC2_TAG_EXPIRY` | | EC2 태그 Expiry |
| `SSH_KEY_PATH` | | 기본: `~/.ssh/id_ed25519` |

### 페르소나별 시크릿 (`infra/.env.{name}`)

```
PERSONA_NAME=lab
OPENCLAW_GATEWAY_TOKEN=<openssl rand -hex 32>
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ANTHROPIC_SETUP_TOKEN=sk-ant-oat01-...
```

- **ANTHROPIC_SETUP_TOKEN**: `claude setup-token`으로 생성. 모든 페르소나에서 공유 가능
- **Slack 토큰**: 페르소나마다 별도 Slack App 필요 (Socket Mode 라운드 로빈 문제)
- **GATEWAY_TOKEN**: `openssl rand -hex 32`로 생성

## 멀티 페르소나 배포

`ENABLED_PERSONAS` 환경변수로 배포 대상을 선택한다:

```bash
# 단일
export ENABLED_PERSONAS=lab

# 복수
export ENABLED_PERSONAS=lab,product-leader,engineering-lead,growth-expert

# 배포
pulumi up
```

각 페르소나는 독립 EC2 인스턴스로 생성되며, 공유 Security Group을 사용한다.

## Claude Code 스킬

프로젝트에 3개 운영 스킬이 포함되어 있다:

### /deploy

페르소나를 EC2에 배포한다. 환경 확인 → 시크릿 검증 → `pulumi up` → 서비스 검증까지 한 번에 진행.

### /slack-app-setup

새 페르소나용 Slack App을 만든다. Manifest 생성 → 토큰 수집 → `.env` 파일 완성까지 단계별 안내.

### /security-audit

배포된 인스턴스의 보안 상태를 점검한다. CVE 패치, Gateway 인증, 채널 정책, 로깅 마스킹 등 자동 검사.

## 배포 후 확인

```bash
# SSH 접속
ssh -i ~/.ssh/id_ed25519 ec2-user@<publicIp>

# User Data 완료 확인
sudo tail -f /var/log/user-data.log
# "=== User Data completed ===" 메시지 확인 (약 2~3분)

# 서비스 상태
export OPENCLAW_STATE_DIR=/opt/openclaw
systemctl --user status openclaw-gateway    # active (running)
openclaw models status                       # anthropic: token
openclaw channels status --probe             # Slack: works
```

## 운영

```bash
# 서비스 재시작
systemctl --user restart openclaw-gateway

# 로그
journalctl --user -u openclaw-gateway -f

# OpenClaw 업데이트
sudo npm install -g openclaw@latest
systemctl --user restart openclaw-gateway

# EC2 중지/시작 (비용 절감)
aws ec2 stop-instances --instance-ids <id>
aws ec2 start-instances --instance-ids <id>
# 재시작 후 IP 변경되므로 pulumi up으로 DNS 업데이트

# 인프라 삭제
cd infra && pulumi destroy
```

## 디렉토리 구조

```
openclaw-infra/
├── CLAUDE.md                              # 프로젝트 컨텍스트
├── README.md
├── LICENSE
├── openclaw/                              # 서브모듈 (소스 참조용, 수정 금지)
├── docs/                                  # 운영 가이드
├── .claude/skills/
│   ├── deploy/                            # 배포 스킬
│   │   ├── SKILL.md
│   │   ├── references/persona-registry.md
│   │   └── personas/{name}/               # 9개 페르소나 워크스페이스 파일
│   │       ├── SOUL.md
│   │       ├── IDENTITY.md
│   │       └── AGENTS.md
│   ├── slack-app-setup/                   # Slack App 설정 스킬
│   │   ├── SKILL.md
│   │   └── assets/manifest.json
│   └── security-audit/                    # 보안 감사 스킬
│       ├── SKILL.md
│       └── scripts/collect.sh
├── infra/                                 # Pulumi IaC
│   ├── index.ts
│   ├── src/
│   │   ├── config.ts                      # 페르소나 설정 + AWS 환경변수 로드
│   │   ├── templates.ts                   # User Data + Traefik 템플릿
│   │   ├── ec2.ts                         # EC2 인스턴스
│   │   ├── dns.ts                         # Route53 레코드
│   │   └── security.ts                    # Security Group
│   ├── .env                               # 인프라 공용 설정 (gitignored)
│   ├── .env.{name}                        # 페르소나별 시크릿 (gitignored)
│   └── .env.example
└── tasks/                                 # 작업 추적 (gitignored)
```

## 설계 결정

| 결정 | 이유 |
|------|------|
| Setup Token (Max 요금제) | API Key는 사용량 과금. Setup Token은 Max 구독에 포함 |
| npm 전역 설치 | 공식 Docker 이미지 없음. npm이 공식 설치 경로 |
| EC2 1:1 페르소나 | 인스턴스 격리로 장애 전파 방지. 필요 시 개별 중지 가능 |
| Traefik File provider | OpenClaw는 호스트에서 실행. File provider로 호스트 포트에 프록시 |
| 고정 Docker 네트워크 | trustedProxies에 Traefik IP (`172.28.0.2`) 지정 |
| Slack Socket Mode | 인바운드 포트 불필요. 방화벽 친화적 |
| SOUL.md 페르소나 | OpenClaw 네이티브 메커니즘으로 시스템 프롬프트에 주입 |
| 환경변수 분리 | `.env`(인프라 공용) + `.env.{name}`(페르소나 시크릿)으로 역할 분리 |

## 라이선스

[MIT](LICENSE)
