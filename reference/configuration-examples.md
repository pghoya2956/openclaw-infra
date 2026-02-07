# OpenClaw 설정 예시 모음

> 다양한 소스에서 수집한 설정 예시입니다.

## 기본 설정 (Claude)

`~/.openclaw/openclaw.json`:

```json
{
  "agent": {
    "model": "anthropic/claude-opus-4-5"
  },
  "gateway": {
    "port": 18789,
    "bind": "loopback"
  }
}
```

## 채널별 설정

### WhatsApp

```json
{
  "channels": {
    "whatsapp": {
      "allowFrom": ["+1234567890", "+0987654321"],
      "groups": ["*"]
    }
  }
}
```

### Telegram

```json
{
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "pairing"
    }
  }
}
```

### Discord

```json
{
  "channels": {
    "discord": {
      "token": "${DISCORD_BOT_TOKEN}"
    }
  }
}
```

### Slack

```json
{
  "channels": {
    "slack": {
      "botToken": "${SLACK_BOT_TOKEN}",
      "appToken": "${SLACK_APP_TOKEN}"
    }
  }
}
```

## 보안 설정

### 그룹 채팅용 샌드박스

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

### Gateway 접근 제어

```json
{
  "gateway": {
    "bind": "loopback",
    "auth": {
      "mode": "token"
    },
    "trustedProxies": ["172.17.0.1"]
  }
}
```

## 모델 설정

### 기본 + Fallback

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-20250514",
        "fallbacks": [
          "anthropic/claude-3-5-haiku-20241022"
        ]
      }
    }
  }
}
```

### 로컬 Ollama 사용

```json
{
  "providers": {
    "ollama": {
      "api": "openai-completions",
      "baseUrl": "http://localhost:11434/v1"
    }
  },
  "agent": {
    "model": "ollama/qwen-agentic"
  }
}
```

## 도구 설정

### 기본 도구 활성화

```json
{
  "tools": {
    "allow": ["read", "write", "exec", "browser", "web"]
  }
}
```

### 제한된 실행

```json
{
  "tools": {
    "exec": {
      "ask": "dangerous",
      "security": "sandbox"
    }
  }
}
```

### 브라우저 제어

```json
{
  "browser": {
    "enabled": true,
    "headless": false
  }
}
```

## 인증 프로필

### Anthropic OAuth

```json
{
  "auth": {
    "profiles": {
      "anthropic-oauth": {
        "provider": "anthropic",
        "mode": "oauth"
      }
    }
  }
}
```

### API 키

```json
{
  "auth": {
    "profiles": {
      "anthropic-api": {
        "provider": "anthropic",
        "mode": "api-key",
        "key": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

## 전체 예시 (프로덕션용)

```json
{
  "gateway": {
    "port": 18789,
    "bind": "lan",
    "auth": {
      "mode": "token"
    },
    "trustedProxies": ["172.17.0.1"]
  },
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "pairing"
    },
    "discord": {
      "token": "${DISCORD_BOT_TOKEN}"
    },
    "slack": {
      "botToken": "${SLACK_BOT_TOKEN}",
      "appToken": "${SLACK_APP_TOKEN}"
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-20250514"
      },
      "sandbox": {
        "mode": "non-main"
      }
    }
  },
  "tools": {
    "allow": ["read", "write", "exec", "browser", "web"],
    "exec": {
      "ask": "dangerous"
    }
  },
  "auth": {
    "profiles": {
      "anthropic-oauth": {
        "provider": "anthropic",
        "mode": "oauth"
      }
    }
  }
}
```
