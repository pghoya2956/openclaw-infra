# Claude Code Slack Bot 레퍼런스

> 출처: [GitHub - mpociot/claude-code-slack-bot](https://github.com/mpociot/claude-code-slack-bot)

## 개요

로컬 Claude Code 에이전트를 Slack과 연결하여 AI 기반 코딩 지원을 Slack 워크스페이스에서 직접 사용할 수 있습니다.

## 주요 기능

- **Direct messaging**: 봇과 1:1 대화
- **Thread support**: 스레드 내 컨텍스트 유지
- **Streaming responses**: Claude 응답을 실시간으로 표시
- **Session management**: 대화 히스토리 유지
- **File upload**: 이미지, 코드 파일 업로드 지원
- **MCP server integration**: Claude 기능 확장

## 요구사항

- Node.js 18+
- Slack 워크스페이스 관리자 권한
- Claude Code 설치

## 설치

```bash
git clone https://github.com/mpociot/claude-code-slack-bot.git
cd claude-code-slack-bot
npm install
```

## Slack 앱 설정

1. [api.slack.com/apps](https://api.slack.com/apps)에서 앱 생성
2. 제공된 manifest 파일 사용 (권장)
3. 필요한 자격 증명:
   - Bot User OAuth Token (`xoxb-*`)
   - App-Level Token (`xapp-*`, connections:write 스코프 필요)
   - Signing Secret

## 환경 설정

`.env` 파일:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
```

## 실행

```bash
# 개발 모드
npm run dev

# 프로덕션
npm start
```

## 사용 패턴

### 작업 디렉토리 설정

사용 전 작업 디렉토리 설정 필요:

```
cwd project-name
```

또는:

```
set directory /path/to/project
```

### 컨텍스트 범위

- **Direct messages**: 대화당 하나의 디렉토리 유지
- **Channels**: 채널 기본값 설정 (조인 시 프롬프트)
- **Threads**: 채널 기본값 오버라이드

### 파일 업로드

지원 형식:
- 이미지
- 텍스트 파일
- PDF
- 대부분의 프로그래밍 언어 코드

## 고급 옵션

대체 모델 프로바이더 지원:
- AWS Bedrock
- Google Vertex AI

환경 변수로 설정 가능.
