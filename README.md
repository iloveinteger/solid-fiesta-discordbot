# solid-fiesta-discordbot

개인 및 소규모 Discord 서버용 TypeScript 유틸리티 봇입니다. 일반 메시지는 읽지 않으며 슬래시 명령어, 버튼, 모달로만 동작합니다. Node.js 24 LTS, TypeScript strict, discord.js 14, SQLite를 사용합니다.

## 기능

| 명령어                                   | 설명                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/square start mode:bot first:user\|bot` | 사용자와 봇이 1, 4, 9…를 번갈아 제출합니다. 봇은 0.7~1.8초 뒤 항상 정답을 냅니다.         |
| `/square start mode:referee`             | 참가 버튼으로 사용자를 모은 뒤 차례를 진행합니다. 오답 또는 10초 시간 초과 시 탈락합니다. |
| `/factor number:<자연수>`                | 최대 80자리 BigInt를 worker thread에서 소인수분해하고 결과를 SQLite에 캐시합니다.         |
| `/exchange`                              | USD/KRW, JPY/KRW, 100 JPY/KRW와 출처·기준일·조회 시각을 표시합니다.                       |
| `/dice`                                  | `crypto.randomInt(1, 7)`로 공정한 6면체 주사위를 굴립니다.                                |
| `/dict word:<검색어>`                    | 표준국어대사전 동음이의어를 최대 10개 찾고 버튼으로 상세 정보를 표시합니다.               |
| `/python code:<코드>`                    | 제한된 Python AST를 일회용 Docker 컨테이너에서 해석합니다. 결과는 요청자에게만 보입니다.  |

제곱수놀이는 채널마다 하나만 진행할 수 있습니다. 사회자 모드에서는 최대 20명이 참가할 수 있고 방장이 시작·취소합니다. 게임 타이머는 종료·취소·프로세스 종료 시 정리되며, 재시작 전에 만들어진 버튼은 만료된 상태로 안내됩니다.

## Discord 애플리케이션 준비

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 **New Application**을 만들고 Application ID를 확인합니다.
2. 왼쪽 **Bot**에서 **Add Bot**을 누르고 토큰을 재발급한 뒤 로컬 `.env`의 `DISCORD_BOT_TOKEN`에만 넣습니다. 토큰을 README, Git, 이슈, 로그에 넣지 마세요.
3. **OAuth2 > URL Generator**에서 `bot`, `applications.commands` 스코프를 고릅니다.
4. Bot Permissions에서는 다음 최소 권한만 선택합니다.
   - View Channels
   - Send Messages
   - Embed Links
   - Use Application Commands
5. 생성된 URL로 서버에 초대합니다. Application ID를 직접 넣은 아래 URL도 사용할 수 있습니다.

```text
https://discord.com/oauth2/authorize?client_id=DISCORD_APPLICATION_ID&scope=bot%20applications.commands&permissions=2147534848
```

이 봇은 `Guilds` 인텐트만 사용합니다. Message Content privileged intent는 켜지 않아도 되며 일반 메시지 내용을 수집하지 않습니다.

## 환경변수

`.env.example`을 `.env`로 복사하고 실제 값은 로컬 파일에만 입력합니다. `.env` 및 `.env.*`는 Git에서 제외되며 예제 파일에는 비밀값이 없습니다.

| 이름                     | 필수     | 설명                                                                               |
| ------------------------ | -------- | ---------------------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`      | 예       | Developer Portal의 봇 토큰                                                         |
| `DISCORD_APPLICATION_ID` | 예       | Discord 애플리케이션 ID                                                            |
| `STDICT_API_KEY`         | 예       | 표준국어대사전 개발 지원에서 발급한 Open API 키                                    |
| `DISCORD_GUILD_ID`       | 아니요   | 개발 서버 ID. 설정하면 명령어를 해당 서버에 즉시 등록하며, 없으면 전역 등록합니다. |
| `ENABLE_PYTHON_RUNNER`   | 아니요   | 기본값 `true`. `false`면 `/python`을 거부합니다.                                   |
| `DATABASE_PATH`          | 아니요   | 기본값 `./data/bot.sqlite`                                                         |
| `PYTHON_RUNNER_IMAGE`    | 아니요   | 기본값 `solid-fiesta-python-runner:latest`                                         |
| `DOCKER_GID`             | Docker만 | 호스트 Docker 소켓 그룹 ID. 기본값 `999`                                           |

표준국어대사전 키는 API 요청의 POST 본문으로만 전송하고 URL이나 애플리케이션 로그에 기록하지 않습니다.

### GitHub Actions Secrets

현재 CI는 외부 서비스에 접속하지 않아 Secret이 필요하지 않습니다. 배포 workflow를 추가할 경우 저장소 **Settings > Secrets and variables > Actions**에서 `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `STDICT_API_KEY`를 Actions Secret으로 만들고 런타임 환경변수로만 전달하세요. Secret을 workflow YAML에 직접 쓰거나 빌드 이미지에 `ARG`/`ENV`로 굽지 마세요. `DISCORD_GUILD_ID`는 개발 배포에만 선택적으로 등록합니다.

## 로컬 개발

요구 사항은 Node.js 24 LTS, npm 11+, Python 3.13(격리 인터프리터 단위 테스트용), Docker입니다.

```bash
cp .env.example .env
npm ci
npm run register
npm run build
npm start
```

PowerShell에서는 첫 명령 대신 `Copy-Item .env.example .env`를 사용합니다. `DISCORD_GUILD_ID`가 있으면 guild command가 빠르게 반영되고, 없으면 global command를 등록하므로 Discord 전체 반영까지 시간이 걸릴 수 있습니다.

개발 중 검증 명령은 다음과 같습니다.

```bash
npm run format:check
npm run lint
npm test
npm run build
```

## Docker 실행

Linux Docker 호스트에서 소켓의 그룹 ID를 먼저 확인해 `.env`의 `DOCKER_GID`와 맞춥니다.

```bash
stat -c '%g' /var/run/docker.sock
docker compose build
docker compose up -d bot
docker compose logs -f bot
```

봇은 외부 포트를 열지 않습니다. `bot-data` named volume에 SQLite WAL 데이터가 보존됩니다. `/python`을 위해 봇 컨테이너에는 호스트 Docker 소켓이 읽기/쓰기 마운트됩니다.

## Python 격리와 운영 제한

사용자 코드는 `eval`, `exec`, `compile`로 실행하지 않습니다. 먼저 Python AST를 화이트리스트 검사한 다음 저장소의 소형 AST 인터프리터가 리터럴, 산술·비교, 변수, 조건문, 반복문, 함수, 리스트·튜플·딕셔너리·문자열과 `print`를 해석합니다. 편의를 위해 `range`, `len`, `abs`, `min`, `max`, `sum`, `sorted`만 추가 허용합니다.

`input`, import, 속성 접근/reflection, class, dunder 이름, 파일·네트워크·subprocess 접근은 실행 전에 거부합니다. 각 제출은 다음 제한을 적용한 새 컨테이너에서 실행됩니다.

- 네트워크 없음, read-only 루트 파일시스템
- 모든 Linux capability 제거, `no-new-privileges`
- CPU 0.5개, 메모리/스왑 64MiB, PID 32개
- 비특권 사용자, 1MiB `noexec` 임시 공간
- 전체 실행 2초, stdout/stderr 합산 8KiB (초과 시 강제 종료)

Docker 소켓을 가진 프로세스는 호스트에 강한 권한을 갖습니다. 이 구성은 다른 업무나 개인정보가 없는 **전용 격리 Linux 호스트/VM**에서만 운영하세요. 다중 사용자 공개 서버용 샌드박스로 간주하면 안 됩니다. 필요하지 않으면 `ENABLE_PYTHON_RUNNER=false`로 끄고 Docker 소켓 마운트도 제거하세요.

## 외부 서비스와 캐시

- 환율: API 키가 필요 없는 [Frankfurter](https://frankfurter.app/)의 유럽중앙은행 기준환율을 사용합니다. 10분 동안 SQLite 캐시를 사용하며 공급자 장애 시 마지막 정상 값과 그 시각을 명시합니다. 은행 고시환율 및 실제 거래 환율과 다를 수 있습니다.
- 사전: 국립국어원 표준국어대사전 Open API를 사용합니다. 검색은 3분, 상세 조회는 5분 동안 메모리에 캐시합니다.
- 소인수분해: 작은 소수 trial division, 64비트 결정론적 Miller–Rabin, 큰 수 probable-prime 검사와 Pollard's Rho를 사용합니다. 계산 제한은 80자리와 8초이며 성공 결과만 SQLite에 저장합니다.

## 저장소 구조

```text
src/commands/       Discord 명령 정의와 상호작용 처리
src/providers/      환율·표준국어대사전 외부 API 경계
src/repositories/   SQLite 접근 계층
src/services/       게임, 소인수분해 worker, 환율, 주사위, Python 실행
runner/             exec/eval 없는 Python AST 인터프리터 이미지
tests/              수론, 파서, 캐시, 난수 계약, AST 보안 단위 테스트
```

## 라이선스와 데이터

외부 데이터 사용 시 각 공급자의 이용 조건과 출처 표시 정책을 확인하세요. 봇은 환율과 사전 응답에 출처를 표시합니다.
