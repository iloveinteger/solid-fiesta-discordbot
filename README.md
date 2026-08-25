# solid-fiesta-discordbot

개인 및 소규모 Discord 서버를 위한 Node.js + TypeScript + discord.js 유틸리티 봇입니다. 슬래시 명령어와 버튼을 중심으로 동작하며, 제곱수놀이가 진행 중일 때만 현재 참가자의 숫자 메시지를 판정합니다.

## 기능

| 명령어                       | 설명                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| `/square start mode:bot`     | 사용자가 먼저 시작해 봇과 1, 4, 9…를 번갈아 채팅으로 입력합니다.        |
| `/square start mode:referee` | 참가자를 모아 채팅으로 차례를 진행합니다. 10초 시간 초과 시 탈락합니다. |
| `/factor number:<자연수>`    | 최대 80자리 자연수를 worker thread에서 소인수분해합니다.                |
| `/exchange`                  | USD/KRW, JPY/KRW와 출처·기준일·조회 시각을 표시합니다.                  |
| `/dice`                      | `crypto.randomInt(1, 7)`로 6면체 주사위를 굴립니다.                     |
| `/binary`                    | 랜덤한 5자리 이진수를 추측하고 해밍 거리와 시도 기록을 확인합니다.      |
| `/factole`                   | 워들형 퍼즐 Factole을 Discord Activity로 실행합니다.                    |
| `/dict word:<검색어>`        | 표준국어대사전 결과를 찾고 선택한 상세 정보로 공개 메시지를 교체합니다. |
| `/ask question:<질문>`       | Gemini가 한국어 한 문장으로 짧고 약간 까칠하게 답합니다.                |

게임과 모든 캐시는 프로세스 메모리에만 존재합니다. 소인수분해 성공 결과는 실행 중 메모리에 캐시하며, 환율은 10분, 사전 검색은 3분, 사전 상세는 5분 캐시합니다. 재시작하면 캐시가 비워지고 진행 중 게임은 종료됩니다. 정상적인 `SIGTERM`/`SIGINT` 종료에서는 진행 중 게임 메시지를 종료 상태로 바꾸고 타이머를 정리하며, 비정상 종료 뒤 남은 버튼은 재시작 후 만료된 것으로 안내됩니다.

## 요구 사항

- Node.js 24 LTS
- npm 11 이상
- Discord 애플리케이션과 Bot Token
- 표준국어대사전 Open API 키
- `/ask`를 사용할 경우 Google AI Studio Gemini API 키

별도 데이터베이스나 컨테이너 런타임은 필요하지 않습니다.

## 환경변수

`.env.example`을 `.env`로 복사한 뒤 실제 값을 로컬 파일에만 입력합니다. `.env`와 `.env.*`는 Git에서 제외되며 실제 비밀값을 커밋하거나 로그에 출력하지 않습니다.

| 이름                     | 필수   | 설명                                                                               |
| ------------------------ | ------ | ---------------------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`      | 예     | Discord Developer Portal에서 발급한 Bot Token                                      |
| `DISCORD_APPLICATION_ID` | 예     | Discord 애플리케이션 ID                                                            |
| `STDICT_API_KEY`         | 예     | 표준국어대사전 Open API 인증 키                                                    |
| `GEMINI_API_KEY`         | 아니요 | `/ask`에서 사용하는 Google AI Studio API 키. 없으면 `/ask`만 비활성화됩니다.       |
| `GEMINI_MODEL`           | 아니요 | Gemini 모델 ID. 기본값은 안정 버전 `gemini-3.7-flash`입니다.                       |
| `DISCORD_GUILD_ID`       | 아니요 | 개발 서버 ID. 설정하면 해당 서버에 명령어를 즉시 등록하고, 없으면 전역 등록합니다. |

표준국어대사전 키와 Gemini 키는 애플리케이션 로그에 넣지 않습니다. `/ask`는 질문 원문이나 응답 전문도 로그에 남기지 않습니다. GitHub Actions CI는 외부 서비스에 접속하지 않아 Secret이 필요 없습니다. 배포 서버에서 `/ask`를 사용하려면 서버의 기존 `.env`에 `GEMINI_API_KEY`를 추가하세요.

## Discord 애플리케이션 설정

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 애플리케이션을 만듭니다.
2. **Bot > Add Bot**으로 봇을 추가하고 Token을 재발급해 `.env`의 `DISCORD_BOT_TOKEN`에 넣습니다.
3. **Bot > Privileged Gateway Intents**에서 **Message Content Intent**를 켭니다. 제곱수 채팅 입력에 필요합니다.
4. **OAuth2 > URL Generator**에서 `bot`, `applications.commands` 스코프를 선택합니다.
5. 다음 최소 권한만 선택해 서버에 초대합니다.
   - View Channels
   - Send Messages
   - Embed Links
   - Use Application Commands

Application ID로 직접 만드는 초대 URL은 다음과 같습니다.

```text
https://discord.com/oauth2/authorize?client_id=DISCORD_APPLICATION_ID&scope=bot%20applications.commands&permissions=2147534848
```

봇은 `Guilds`, `GuildMessages`, `MessageContent` 인텐트를 사용합니다. 메시지 이벤트는 제곱수놀이나 이진수 퀴즈가 진행 중인 채널에서 현재 참가자가 보낸 숫자만 처리하고 나머지는 무시합니다. 제곱수놀이는 오답이어도 10초 제한 시간이 끝나기 전까지 다시 입력할 수 있습니다.

## 로컬 실행

```bash
cp .env.example .env
npm ci
npm run build
npm run register
npm start
```

PowerShell에서는 첫 명령 대신 `Copy-Item .env.example .env`를 사용합니다. `DISCORD_GUILD_ID`가 있으면 guild command가 빠르게 반영됩니다. 값이 없으면 global command를 등록하므로 Discord 전체 반영까지 시간이 걸릴 수 있습니다.

개발 검증 명령은 다음과 같습니다.

```bash
npm run format:check
npm run lint
npm test
npm run build
```

## Oracle Ubuntu VM 배포

Oracle Ubuntu VM에는 Node.js 24 LTS와 npm을 설치하고, `ubuntu` 계정이 저장소와 `.env`를 읽을 수 있게 준비합니다. 저장소 경로는 `/home/ubuntu/discord-utility-bot`입니다.

코드를 배포할 때 의존성을 잠금 파일 그대로 설치하고 빌드합니다.

```bash
cd /home/ubuntu/discord-utility-bot
npm ci
npm run build
npm run register
```

`/etc/systemd/system/discord-utility-bot.service`를 생성합니다.

```ini
[Unit]
Description=Solid Fiesta Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/discord-utility-bot
EnvironmentFile=/home/ubuntu/discord-utility-bot/.env
ExecStart=/usr/bin/node --enable-source-maps /home/ubuntu/discord-utility-bot/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict

[Install]
WantedBy=multi-user.target
```

서비스를 반영하고 시작합니다.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now discord-utility-bot.service
sudo systemctl status discord-utility-bot.service
journalctl -u discord-utility-bot.service -f
```

업데이트할 때는 새 코드를 받은 뒤 `npm ci`, `npm run build`, `npm run register`를 실행하고 `sudo systemctl restart discord-utility-bot.service`로 재시작합니다. 토큰이나 API 키를 journal에 직접 출력하지 마세요.

### GitHub Actions 자동 배포

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 `/home/ubuntu/discord-utility-bot`을 갱신하고 빌드·명령 등록 후 `discord-utility-bot.service`를 재시작합니다. 저장소의 **Settings > Secrets and variables > Actions**에 다음 GitHub Actions Secret을 등록합니다.

- `ORACLE_HOST`: Oracle Ubuntu VM의 호스트명 또는 IP 주소
- `ORACLE_SSH_PRIVATE_KEY`: `ubuntu` 계정에 접속할 전용 SSH private key 전체

배포는 SSH `known_hosts`를 구성하고 엄격한 host key 검증을 사용합니다. 서버의 `.env`는 Git에서 추적하지 않으며 배포 과정에서 생성·수정·출력하지 않습니다. 배포용 `ubuntu` 계정은 비대화형으로 `systemctl restart`와 `systemctl is-active`를 실행할 수 있어야 합니다.

## 구현과 운영 제한

- `/factor`: 작은 소수 trial division, 64비트 결정론적 Miller–Rabin, 큰 수 probable-prime 검사와 Pollard's Rho를 사용합니다. 최대 80자리, 계산 제한 8초이며 worker thread가 이벤트 루프 차단을 줄입니다.
- `/exchange`: 키가 필요 없는 Frankfurter의 유럽중앙은행 기준환율을 사용합니다. 공급자 장애 시 프로세스가 보유한 마지막 정상값과 그 시각을 표시합니다. 은행 고시환율 및 실제 거래 환율과 다를 수 있습니다.
- `/dict`: 국립국어원 표준국어대사전 Open API를 사용하며 입력과 응답을 검증합니다. 상세 버튼을 누르면 검색 결과 메시지가 선택한 뜻의 공개 상세 정보로 교체됩니다.
- `/square`: 채널마다 게임 하나만 허용하고 사회자 모드는 최대 20명이 참가합니다.
- `/square` 현황은 상태가 바뀔 때마다 새 메시지로 채널 하단에 다시 게시하고 약 0.1초 뒤 봇이 저장한 직전 현황 메시지만 삭제합니다. 봇전 선공은 무작위로 정합니다.
- `/ask`: 질문은 최대 500자이며 12초 API 제한 시간을 적용합니다. 질문과 최대 300자의 한국어 한 문장 답변을 함께 표시합니다. 설정 모델이 400/404로 거부되면 `gemini-2.5-flash`로 한 번 재시도합니다.
- `/binary`: `00000`~`11111` 중 하나를 균등하게 뽑습니다. 시작한 사용자의 5자리 이진수 추측마다 현황을 채널 하단에 새로 게시하고 약 0.1초 뒤 직전 현황만 삭제합니다. `/square`와 같은 채널에서 동시에 진행할 수 없습니다.
- `/factole`: 메시지를 읽지 않고 [Factole](https://ilovefloat.github.io/factole/) Activity를 Discord 안에서 실행합니다.

## Factole Discord Activity

Developer Portal에서 Activities를 활성화하면 Discord가 App Launcher용 기본 전역 Entry Point인 `Launch`를 생성합니다. 이 저장소의 `npm run register`는 이후 슬래시 명령을 갱신할 때 해당 Entry Point를 보존합니다. `/factole`은 `LAUNCH_ACTIVITY` 응답으로 같은 Activity를 직접 실행합니다.

**Activities > URL Mappings**에는 아래 순서로 입력합니다. Target에는 `https://`를 붙이지 않으며 `/` 매핑은 반드시 마지막에 둡니다.

| Prefix         | Target                                      |
| -------------- | ------------------------------------------- |
| `/discord-sdk` | `unpkg.com/@discord/embedded-app-sdk@2.5.0` |
| `/react-dom`   | `unpkg.com/react-dom@18/umd`                |
| `/react`       | `unpkg.com/react@18/umd`                    |
| `/babel`       | `unpkg.com/@babel/standalone`               |
| `/tailwind`    | `cdn.tailwindcss.com`                       |
| `/`            | `ilovefloat.github.io/factole`              |

Discord는 슬래시 명령과 Entry Point에 같은 `factole` 이름을 허용하지 않으므로 Entry Point는 기본 `Launch` 이름으로 유지합니다. Activity가 비활성화되어 있거나 URL Mapping이 잘못되면 `/factole` 실행 요청은 오류로 안내됩니다.

## 저장소 구조

```text
src/commands/       슬래시 명령 정의와 Discord 상호작용 처리
src/providers/      환율·표준국어대사전 외부 API 경계
src/services/       게임, 메모리 캐시, 소인수분해 worker, 주사위
tests/              수론, 환율, 파서, 캐시, 난수 단위 테스트
```
