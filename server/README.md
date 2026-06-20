# MusicPlz 로그인 시스템 (Express + PostgreSQL)

이메일/비밀번호 기반의 회원가입·로그인·세션 유지 기능을 제공하는 서버입니다.
`main/`, `login/` 폴더의 정적 파일도 이 서버가 함께 서빙하므로, 서버 하나만 실행하면
사이트 전체(홈 + 로그인)가 동작합니다.

데이터베이스는 **PostgreSQL**을 사용합니다. (SQLite에서 변경됨 — Render 등 대부분의
호스팅 플랫폼은 무료 플랜에서 로컬 파일을 영구 보존하지 않기 때문에, 별도 관리형 DB가 필요합니다.)

## 폴더 구조

```
MusicPlz/
├── main/              # 홈 페이지 (정적 파일)
├── login/             # 로그인/회원가입 페이지 (정적 파일)
└── server/            # ← 여기서 실행
    ├── server.js      # 서버 엔트리포인트
    ├── db.js           # PostgreSQL 연결 풀 + 스키마 초기화
    ├── models/
    │   └── users.js   # users 테이블 쿼리
    ├── routes/
    │   └── auth.js    # /api/auth/* 라우트
    └── package.json
```

---

## A. 로컬 PC에서 실행하기

### 1. PostgreSQL 준비

로컬에 PostgreSQL이 없다면 두 가지 방법이 있습니다.

**방법 1 — 직접 설치**
- macOS: `brew install postgresql@16` 후 `brew services start postgresql@16`
- Windows: [postgresql.org](https://www.postgresql.org/download/windows/)에서 설치 마법사 실행

설치 후 데이터베이스를 하나 만들어주세요:
```bash
createdb musicplz
```

**방법 2 — Render의 무료 PostgreSQL을 로컬 개발에도 그대로 사용**
배포용으로 만든 Render PostgreSQL의 "External Database URL"을 로컬 `.env`에도 그대로 써도 됩니다.
설치가 번거롭다면 이 방법이 가장 간단합니다.

### 2. 설치

```bash
cd server
npm install
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어서 `DATABASE_URL`을 본인 환경에 맞게 수정하세요.
- 로컬 PostgreSQL: `postgresql://postgres:비밀번호@localhost:5432/musicplz`
- Render PostgreSQL: Render 대시보드에서 복사한 연결 문자열 그대로

`SESSION_SECRET`도 원하는 무작위 문자열로 바꿔주면 좋습니다(로컬 테스트만 한다면 기본값도 무방).

### 4. 실행

```bash
npm start
```

`MusicPlz 서버 실행 중 → http://localhost:3000` 메시지가 보이면 정상입니다.
첫 실행 시 `users`, `session` 테이블이 자동으로 만들어집니다.

---

## B. Render에 배포하기

### 1. PostgreSQL 인스턴스 만들기

1. Render 대시보드 → **New** → **PostgreSQL**
2. 이름 입력 (예: `musicplz-db`), Region은 웹 서비스와 동일하게 선택
3. Plan은 **Free** 선택 → **Create Database**
4. 생성되면 **Internal Database URL** 값을 복사해두세요 (같은 Render 안에서 웹 서비스와 통신할 때 더 빠르고 무료 사용량도 아낄 수 있습니다)

> 참고: Render의 무료 PostgreSQL은 생성 후 일정 기간이 지나면 만료되는 정책이 있을 수 있습니다.
> Render 대시보드의 데이터베이스 상세 화면에서 만료/보존 정책을 확인해주세요.

### 2. 웹 서비스 환경 변수에 연결

웹 서비스(서버) 설정 → **Environment** → 다음 값 추가:

| Key | Value |
|---|---|
| `DATABASE_URL` | 위에서 복사한 Internal Database URL |
| `SESSION_SECRET` | 무작위로 만든 긴 문자열 |
| `NODE_ENV` | `production` |

### 3. 배포

GitHub에 push하면 Render가 자동으로 빌드/배포합니다:

```bash
git add .
git commit -m "DB를 PostgreSQL로 변경"
git push
```

배포 로그에서 `MusicPlz 서버 실행 중` 메시지가 보이면 정상입니다.

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/signup` | 회원가입. `{ email, password, displayName? }` → 성공 시 자동 로그인 |
| POST | `/api/auth/login` | 로그인. `{ email, password }` |
| POST | `/api/auth/logout` | 로그아웃 (세션 삭제) |
| GET  | `/api/auth/me` | 현재 로그인 상태 확인. `{ user: null }` 또는 `{ user: {...} }` |

비밀번호는 `bcryptjs`로 해싱되어 저장되며, 평문 비밀번호는 절대 DB에 남지 않습니다.
로그인 세션은 PostgreSQL의 `session` 테이블에 저장되므로, 서버를 재시작하거나 재배포해도
(쿠키가 살아있는 한) 로그인 상태가 유지됩니다.

## 가입된 사용자 확인하기

```bash
psql "$DATABASE_URL" -c "SELECT id, email, display_name, created_at FROM users;"
```

(`$DATABASE_URL`은 `.env`에 적은 값을 그대로 셸 변수로 써도 되고, Render 대시보드의
PostgreSQL 인스턴스 화면에서 제공하는 "Connect" 버튼으로 바로 psql 접속도 가능합니다.)

## 문제 해결

**`Error: connect ECONNREFUSED` 가 뜨는 경우**
- PostgreSQL이 실행 중인지 확인하세요 (`pg_isready` 또는 `brew services list`)
- `.env`의 `DATABASE_URL`에 오타가 없는지 확인하세요

**Render 배포 후 로그인이 안 되거나 세션이 바로 풀리는 경우**
- 환경 변수에 `NODE_ENV=production`이 정확히 들어가 있는지 확인하세요 (secure 쿠키 관련)
- `DATABASE_URL`이 Render PostgreSQL의 값으로 정확히 들어가 있는지 확인하세요

**포트가 이미 사용 중이라는 에러가 나는 경우**
- `.env`에서 `PORT=3001` 등으로 바꿔주세요.
