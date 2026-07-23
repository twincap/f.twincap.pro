# F. Archive

`f.twincap.pro`에 배포할 개인 아카이브 파일관리 웹사이트입니다.

현재 단계는 실제 Nextcloud에 연결하지 않습니다. 로그인, 파일 탐색,
breadcrumb, 폴더 진입, 다운로드, 업로드, 새 폴더, 이름 변경, 삭제 UI와
서버 API 계약을 mock 저장소로 구현했습니다. mock 변경 내용은 서버
프로세스를 재시작하면 초기화됩니다.

## 구조

```text
브라우저
  → f.twincap.pro
  → Next.js App Router 서버 API
  → ArchiveStorage 인터페이스
  → Mock (현재) / Nextcloud WebDAV (다음 단계)
```

브라우저는 Nextcloud에 직접 요청하지 않습니다. 인증 정보와 파일 작업은
항상 서버 경계를 통과합니다.

## 로컬 실행

Node.js 22 이상을 권장합니다.

```bash
npm ci
npm run dev
```

개발 환경에서 인증 환경변수가 없을 때만 `demo / demo` 계정을 사용할 수
있습니다. 프로덕션은 `APP_USERNAME`, `APP_PASSWORD`, `SESSION_SECRET`이
없으면 안전하게 실패합니다.

## 환경변수

`.env.example`을 `.env`로 복사한 뒤 모든 placeholder를 변경합니다.
`.env`는 Git에서 제외됩니다.

| 이름 | 용도 |
| --- | --- |
| `APP_USERNAME` | 아카이브 로그인 아이디 |
| `APP_PASSWORD` | 아카이브 로그인 비밀번호 |
| `SESSION_SECRET` | 세션 서명 키, 32자 이상 |
| `STORAGE_DRIVER` | 현재는 반드시 `mock` |
| `MAX_UPLOAD_BYTES` | mock 업로드 크기 제한 |
| `NEXTCLOUD_URL` | 다음 단계의 서버 전용 Nextcloud 주소 |
| `NEXTCLOUD_USERNAME` | 다음 단계의 서버 전용 WebDAV 사용자 |
| `NEXTCLOUD_APP_PASSWORD` | 다음 단계의 서버 전용 앱 비밀번호 |
| `NEXTCLOUD_WEBDAV_ROOT` | 다음 단계의 서버 전용 WebDAV 루트 |

Nextcloud 관련 값에 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

## Docker

```bash
docker compose up --build -d
```

`compose.yaml`은 컨테이너 포트를 호스트의 `127.0.0.1`에만 게시합니다.
공개 접근은 별도 Cloudflare Tunnel에서 이 로컬 포트로 연결해야 합니다.
기존 Nextcloud 컨테이너나 네트워크에는 연결하지 않습니다.

실제 Ubuntu 서버의 포트, 컨테이너 이름, 네트워크, Cloudflare Tunnel
설정은 이 저장소가 추측하거나 변경하지 않습니다.

## API

모든 파일 API는 유효한 HttpOnly 세션 쿠키를 요구합니다.

| Method | Endpoint | 기능 |
| --- | --- | --- |
| `POST` | `/api/auth/login` | 로그인 |
| `POST` | `/api/auth/logout` | 로그아웃 |
| `GET` | `/api/auth/session` | 세션 확인 |
| `GET` | `/api/files?path=` | 폴더 목록 |
| `POST` | `/api/files/upload` | 파일 업로드 |
| `POST` | `/api/files/folders` | 폴더 생성 |
| `PATCH` | `/api/files/rename` | 이름 변경 |
| `DELETE` | `/api/files/delete?path=` | 삭제 |
| `GET` | `/api/files/download?path=` | 다운로드 |

경로는 저장소 루트 기준 상대 경로만 허용합니다. 절대 경로, `.`/`..`,
역슬래시, 제어문자, 반복 URL 인코딩을 이용한 경로 이탈은 거부합니다.

## 검증

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 다음 단계: WebDAV

다음 작업에서만 `ArchiveStorage`의 WebDAV 구현을 추가합니다. 환경변수는
서버에서만 읽고, 각 경로 segment를 안전하게 인코딩하며, Nextcloud의
공식 WebDAV endpoint만 사용해야 합니다. Nextcloud 데이터 디렉터리,
기존 컨테이너, 볼륨, 네트워크는 직접 읽거나 수정하지 않습니다.
