# OpenClaw 배포 트러블슈팅

2026-02-04 POC 진행 중 발견된 문제점과 해결 방안 정리.

## 요약

| 문제 | 상태 | 해결방안 |
|------|------|---------|
| Device Pairing 필요 | 해결됨 | CLI로 approve |
| trustedProxies 미적용 | 해결됨 | 개별 IP 지정 |
| 필수 디렉토리 누락 | 해결됨 | User Data에서 생성 |
| Anthropic 인증 실패 | **미해결** | 재설계 필요 |

---

## 해결된 문제

### Device Pairing

**증상:**
```
disconnected (1008): pairing required
```

**원인:** Gateway가 `mode: local`일 때 외부 연결은 device pairing 필요.

**해결:**
```bash
# pending devices 확인
openclaw devices list

# approve
openclaw devices approve <request-id>
```

**IaC 반영:** User Data에서 초기 device를 자동 등록하거나, pairing 비활성화 설정 필요.

---

### trustedProxies 설정

**증상:**
```
Proxy headers detected from untrusted address.
Connection will not be treated as local.
```

**원인:** CIDR 표기(`172.19.0.0/16`)가 작동하지 않음.

**해결:** 개별 IP 직접 지정:
```json
{
  "gateway": {
    "trustedProxies": ["172.19.0.2", "172.19.0.1"]
  }
}
```

**IaC 반영:** Docker 네트워크 IP를 하드코딩하거나, 동적으로 조회 후 설정.

---

### 필수 디렉토리 누락

**증상:**
```
CRITICAL: OAuth dir missing (/opt/openclaw/credentials)
CRITICAL: Session store dir missing (/opt/openclaw/agents/main/sessions)
```

**해결:**
```bash
mkdir -p /opt/openclaw/credentials
mkdir -p /opt/openclaw/agents/main/sessions
chmod 700 /opt/openclaw
chmod 600 /opt/openclaw/openclaw.json
```

**IaC 반영:** User Data에서 디렉토리 생성 포함.

---

## 미해결 문제

### Anthropic 인증 실패

**증상:**
```
No API key found for provider "anthropic".
Auth store: /opt/openclaw/agents/main/agent/auth-profiles.json
```

**시도한 방법:**

1. **openclaw.json에 auth.profiles 설정**
   ```json
   {
     "auth": {
       "profiles": {
         "anthropic-oauth": {
           "provider": "anthropic",
           "mode": "oauth",
           "email": "user@example.com"
         }
       }
     }
   }
   ```
   → 설정은 저장되지만 실제 인증 토큰 없음

2. **CLI로 OAuth 로그인**
   ```bash
   openclaw models auth login --provider anthropic
   ```
   → `Error: No provider plugins found`

3. **plugins 확인**
   - Anthropic provider plugin이 목록에 없음
   - 기본 내장으로 추정했으나 작동 안 함

**근본 원인 추정:**
- OpenClaw의 Anthropic 인증은 **로컬 환경**에서 브라우저 OAuth 플로우로 진행
- 원격 서버에서는 TTY/브라우저 접근 불가
- `auth-profiles.json` 파일을 수동 생성해야 할 수 있음

**해결 방안 (검토 필요):**

1. **로컬에서 인증 후 파일 복사**
   - 로컬 Mac에서 `openclaw models auth login --provider anthropic` 실행
   - 생성된 `~/.openclaw/auth-profiles.json` 또는 credentials를 서버로 복사

2. **API Key 직접 사용**
   - OAuth 대신 `ANTHROPIC_API_KEY` 환경변수 사용
   - openclaw.json에서 `auth.profiles`를 `api_key` 모드로 설정

3. **OpenClaw 문서 재확인**
   - https://docs.openclaw.ai/providers/anthropic.md
   - https://docs.openclaw.ai/gateway/authentication.md

---

## Traefik 설정

### File Provider 사용

Docker 라벨로 host 서비스 프록시 불가. File provider 필수:

```yaml
# traefik-dynamic.yml
http:
  routers:
    openclaw:
      rule: "Host(`lab.openclaw.sbx.infograb.io`)"
      entryPoints: [websecure]
      service: openclaw
      tls:
        certResolver: letsencrypt

  services:
    openclaw:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:18789"
```

```yaml
# docker-compose.yml
services:
  traefik:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./traefik-dynamic.yml:/etc/traefik/dynamic.yml:ro
```

---

## User Data 개선 체크리스트

```bash
#!/bin/bash

# 디렉토리 구조
mkdir -p /opt/openclaw/{credentials,agents/main/sessions,devices,cron}
chmod 700 /opt/openclaw

# Node.js + OpenClaw
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs docker
npm install -g openclaw@latest

# Docker (Traefik용)
systemctl enable --now docker

# 설정 파일 생성
cat > /opt/openclaw/openclaw.json << 'EOF'
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "port": 18789,
    "trustedProxies": ["172.19.0.2"]
  }
}
EOF
chmod 600 /opt/openclaw/openclaw.json

# 환경변수
cat > /opt/openclaw/.env << 'EOF'
OPENCLAW_GATEWAY_TOKEN=<token>
# ANTHROPIC_API_KEY=<key>  # OAuth 대신 사용 시
EOF

# Gateway 시작
cd /opt/openclaw
source .env
export OPENCLAW_STATE_DIR=/opt/openclaw
nohup openclaw gateway run --bind lan --port 18789 > gateway.log 2>&1 &
```

---

## 다음 단계

1. **Anthropic 인증 방식 결정**
   - OAuth vs API Key
   - 로컬 인증 후 파일 복사 vs 환경변수

2. **User Data 완성**
   - 위 체크리스트 기반 스크립트 작성
   - Pulumi에서 변수 주입

3. **테스트**
   - 인스턴스 생성 → Gateway 연결 → 채팅 테스트
