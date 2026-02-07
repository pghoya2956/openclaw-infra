# CLAUDE.md

OpenClaw 클라우드 배포 프로젝트. Pulumi IaC로 AWS에 OpenClaw 인스턴스를 배포한다.

## AWS 인프라

```bash
export AWS_PROFILE=sandbox
```

| 항목 | 값 |
|------|-----|
| Region | ap-northeast-2 |
| VPC | vpc-098d05350c6ddeaa0 (IG-POC-SBX-VPC) |
| Subnet (public) | subnet-0df3efe6e8373fa82 (AZa) |
| Security Group | sg-04082b9accd4af5ed (Allow all) |
| Key Pair | Chad (`~/.ssh/id_ed25519`) |
| Domain | sbx.infograb.io (Z06071792MIKNXBV41TCQ) |

**EC2 필수 태그** (없으면 생성 실패):
```typescript
tags: {
  Owner: "Chad",
  Purpose: "OpenClaw AI Assistant POC",
  Environment: "sandbox",
  Expiry: "2026-03-31",
}
```

## 디렉토리 구조

```
OpenClaw/
├── CLAUDE.md
├── docs/
│   └── troubleshooting.md   # 문제점 및 해결방안
├── openclaw/                # 서브모듈 (수정 금지)
└── infra/                   # Pulumi IaC (구현 예정)
```

## 명령어

```bash
# Pulumi
pulumi preview
pulumi up
pulumi destroy

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
    "trustedProxies": ["172.19.0.2"]
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
