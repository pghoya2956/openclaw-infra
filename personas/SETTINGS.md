# persona.yml 설정 레퍼런스

persona.yml의 `openclaw:` 섹션에 사용 가능한 설정 목록.
이 섹션은 OpenClaw의 `openclaw.json`에 1:1로 매핑된다.

**원칙**: 토큰/API 키는 persona.yml에 적지 않는다. `.env.{name}`에서 환경변수로 주입.

---

## 채널 (`channels`)

### 공통 설정 (`channels.defaults`)

```yaml
openclaw:
  channels:
    defaults:
      groupPolicy: open             # open | allowlist | disabled
      # dmPolicy: pairing           # pairing | allowlist | open | disabled
      # requireMention: false       # 그룹에서 @멘션 필요 여부
      # historyLimit: 20            # 그룹 메시지 컨텍스트 수
      # dmHistoryLimit: 50          # DM 턴 수
```

### Slack (`channels.slack`)

아웃바운드 전용 (Socket Mode). Traefik 불필요.

```yaml
openclaw:
  channels:
    slack:
      replyToMode: all              # off | first | all — 스레드 응답 모드
      # groupPolicy: open           # open | allowlist | disabled
      # requireMention: false       # 그룹에서 @멘션 필요 여부
      # streamMode: partial         # off | partial | full — 스트리밍
      # textChunkLimit: 3000        # 메시지 분할 글자수
      # markdown:
      #   tables: bullets           # off | bullets | code — 테이블 변환
      # actions:
      #   reactions: true           # 이모지 리액션 허용
      #   threadSummary: true       # 스레드 요약
      #   canvasCreate: true        # 캔버스 생성
      #   files: true               # 파일 업로드
      # commands:
      #   enabled: true             # 슬래시 명령어
      # groups:                     # 채널별 오버라이드
      #   C06XXXXX:                 # 채널 ID
      #     enabled: true
      #     requireMention: true
      #     tools:
      #       allow: [web_search]
```

환경변수: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`

### Telegram (`channels.telegram`)

아웃바운드 전용 (polling 기본). Traefik 불필요.

```yaml
openclaw:
  channels:
    telegram:
      replyToMode: first            # off | first | all
      # streamMode: partial         # off | partial — 메시지 편집 스트리밍
      # groupPolicy: open
      # requireMention: true        # 그룹에서 @멘션 필요 (기본 true)
      # allowCommands: true         # /slash 명령어
      # parseMode: MarkdownV2       # HTML | MarkdownV2 | off
      # textChunkLimit: 4000
      # debounceMs: 1500            # 메시지 모음 대기
      # linkPreviews: false         # 링크 미리보기
      # mediaMaxMb: 50
      # webhook:                    # webhook 모드 (Traefik 필요)
      #   enabled: false
      #   path: /telegram
      #   url: https://...
      # groups:                     # 그룹별 오버라이드
      #   "-100123456":
      #     requireMention: true
```

환경변수: `TELEGRAM_BOT_TOKEN`

### Discord (`channels.discord`)

아웃바운드 전용 (Gateway WebSocket). Traefik 불필요.

```yaml
openclaw:
  channels:
    discord:
      replyToMode: all              # off | first | all
      # streamMode: partial
      # requireMention: true        # 서버에서 @멘션 필요 (기본 true)
      # groupPolicy: open
      # textChunkLimit: 2000
      # dm:
      #   policy: pairing           # pairing | allowlist | open | disabled
      #   enabled: true
      # guilds:                     # 서버별 오버라이드
      #   "123456789":
      #     slug: my-server
      #     requireMention: false
      #     channels:
      #       "987654321":
      #         enabled: true
```

환경변수: `DISCORD_BOT_TOKEN`

### WhatsApp (`channels.whatsapp`)

아웃바운드 전용 (Baileys WebSocket). Traefik 불필요.
QR 페어링 필요 — EC2에서 `openclaw channels login` 실행.

```yaml
openclaw:
  channels:
    whatsapp:
      # groupPolicy: open
      # dmPolicy: pairing
      # requireMention: false
      # debounceMs: 2000
      # sendReadReceipts: true
      # textChunkLimit: 4000
      # mediaMaxMb: 50
      # ackReaction:
      #   emoji: "eyes"             # 수신 확인 이모지
      # groups:                     # 그룹별 오버라이드
      #   "120363XXX@g.us":
      #     requireMention: true
```

환경변수: 없음 (QR 페어링)

### Signal (`channels.signal`)

시스템 의존성: Java + signal-cli (`infra.systemDeps: ["java-21-amazon-corretto"]`)

```yaml
openclaw:
  channels:
    signal:
      # account: "+821012345678"    # E.164 전화번호
      # autoStart: true             # signal-cli 데몬 자동 시작
      # dmPolicy: pairing
      # groupPolicy: open
      # textChunkLimit: 4000
```

### LINE (`channels.line`)

인바운드 필요 (webhook). Traefik 필요.

```yaml
openclaw:
  channels:
    line:
      # webhookPath: /line
      # webhookPort: 8443
      # replyToMode: all
      # groupPolicy: open
```

환경변수: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`

### 확장 채널 (npm 설치 필요)

`infra.extensions`에 패키지 지정:

```yaml
infra:
  extensions:
    - "@openclaw/googlechat"      # Google Chat
    # - "@openclaw/msteams"       # MS Teams
    # - "@openclaw/feishu"        # Feishu/Lark
    # - "@openclaw/matrix"        # Matrix
    # - "@openclaw/mattermost"    # Mattermost
```

Google Chat 예시:
```yaml
openclaw:
  channels:
    googlechat:
      webhookPath: /googlechat
      # groupPolicy: open
      # requireMention: true
```

MS Teams 예시:
```yaml
openclaw:
  channels:
    msteams:
      # appId: (Azure Bot App ID)  # .env에 넣는 것을 권장
      # webhook:
      #   port: 3978
      #   path: /api/messages
      # requireMention: true
```

---

## 게이트웨이 (`gateway`)

```yaml
openclaw:
  gateway:
    bind: lan                       # auto | lan | loopback | custom | tailnet
    port: 18789
    trustedProxies:
      - "172.28.0.2"               # Traefik Docker IP

    # --- TLS (Traefik 사용 시 불필요) ---
    # tls:
    #   enabled: true
    #   autoGenerate: true          # 자체 서명 인증서

    # --- Control UI ---
    # controlUi:
    #   enabled: true
    #   basePath: /openclaw

    # --- HTTP 엔드포인트 ---
    # http:
    #   endpoints:
    #     chatCompletions:
    #       enabled: true           # OpenAI-compatible API
    #     responses:
    #       enabled: true           # OpenResponses API

    # --- Tailscale ---
    # tailscale:
    #   mode: serve                 # off | serve | funnel
```

---

## 도구 (`tools`)

### 웹 검색/크롤링

```yaml
openclaw:
  tools:
    web:
      search:
        enabled: true
        provider: brave             # brave | perplexity
        # maxResults: 5
        # timeoutSeconds: 10
        # cacheTtlMinutes: 15
      fetch:
        enabled: true
        # maxChars: 50000
        # readability: true         # Readability 파서
        # firecrawl:
        #   enabled: true           # Firecrawl 폴백
```

환경변수: `BRAVE_API_KEY`, `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`

### 코드 실행

```yaml
openclaw:
  tools:
    exec:
      ask: always                   # off | on-miss | always — 실행 확인
      # security: allowlist         # deny | allowlist | full
      # host: sandbox               # sandbox | gateway | node
      # timeoutSec: 300
      # backgroundMs: 5000          # 자동 백그라운드 전환
      # pathPrepend: ["/usr/local/bin"]
```

### 미디어 (이미지/오디오/비디오)

```yaml
openclaw:
  tools:
    media:
      image:
        enabled: true
        # maxBytes: 10485760
      # audio:
      #   enabled: true
      #   language: ko
      # video:
      #   enabled: true
    # links:
    #   enabled: true               # 링크 자동 해석
    #   maxLinks: 3
```

### 메시지 도구 (크로스 채널)

```yaml
openclaw:
  tools:
    message:
      crossContext:
        allowWithinProvider: true    # 같은 채널 내 전송
        # allowAcrossProviders: false # 다른 채널 간 전송
```

### 도구 정책

```yaml
openclaw:
  tools:
    # profile: full                 # minimal | coding | messaging | full
    # allow: [web_search, web_fetch]
    # deny: [exec]
```

---

## 에이전트 (`agents`)

### 기본 설정

```yaml
openclaw:
  agents:
    defaults:
      workspace: /home/ec2-user/.openclaw/workspace

      # --- 모델 ---
      # model:
      #   primary: "anthropic/claude-sonnet-4-5-20250929"
      #   fallbacks: ["openai/gpt-4o"]

      # --- 벡터 메모리 검색 ---
      # memorySearch:
      #   enabled: true
      #   provider: openai          # openai | gemini | voyage | local
      #   sources: ["memory", "sessions"]
      #   query:
      #     maxResults: 10
      #     minScore: 0.3

      # --- Docker 샌드박스 ---
      # sandbox:
      #   mode: non-main            # off | non-main | always
      #   docker:
      #     image: "node:22-slim"
      #     memory: "512m"
      #     cpus: 1

      # --- 하트비트 (스케줄 실행) ---
      # heartbeat:
      #   every: "6h"               # 실행 간격
      #   activeHours:
      #     start: "09:00"
      #     end: "18:00"
      #     timezone: "Asia/Seoul"
      #   target: last              # 마지막 대화 채널에 전송

      # --- 타이핑 ---
      # typingMode: thinking        # never | instant | thinking | message
      # humanDelay:
      #   mode: natural             # off | natural | custom

      # --- 컨텍스트 ---
      # bootstrapMaxChars: 20000    # SOUL.md 등 시스템 프롬프트 길이 제한
      # contextTokens: 200000      # 컨텍스트 윈도우 크기
      # userTimezone: "Asia/Seoul"
```

환경변수: `OPENAI_API_KEY` (임베딩), `GEMINI_API_KEY`, `VOYAGE_API_KEY`

### 멀티 에이전트

```yaml
openclaw:
  agents:
    list:
      - id: main
        workspace: /home/ec2-user/.openclaw/workspace
      - id: coder
        workspace: /home/ec2-user/.openclaw/workspace-coder
        tools:
          exec:
            security: full

  # 채널 → 에이전트 라우팅
  bindings:
    - agentId: main
      match:
        channel: slack
    - agentId: coder
      match:
        channel: telegram
```

---

## 세션 (`session`)

```yaml
openclaw:
  session:
    # scope: per-sender             # per-sender | global
    # reset:
    #   mode: idle                  # daily | idle
    #   idleMinutes: 30
    # agentToAgent:
    #   maxPingPongTurns: 5         # 에이전트 간 최대 대화 턴
```

---

## 명령어 (`commands`)

```yaml
openclaw:
  commands:
    # native: auto                  # true | false | auto — 슬래시 명령어 등록
    # bash: false                   # /bash 명령어 허용 (주의)
    # config: false                 # /config 명령어 허용
    # restart: false                # /restart 명령어 허용
    # ownerAllowFrom:               # 관리자 ID 목록
    #   - "U06XXXXX"               # Slack user ID
```

---

## 인증/LLM (`auth`)

```yaml
openclaw:
  auth:
    # profiles:
    #   anthropic-main:
    #     provider: anthropic
    #     mode: token
    #   openai-backup:
    #     provider: openai
    #     mode: api_key
    # order:
    #   anthropic: ["anthropic-main"]
    #   openai: ["openai-backup"]
```

환경변수: `ANTHROPIC_API_KEY`, `ANTHROPIC_SETUP_TOKEN`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`

---

## 로깅 (`logging`)

```yaml
openclaw:
  logging:
    redactSensitive: tools          # off | tools
    redactPatterns:
      - "xoxb-"
      - "xapp-"
      - "sk-ant-"
    # level: info                   # silent | error | warn | info | debug | trace
```

---

## 기타

### TTS (`talk`)

```yaml
openclaw:
  # talk:
  #   voiceId: "rachel"
  #   speed: 1.0
```

환경변수: `ELEVENLABS_API_KEY`

### 메모리 (`memory`)

```yaml
openclaw:
  # memory:
  #   backend: builtin              # builtin | qmd
  #   citations: auto               # auto | on | off
```

### 스킬/플러그인 (`skills`, `plugins`)

```yaml
openclaw:
  # skills:
  #   load:
  #     watch: true
  # plugins:
  #   enabled: true
  #   entries:
  #     some-plugin:
  #       enabled: true
  #       config:
  #         key: value
```

### 진단 (`diagnostics`)

```yaml
openclaw:
  # diagnostics:
  #   otel:
  #     enabled: true
  #     endpoint: "http://otel-collector:4318"
```

---

## 채널별 필수 환경변수 요약

| 채널 | 환경변수 | 비고 |
|------|---------|------|
| Slack | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` | Socket Mode 필수 |
| Telegram | `TELEGRAM_BOT_TOKEN` | @BotFather에서 발급 |
| Discord | `DISCORD_BOT_TOKEN` | Developer Portal |
| LINE | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` | Messaging API |
| WhatsApp | (없음) | QR 페어링 |
| Signal | (없음) | signal-cli 자체 관리 |
| Google Chat | 서비스 계정 JSON 파일 | |
| MS Teams | Azure Bot 자격증명 | |

## 도구별 필수 환경변수 요약

| 도구 | 환경변수 |
|------|---------|
| 웹 검색 (Brave) | `BRAVE_API_KEY` |
| 웹 검색 (Perplexity) | `PERPLEXITY_API_KEY` |
| 웹 크롤링 (Firecrawl) | `FIRECRAWL_API_KEY` |
| 벡터 메모리 (OpenAI) | `OPENAI_API_KEY` |
| 벡터 메모리 (Voyage) | `VOYAGE_API_KEY` |
| TTS (ElevenLabs) | `ELEVENLABS_API_KEY` |
