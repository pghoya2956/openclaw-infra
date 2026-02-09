# CLAUDE.md

OpenClaw 통합형 멀티에이전트 프로젝트. 단일 EC2에서 9개 AI 에이전트를 운영하며, CEO Advisor가 delegate 스킬로 전문가 팀을 자율 오케스트레이션한다.

## 아키텍처

- **통합형**: 1 EC2 (t3.medium) + 9 OpenClaw 에이전트 (단일 프로세스)
- **CEO 오케스트레이션**: CEO Advisor → delegate 스킬 → 전문가 에이전트 (내부 API)
- **HTTPS**: Traefik + Let's Encrypt 와일드카드 (`*.openclaw.sbx.infograb.io`) DNS Challenge
- **Slack**: 에이전트당 별도 Slack App (Socket Mode), 9개 독립 계정

## AWS 인프라

인프라 설정은 `infra/.env`에서 관리한다 (`.env.example` 참조).

| 항목 | 환경변수 |
|------|---------|
| VPC | `AWS_VPC_ID` |
| Subnet (public) | `AWS_SUBNET_ID` |
| Key Pair | `AWS_KEY_NAME` |
| Hosted Zone | `AWS_HOSTED_ZONE_ID` |
| Domain | `BASE_DOMAIN` |
| ACME Email | `ACME_EMAIL` |
| Security Group | Pulumi 관리 — SSH/HTTP/HTTPS만 허용 |

EC2 필수 태그: `EC2_TAG_OWNER`, `EC2_TAG_PURPOSE`, `EC2_TAG_ENVIRONMENT`, `EC2_TAG_EXPIRY`

## 디렉토리 구조

```
OpenClaw/
├── CLAUDE.md
├── openclaw/                  # 서브모듈 (수정 금지)
├── personas/                  # 에이전트 정의 (선언적 YAML + 워크스페이스)
│   ├── defaults.yml           # 공유 OpenClaw 설정
│   ├── instance.yml           # EC2 인스턴스 설정 (타입, 볼륨, swap)
│   ├── SETTINGS.md            # 설정 가능 항목 레퍼런스
│   └── {name}/
│       ├── agent.yml          # 에이전트 설정 (subdomain, slackAccount)
│       └── workspace/         # EC2에 배포되는 워크스페이스 파일
├── .claude/skills/            # Claude Code 스킬
├── infra/                     # Pulumi IaC
│   ├── src/                   # schema, config, iam, s3, openclaw-config, userdata, ec2, dns, security
│   ├── .env                   # 인프라 설정 (VPC, Subnet 등)
│   └── .env.secrets           # 통합 시크릿 (토큰, Slack 계정)
├── docs/                      # 운영 가이드
└── tasks/                     # 작업 추적
```

## 명령어

**AWS 프로필**: 반드시 `AWS_PROFILE=sandbox`를 붙여야 한다.

```bash
# Pulumi
AWS_PROFILE=sandbox pulumi preview
AWS_PROFILE=sandbox pulumi up
AWS_PROFILE=sandbox pulumi destroy

# SSH (IP는 pulumi stack output에서 확인)
ssh -i ~/.ssh/id_ed25519 ec2-user@<IP>
```

## 에이전트 팀 (9명)

| 에이전트 | subdomain | slackAccount | 특수 기능 |
|---------|-----------|-------------|----------|
| ceo-advisor | ceo.openclaw | ceo | delegate 스킬 (오케스트레이션) |
| product-leader | product.openclaw | product | — |
| engineering-lead | eng.openclaw | engineering | — |
| growth-expert | growth.openclaw | growth | — |
| strategy-consultant | strategy.openclaw | strategy | — |
| design-director | design.openclaw | design | — |
| data-scientist | data.openclaw | data | — |
| marketing-director | marketing.openclaw | marketing | — |
| lab | lab.openclaw | lab | — |

## 핵심 설정

| 항목 | 값 |
|------|---|
| `OPENCLAW_STATE_DIR` | `/opt/openclaw` |
| Gateway Port | `18789` |
| Swap | 8GB (`swapSizeGB` in instance.yml) |
| 동시 에이전트 | 4 (`agents.defaults.maxConcurrent`) |
| groupPolicy | `open` (채널 등록 불필요) |
| replyToMode | `all` (항상 스레드 응답) |

## Slack 토큰 관리

`infra/.env.secrets`에 통합 관리. 형식:
```
SLACK_BOT_TOKEN__{ACCOUNT}=xoxb-...
SLACK_APP_TOKEN__{ACCOUNT}=xapp-...
```
`{ACCOUNT}`는 agent.yml의 `slackAccount` 대문자 변환 (예: `ceo` → `CEO`).
OpenClaw의 `${VAR}` 네이티브 치환으로 주입.

## 작업 추적

- 작업 계획과 진행 상황은 `tasks/` 디렉토리에서 관리한다
- 새 작업 시작 전 `tasks/index.md`를 읽고 현재 상태를 파악한다

## 주의사항

- `.env`, `.env.secrets` 파일 커밋 금지
- `openclaw/` 서브모듈 수정 금지
- 사용 후 EC2 중지 (비용: ~$30/월)
- `userDataReplaceOnChange: true` → User Data 변경 시 EC2 교체 발생
