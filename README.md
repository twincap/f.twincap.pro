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

## 탐색기 기능

- 클릭, `Ctrl`/`Cmd`, `Shift` 또는 빈 공간의 선택 사각형으로 여러 항목을
  선택할 수 있습니다.
- 선택한 파일과 폴더를 다른 폴더나 breadcrumb로 끌어서 이동할 수 있습니다.
- 운영체제에서 여러 파일을 끌어 놓거나 업로드 창에서 동시에 선택할 수
  있습니다.
- 이미지, 텍스트, PDF, JSON/XML, 오디오와 비디오를 인증된 스트리밍
  엔드포인트로 미리 봅니다.
- 삭제 요청은 Nextcloud 휴지통으로 이동하며 휴지통 조회와 비우기를
  지원합니다.
- 폴더는 `/browse/폴더명/...` URL을 사용하므로 브라우저 뒤로가기와
  새로고침 후 경로 복원이 동작합니다. 폴더별 DNS 서브도메인은 만들지
  않으므로 Cloudflare 와일드카드 DNS 설정이 필요하지 않습니다.

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
| `DELETE` | `/api/files/delete?path=` | Nextcloud 휴지통으로 이동 |
| `GET` | `/api/files/download?path=` | 다운로드 |
| `GET` | `/api/files/preview?path=` | 지원 파일 형식 스트리밍 미리보기 |
| `GET` | `/api/trash` | 휴지통 목록 |
| `DELETE` | `/api/trash` | 휴지통 영구 비우기 |

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

어댑터는 폴더와 Nextcloud 공식 trashbin 조회에 `PROPFIND`, 다운로드와
미리보기에 `GET`, 업로드에 `PUT`, 폴더 생성에 `MKCOL`, 이름 변경과
이동에 `MOVE`, 휴지통 이동과 비우기에 `DELETE`를 사용합니다. 업로드,
다운로드, 미리보기 본문은 스트리밍하며 업로드 스트림에는
`MAX_UPLOAD_BYTES` 제한을 적용합니다.

모든 경로는 저장소 루트 기준 상대 경로로 검증한 뒤 각 segment를 별도로
인코딩합니다. WebDAV XML 응답의 DOCTYPE/ENTITY 선언, 저장소 루트 밖의
href, 지나치게 큰 멀티상태 응답은 거부합니다. Nextcloud 인증 정보는
서버 메모리의 Authorization 헤더에만 사용하며 브라우저 응답이나 로그에
포함하지 않습니다.
