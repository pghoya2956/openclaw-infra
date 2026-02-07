---
name: security-audit
description: |
  OpenClaw EC2 인스턴스의 보안 상태를 점검한다.
  "/security-audit", "보안 검사해줘", "보안 점검", "security check" 요청 시 사용한다.
  점검 범위: CVE 패치, Security Group, Gateway 인증, trustedProxies, 채널 정책, 환경변수, 내장 감사.
---

# Security Audit

## 전제 조건

- SSH 접속 가능 (`~/.ssh/id_ed25519`)
- AWS CLI 인증 (프로필 또는 환경변수)

## Workflow

### Step A: 인스턴스 확인

`pulumi stack output`으로 인스턴스 ID/IP를 확인한다. stopped이면 시작 여부를 사용자에게 묻는다.

### Step B: 데이터 수집

`scripts/collect.sh`를 원격 실행하여 모든 점검 데이터를 한 번에 수집한다:

```bash
ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no ec2-user@<IP> "bash -s" \
  < .claude/skills/security-audit/scripts/collect.sh
```

### Step C: Security Group 점검

AWS CLI로 EC2에 연결된 SG의 인바운드 규칙을 확인한다.

### Step D: 수집 데이터 판정

아래 기준으로 각 항목을 **양호/주의/위험**으로 판정한다.

## 판정 기준

### CVE 패치

| CVE | 패치 버전 | 설명 |
|-----|----------|------|
| CVE-2026-25253 | >= 2026.1.29 | Control UI 1-Click RCE (Gateway Token 탈취) |

미패치 시 **위험** — 즉시 `npm update -g openclaw@latest` 권고.

### Security Group

| 포트 | 0.0.0.0/0 | 판정 |
|------|----------|------|
| 22 (SSH) | 허용 | 주의 (Key Pair 인증이므로 수용 가능) |
| 80 (HTTP) | 허용 | 양호 (ACME 필요) |
| 443 (HTTPS) | 허용 | 양호 |
| 기타 | 허용 | 위험 |

Pulumi 전용 SG가 아닌 VPC default SG 사용 시 **위험**.

### Gateway 설정 (`openclaw.json`)

| 키 | 기대값 | 위반 시 |
|----|-------|--------|
| `gateway.auth.mode` | `"token"` | `"none"`이면 **위험** — 인증 없음 |
| `gateway.auth.token` | 비어있지 않을 것 | 비어있으면 **위험** |
| `gateway.trustedProxies` | Traefik 실제 IP 포함 | 불일치면 **위험** — 인증 우회 가능 |

trustedProxies와 `TRAEFIK_IP` 섹션 출력값이 일치하는지 반드시 교차 검증한다.

### 채널 보안

| 키 | 기대값 | 위반 시 |
|----|-------|--------|
| `channels.defaults.groupPolicy` | `"allowlist"` 또는 `"open"` | 판정은 아래 기준 참고 |
| `channels.slack.groupPolicy` | 위와 동일 | 위와 동일 |

groupPolicy 판정 기준:
- `"allowlist"` + 등록된 채널 있음 → **양호** (가장 안전)
- `"open"` → **주의** — 모든 채널에서 메시지 수신. 인젝션 공격면 증가
- `"allowlist"` + 등록된 채널 없음 → **위험** — 모든 메시지가 무시됨 (사실상 비활성)

참고: `allowlist`는 채널이 등록되어야 동작한다. 채널 미등록 상태에서 allowlist를 사용하면 봇이 어떤 메시지에도 응답하지 않는다.

### 환경변수

| 항목 | 기대값 | 위반 시 |
|------|-------|--------|
| .env 권한 | `600 ec2-user:ec2-user` | 다르면 **주의** |
| `OPENCLAW_DISABLE_BONJOUR` | `1` | 없으면 **주의** — mDNS로 Gateway 노출 |

### 로깅 보안

| 키 | 기대값 | 위반 시 |
|----|-------|--------|
| `logging.redactSensitive` | `"tools"` | 미설정이면 **주의** — 로그에 시크릿 평문 노출 |
| `logging.redactPatterns` | `["xoxb-","xapp-","sk-ant-"]` 포함 | 미설정이면 **주의** — Slack/Anthropic 토큰 마스킹 안 됨 |

### 내장 감사 (`security audit --deep`)

| 등급 | 판정 |
|------|------|
| critical > 0 | **위험** |
| warn > 0 | **주의** |
| `groups: open=N` (N > 0) | **주의** — groupPolicy 설정 필요 |

### 로그 경고 패턴

| 패턴 | 의미 |
|------|------|
| `groupPolicy defaults to "open"` | groupPolicy 미설정 |
| `bonjour: advertised` | mDNS 활성 |
| `token_mismatch` | 잘못된 토큰 접근 시도 |

## 결과 보고

전체 판정:
- **양호**: 모든 항목 통과
- **주의**: warn 수준 존재 (즉각 위험 없음)
- **위험**: critical 존재 또는 인증 우회 가능

보고 형식:

```
OpenClaw 보안 점검 결과
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
버전: <version> / CVE-2026-25253: 패치됨/미패치
네트워크: <sg-name> — 불필요 포트 없음/있음
Gateway: 인증 token, trustedProxies 일치/불일치
채널: groupPolicy allowlist/open, Bonjour 비활성/활성
내장 감사: critical N / warn N / info N
전체 판정: 양호/주의/위험
```

## 자동 수정

사용자 승인 후 실행. 모든 명령은 SSH 접속 후 `OPENCLAW_STATE_DIR=/opt/openclaw` 설정 필요.

| 문제 | 수정 |
|------|------|
| groupPolicy open → allowlist 전환 | 아래 채널 등록 워크플로우 참조 |
| Bonjour 활성 | `.env`에 `OPENCLAW_DISABLE_BONJOUR=1` 추가 |
| trustedProxies 불일치 | `openclaw.json`에서 `gateway.trustedProxies` 배열 업데이트 |
| 버전 미패치 | `sudo npm update -g openclaw@latest` |
| logging 미설정 | `openclaw config set logging.redactSensitive tools` + `openclaw config set logging.redactPatterns --json '["xoxb-","xapp-","sk-ant-"]'` |

### 채널 등록 워크플로우 (groupPolicy 전환)

`open` → `allowlist` 전환 시, 허용할 채널을 먼저 등록해야 한다. 채널 미등록 상태에서 allowlist로 전환하면 모든 메시지가 무시된다.

사용자에게 허용 범위를 확인한다:
- **특정 채널만**: 사용자가 채널명을 지정
- **전체 허용**: `open` 유지 (현재 상태)

특정 채널 등록 시:

```bash
# 채널 등록 (채널 ID 또는 이름)
openclaw config set channels.slack.allowedChannels --json '["#general","#ai-team"]'

# groupPolicy 전환
openclaw config set channels.defaults.groupPolicy allowlist
openclaw config set channels.slack.groupPolicy allowlist

# Gateway 재시작
XDG_RUNTIME_DIR=/run/user/$(id -u) \
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus \
systemctl --user restart openclaw-gateway
```

전환 후 반드시 등록된 채널에서 메시지 테스트를 수행한다.

수정 후 Gateway 재시작:

```bash
XDG_RUNTIME_DIR=/run/user/$(id -u) \
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus \
systemctl --user restart openclaw-gateway
```

## 참고 문서

- 토큰 로테이션, 인시던트 대응 절차: `docs/security-ops.md`

## 주의사항

- 점검은 읽기 전용으로 시작. 수정은 사용자 승인 후에만 실행
- 점검 완료 후 EC2 중지 여부를 사용자에게 물어본다
