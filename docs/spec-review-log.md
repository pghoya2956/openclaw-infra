---
title: "스펙 검토 로그"
reviewed_at: 2026-02-04T12:00:00+09:00
---

# 스펙 검토 로그

## 검토 대상

- 파일: `/Users/infograb/Workspace/OpenClaw/CLAUDE.md`
- 검토일: 2026-02-04

## 발견 사항

### 기술적 구현

| 항목 | 상태 | 발견 내용 | 보완 내용 |
|------|------|----------|----------|
| 아키텍처 | ✅ 보완됨 | EC2 + Docker 구조 명확화 필요 | 설정 주입 흐름도 추가 |
| 시크릿 관리 | ✅ 보완됨 | 저장 방식 미정의 | .env 기반 구조로 확정 |
| OpenClaw 설정 주입 | ✅ 보완됨 | 동적 생성 방식 불명확 | openclaw.json 템플릿 + 환경변수 구조 정의 |
| 이미지 버전 | ✅ 보완됨 | latest 사용 시 재현성 문제 | 고정 버전 사용 (2026.2.1) |
| 상태 저장 | ⚠️ 추후 | EBS 백업 정책 미정의 | 당장 불필요, 추후 고려 |
| 헬스체크 | ✅ 확정 | CloudWatch 필요 여부 | 불필요, 수동 /health 체크 |

### 네트워킹/보안

| 항목 | 상태 | 발견 내용 | 보완 내용 |
|------|------|----------|----------|
| TLS 인증서 | ✅ 확정 | Let's Encrypt + Traefik ACME | docker-compose에 반영 |
| Security Group | ✅ 확정 | 공유 vs 개별 미결정 | Pulumi에서 동적 생성 |
| trustedProxies | ✅ 보완됨 | Traefik 프록시 신뢰 설정 필요 | openclaw.json에 172.17.0.1 추가 |

### 운영/비용

| 항목 | 상태 | 발견 내용 | 보완 내용 |
|------|------|----------|----------|
| 비용 최적화 | ✅ 확정 | N개 EC2 상시 운영 비용 | 필요시 실행, 쉽게 내릴 수 있는 구조 |
| 로깅 | ⚠️ 추후 | CloudWatch 연동 미정의 | 당장 불필요 |
| 업데이트 전략 | ⚠️ 추후 | 이미지 업데이트 방식 | 고정 버전, 수동 업데이트 |

### 페르소나 설계

| 항목 | 상태 | 발견 내용 | 보완 내용 |
|------|------|----------|----------|
| 채널 설정 | ✅ 보완됨 | 봇 토큰 주입 방식 없음 | .env.{persona} + 환경변수 매핑 |
| 모델 선택 | ✅ 보완됨 | OpenClaw config 매핑 불명확 | agents.defaults.model 구조 정의 |
| 격리 수준 | ✅ 확정 | 완전 격리 vs 공유 | 기본 격리 + API 키 공유 |

## 열린 질문 (해결됨)

| 질문 | 결정 |
|------|------|
| 페르소나 격리 수준 | 기본 격리, API 키는 공유 가능 |
| 비용 전략 | 필요시 실행, 쉽게 내릴 수 있는 구조 |
| 시크릿 관리 | .env 파일 기반 → Pulumi 로드 |
| 도메인 구조 | 페르소나별 서브도메인 |
| 모니터링 | CloudWatch 불필요 |

## 코드베이스 분석 결과

### OpenClaw 설정 구조 (검증됨)

**설정 파일:** `~/.openclaw/openclaw.json`

**주요 섹션:**
- `gateway`: 포트, 바인드, 인증, TLS, trustedProxies
- `channels`: telegram, discord, slack, whatsapp 등
- `agents`: 모델, workspace, 스킬 필터
- `auth`: 인증 프로필 (OAuth, API 키)

**환경변수 우선순위:**
1. `OPENCLAW_*` 환경변수
2. `openclaw.json` 설정 파일
3. 기본값

**채널별 토큰 환경변수 (검증 완료):**
- `TELEGRAM_BOT_TOKEN`
- `DISCORD_BOT_TOKEN`
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`

**환경변수 치환 지원 확인됨** (`src/config/env-substitution.ts`):
- config 파일에 `${VAR_NAME}` 문법 사용 가능
- 대문자 환경변수만 인식 (`[A-Z_][A-Z0-9_]*`)
- 누락 시 `MissingEnvVarError` 발생 (시작 실패)
- 이스케이프: `$${VAR}` → 리터럴 `${VAR}`

## 검토 결과 요약

| 분류 | 건수 |
|------|------|
| 보완된 항목 | 11건 |
| 추후 고려 | 3건 |
| 확정된 결정 | 5건 |

## 다음 단계

1. `infra/` Pulumi 프로젝트 생성
2. `.env` 파일 구조 생성 (공유 + 페르소나별)
3. `openclaw.json` 템플릿 작성 (환경변수 치환 활용)
4. 페르소나 YAML 템플릿 작성
5. 첫 번째 페르소나 (work 또는 lab) 배포 테스트

## 검증 완료 항목

- [x] OpenClaw 환경변수 치환 지원 (`${VAR_NAME}` 문법)
- [x] 대문자 환경변수만 인식
- [x] 누락 시 에러 발생 (안전)
