# F. Archive

`f.twincap.pro`에 배포할 개인 아카이브 파일관리 웹사이트입니다.

`STORAGE_DRIVER=mock`에서는 메모리 기반 미리보기 저장소를 사용하고,
`STORAGE_DRIVER=webdav`에서는 `files.twincap.pro`의 Nextcloud WebDAV를
사용합니다. 기존 Nextcloud 컨테이너, 볼륨, 데이터 디렉터리에는 접근하지
않고 공식 WebDAV API만 호출합니다.

## 구조

```text
브라우저
  → f.twincap.pro
  → Next.js App Router 서버 API
  → ArchiveStorage 인터페이스
  → Mock 또는 Nextcloud WebDAV
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
| `APP_ORIGIN` | 브라우저가 접근하는 외부 origin (`https://f.twincap.pro`) |
| `STORAGE_DRIVER` | `mock` 또는 `webdav` |
| `MAX_UPLOAD_BYTES` | 업로드 최대 바이트 수 |
| `NEXTCLOUD_URL` | 서버 전용 Nextcloud origin |
| `NEXTCLOUD_USERNAME` | 서버 전용 WebDAV 사용자 |
| `NEXTCLOUD_APP_PASSWORD` | 서버 전용 Nextcloud 앱 비밀번호 |
| `NEXTCLOUD_WEBDAV_ROOT` | 서버 전용 WebDAV 파일 루트 |

Nextcloud 관련 값에 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

운영 환경에서는 다음 형태로 설정합니다. 실제 사용자명과 앱 비밀번호가
들어간 `.env`는 절대 커밋하지 않습니다.

```env
STORAGE_DRIVER=webdav
NEXTCLOUD_URL=https://files.twincap.pro
NEXTCLOUD_USERNAME=replace-with-nextcloud-user
NEXTCLOUD_APP_PASSWORD=replace-with-nextcloud-app-password
NEXTCLOUD_WEBDAV_ROOT=/remote.php/dav/files/replace-with-nextcloud-user
```

2단계 인증을 사용하는 Nextcloud 계정은 일반 비밀번호가 아니라 개인
설정에서 발급한 앱 비밀번호를 사용해야 합니다.

Cloudflare Tunnel 같은 리버스 프록시 환경에서는 `APP_ORIGIN`을 브라우저가
접근하는 외부 origin으로 설정해야 합니다. 운영값은
`https://f.twincap.pro`이며 path, query, fragment 없이 입력합니다. 서버는
이 값을 Origin 검증 기준으로 사용하고 `x-forwarded-host`를 신뢰하지
않습니다.

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
| `GET` | `/api/storage` | 인증된 세션에 저장소 driver 이름만 반환 |
| `GET` | `/api/files?path=` | 폴더 목록 |
| `POST` | `/api/files/upload` | 파일 업로드 |
| `POST` | `/api/files/folders` | 폴더 생성 |
| `PATCH` | `/api/files/rename` | 이름 변경 |
| `PATCH` | `/api/files/move` | 파일 또는 폴더 이동 |
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

## WebDAV 동작

어댑터는 폴더 조회에 `PROPFIND`, 다운로드에 `GET`, 업로드에 `PUT`, 폴더
생성에 `MKCOL`, 이름 변경과 이동에 `MOVE`, 삭제에 `DELETE`를 사용합니다.
업로드와 다운로드 본문은 스트리밍하며 업로드 스트림에는
`MAX_UPLOAD_BYTES` 제한을 적용합니다.

모든 경로는 저장소 루트 기준 상대 경로로 검증한 뒤 각 segment를 별도로
인코딩합니다. WebDAV XML 응답의 DOCTYPE/ENTITY 선언, 저장소 루트 밖의
href, 지나치게 큰 멀티상태 응답은 거부합니다. Nextcloud 인증 정보는
서버 메모리의 Authorization 헤더에만 사용하며 브라우저 응답이나 로그에
포함하지 않습니다.
