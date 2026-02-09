# CLAUDE.md

OpenClaw 클라우드 배포 프로젝트. Pulumi IaC로 AWS에 OpenClaw 인스턴스를 배포한다.

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
| Security Group | Pulumi 관리 (`openclaw-<persona>-sg`) — SSH/HTTP/HTTPS만 허용 |

EC2 필수 태그도 환경변수로 설정: `EC2_TAG_OWNER`, `EC2_TAG_PURPOSE`, `EC2_TAG_ENVIRONMENT`, `EC2_TAG_EXPIRY`

## 디렉토리 구조

```
OpenClaw/
├── CLAUDE.md
├── openclaw/                  # 서브모듈 (수정 금지)
├── personas/                  # 페르소나 정의 (선언적 YAML + 워크스페이스)
│   ├── defaults.yml           # 공유 기본값
│   ├── SETTINGS.md            # 설정 가능 항목 레퍼런스
│   └── {name}/
│       ├── persona.yml        # 페르소나 설정 (채널, 도구, 에이전트 등)
│       └── workspace/         # EC2에 배포되는 워크스페이스 파일
├── .claude/skills/            # Claude Code 스킬 (deploy, slack-app-setup, security-audit)
├── infra/                     # Pulumi IaC
│   ├── src/                   # schema.ts, config.ts, openclaw-config.ts, userdata.ts, ec2.ts, dns.ts, security.ts
│   └── .env.{name}           # 페르소나별 시크릿 (gitignored)
├── docs/                      # 운영 가이드
└── tasks/                     # 작업 추적
```

## 명령어

**AWS 프로필**: 반드시 `AWS_PROFILE=sandbox`를 붙여야 한다. 로컬 default 프로필이 다른 계정이라 누락 시 권한 오류 발생.

```bash
# Pulumi
AWS_PROFILE=sandbox pulumi preview
AWS_PROFILE=sandbox pulumi up
AWS_PROFILE=sandbox pulumi destroy

# SSH
ssh -i ~/.ssh/id_ed25519 ec2-user@<IP>
```

## OpenClaw 설치 (EC2 User Data)

**Docker 이미지 없음** - npm 설치 필수:

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs
npm install -g openclaw@latest
```

## 핵심 설정

| 환경변수 | 설명 |
|---------|------|
| `OPENCLAW_STATE_DIR` | 상태 디렉토리 |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 인증 토큰 |

**필수 설정 (openclaw.json):**
```json
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "port": 18789,
    "trustedProxies": ["172.28.0.2"]
  }
}
```

## 작업 추적

- 작업 계획과 진행 상황은 `tasks/` 디렉토리에서 관리한다
- 새 작업 시작 전 `tasks/index.md`를 읽고 현재 상태를 파악한다
- 작업 진행 시 해당 태스크의 `execution-notes.md`에 기록을 추가한다

## 주의사항

- `.env` 파일 커밋 금지
- `openclaw/` 서브모듈 수정 금지
- 사용 후 EC2 중지 (비용)
