# MusicPlz 서버

이메일/비밀번호 로그인 시스템 + **AI 음악 검색** (Spotify + Gemini 연동) 기능을 제공합니다.

## 폴더 구조

```
MusicPlz/
├── main/              # 홈 페이지
├── login/             # 로그인/회원가입 페이지
├── create/             # AI 음악 검색 + 플레이리스트 만들기 페이지
└── server/            # ← 여기서 실행
    ├── server.js
    ├── db.js
    ├── models/users.js
    ├── routes/
    │   ├── auth.js     # 회원가입/로그인
    │   └── music.js    # AI 음악 검색 (신규)
    └── services/
        ├── spotify.js  # Spotify 카탈로그 검색 (신규)
        └── gemini.js   # 문장 → 검색어 해석 (신규)
```

## 설치 및 실행

```bash
cd server
npm install
cp .env.example .env
```

`.env` 파일을 열어서 아래 항목들을 채워주세요:

| 변수 | 어디서 받는지 |
|---|---|
| `DATABASE_URL` | PostgreSQL 접속 문자열 (로컬 또는 Render) |
| `SESSION_SECRET` | 임의의 무작위 문자열 |
| `SPOTIFY_CLIENT_ID` | developer.spotify.com/dashboard → 앱 생성 → Basic Information |
| `SPOTIFY_CLIENT_SECRET` | 같은 화면의 "View client secret" |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key |

```bash
npm start
```

`http://localhost:3000`으로 접속하면 됩니다.

## AI 음악 검색 동작 방식

1. 사용자가 `create.html`에서 자연어 문장으로 검색 (예: "비 오는 날 듣던 잔잔한 노래")
2. 브라우저가 `POST /api/music/search`로 문장을 서버에 전달
3. 서버가 **Gemini API**에게 문장을 보내 검색어/태그/해석 문구로 변환
4. 변환된 검색어로 **Spotify Web API**(Client Credentials flow)에서 실제 곡 검색
5. 결과(곡 제목, 가수, 앨범 커버, 길이 등)를 프론트엔드에 반환해 카드로 표시

### 알아두실 점

- **Spotify Development Mode 앱은 앱 소유자(본인)가 Spotify Premium을 구독 중이어야 정상 동작합니다.** (Spotify의 2026년 2월 정책 변경)
- Spotify 토큰은 서버 메모리에 캐싱되어, 매 검색마다 새로 발급받지 않고 약 1시간 동안 재사용됩니다.
- Gemini 호출이 실패해도(키 오류, 일시적 장애 등) 검색 자체는 멈추지 않고, 사용자가 입력한 원문 그대로 Spotify에 검색을 시도하도록 만들어져 있습니다(완전한 기능 정지를 막기 위한 안전장치).
- Spotify 검색 결과 개수는 최대 10개로 제한됩니다(Spotify 2026년 정책).

## 문제 해결

**검색했는데 결과가 항상 비어있는 경우**
- Spotify Premium 구독 여부를 확인해주세요.
- `.env`의 `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`이 정확한지 확인해주세요.
- 서버 콘솔 로그에 에러 메시지가 출력되니 확인해보세요.

**AI 해석 문구가 항상 원문 그대로 나오는 경우**
- `GEMINI_API_KEY`가 잘못되었거나 만료된 경우, Gemini 호출이 실패하고 원문으로 대체되도록 설계되어 있습니다. 서버 콘솔에 `[Gemini 해석 실패]` 로그가 있는지 확인해주세요.
