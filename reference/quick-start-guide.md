# OpenClaw 빠른 시작 가이드

> 검색 결과에서 정리한 핵심 설정 단계입니다.

## 설치

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

## 인증 방식 선택

### 옵션 1: Claude Max/Pro 구독자

```bash
# 별도 터미널에서
claude setup-token

# 생성된 토큰을 wizard에 붙여넣기
```

### 옵션 2: Anthropic API 키

wizard에서 API 키 설정 선택 후 입력.

## 채널 설정

### WhatsApp

```bash
# QR 코드 스캔
# Settings → Linked Devices → Link a Device
openclaw channels login whatsapp
```

### Telegram

```bash
docker compose run --rm openclaw-cli providers add \
  --provider telegram \
  --token YOUR_BOT_TOKEN
```

### Discord

환경 변수 또는 설정 파일에 토큰 추가:
```bash
export DISCORD_BOT_TOKEN="your-token"
```

## Dashboard 접근

채널 설정 없이 가장 빠른 방법:

```bash
openclaw dashboard
# 또는 브라우저에서 http://127.0.0.1:18789/
```

## 보안 팁

### Gateway 외부 노출 방지

```json
{
  "gateway": {
    "bind": "loopback"
  }
}
```

### DM 정책 설정

```json
{
  "channels": {
    "whatsapp": {
      "dmPolicy": "pairing"
    }
  }
}
```

### 그룹 채팅 샌드박스

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

## 문제 해결

```bash
# 설정 진단
openclaw doctor

# 상세 로그
openclaw gateway --verbose
```

## 비용 참고

> 출처: TechCrunch, Medium

- 초기 설정: $250+ (Anthropic API 토큰)
- 일일 사용 (Claude Opus 4.5): $10-25 (활발한 사용 시)

## 유용한 명령어

```bash
# 메시지 전송
openclaw message send --to +1234567890 --message "Hello"

# 에이전트 실행
openclaw agent --message "Ship checklist" --thinking high

# 스킬 설치
npx clawhub@latest install <skill-slug>
```
