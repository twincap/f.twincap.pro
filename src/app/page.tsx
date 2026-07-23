"use client";

import {
  Archive,
  ChevronRight,
  Download,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type {
  ApiErrorBody,
  ArchiveItem,
  ArchiveListing,
  SessionUser,
} from "@/lib/archive";
import styles from "./page.module.css";

type AuthState =
  | { status: "checking" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser };

type DialogState =
  | { type: "folder" }
  | { type: "upload" }
  | { type: "rename"; item: ArchiveItem }
  | { type: "delete"; item: ArchiveItem }
  | null;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function formatSize(size: number | null): string {
  if (size === null) {
    return "—";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getFileIcon(item: ArchiveItem) {
  if (item.type === "folder") {
    return <Folder className={styles.folderIcon} aria-hidden="true" />;
  }
  if (/\.(jpe?g|png|gif|webp|heic)$/i.test(item.name)) {
    return <ImageIcon className={styles.imageIcon} aria-hidden="true" />;
  }
  return <File className={styles.fileIcon} aria-hidden="true" />;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    let message = "요청을 처리하지 못했습니다.";
    try {
      const body = (await response.json()) as ApiErrorBody;
      message = body.error.message;
    } catch {
      // The generic message intentionally avoids exposing server details.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function LoadingScreen() {
  return (
    <main className={styles.loadingScreen} aria-live="polite">
      <div className={styles.brandMark}>
        <Archive aria-hidden="true" />
      </div>
      <p>개인 아카이브를 확인하는 중입니다</p>
    </main>
  );
}

function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: SessionUser) => void;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await apiRequest<{ user: SessionUser }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            username: form.get("username"),
            password: form.get("password"),
          }),
        },
      );
      onAuthenticated(response.user);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "로그인하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginIntro} aria-labelledby="login-heading">
        <div className={styles.loginBrand}>
          <span className={styles.brandMark}>
            <Archive aria-hidden="true" />
          </span>
          <span>F. ARCHIVE</span>
        </div>
        <div>
          <p className={styles.eyebrow}>PRIVATE DIGITAL ARCHIVE</p>
          <h1 id="login-heading">
            오래 두고 볼 것들을
            <br />
            한곳에 모읍니다.
          </h1>
          <p className={styles.loginDescription}>
            기록, 사진, 프로젝트 파일을 정돈해 두는 개인 보관소입니다.
          </p>
        </div>
        <div className={styles.securityNote}>
          <ShieldCheck aria-hidden="true" />
          <span>인증된 사용자만 아카이브에 접근할 수 있습니다.</span>
        </div>
      </section>

      <section className={styles.loginPanel} aria-label="로그인">
        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <div className={styles.loginFormHeading}>
            <p className={styles.eyebrow}>WELCOME BACK</p>
            <h2>아카이브 로그인</h2>
            <p>계속하려면 계정 정보를 입력해 주세요.</p>
          </div>

          <label>
            아이디
            <input
              autoComplete="username"
              name="username"
              placeholder="아이디"
              required
            />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="current-password"
              name="password"
              placeholder="비밀번호"
              required
              type="password"
            />
          </label>
          {error ? (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          ) : null}
          <button className={styles.loginButton} disabled={submitting}>
            {submitting ? "확인 중…" : "로그인"}
          </button>
          {process.env.NODE_ENV === "development" ? (
            <p className={styles.devHint}>
              로컬 mock 기본 계정은 <code>demo / demo</code>입니다.
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}

function ActionDialog({
  dialog,
  busy,
  onClose,
  onSubmit,
}: {
  dialog: NonNullable<DialogState>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isDelete = dialog.type === "delete";
  const title =
    dialog.type === "folder"
      ? "새 폴더"
      : dialog.type === "upload"
        ? "파일 업로드"
        : dialog.type === "rename"
          ? "이름 변경"
          : "항목 삭제";

  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section
        aria-labelledby="dialog-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>ARCHIVE ACTION</p>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button
            aria-label="닫기"
            className={styles.iconButton}
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={onSubmit}>
          {dialog.type === "folder" ? (
            <label>
              폴더 이름
              <input autoFocus name="name" placeholder="새 폴더" required />
            </label>
          ) : null}
          {dialog.type === "rename" ? (
            <label>
              새 이름
              <input
                autoFocus
                defaultValue={dialog.item.name}
                name="name"
                required
              />
            </label>
          ) : null}
          {dialog.type === "upload" ? (
            <label>
              업로드할 파일
              <input autoFocus name="file" required type="file" />
            </label>
          ) : null}
          {isDelete ? (
            <p className={styles.deleteMessage}>
              <strong>{dialog.item.name}</strong>을(를) 삭제할까요?
              {dialog.item.type === "folder"
                ? " 폴더 안의 항목도 함께 삭제됩니다."
                : " 이 작업은 되돌릴 수 없습니다."}
            </p>
          ) : null}

          <div className={styles.dialogActions}>
            <button
              className={styles.secondaryButton}
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              취소
            </button>
            <button
              className={isDelete ? styles.dangerButton : styles.primaryButton}
              disabled={busy}
              type="submit"
            >
              {busy ? "처리 중…" : isDelete ? "삭제" : "확인"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ArchiveManager({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => void;
}) {
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<ArchiveListing | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadListing = useCallback(async (nextPath: string) => {
    try {
      const nextListing = await apiRequest<ArchiveListing>(
        `/api/files?path=${encodeURIComponent(nextPath)}`,
      );
      setError("");
      setListing(nextListing);
      setPath(nextListing.path);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "목록을 불러오지 못했습니다.",
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<ArchiveListing>("/api/files?path=")
      .then((initialListing) => {
        if (active) {
          setListing(initialListing);
          setPath(initialListing.path);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "목록을 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const breadcrumbs = useMemo(() => {
    const segments = path ? path.split("/") : [];
    return [
      { name: "내 아카이브", path: "" },
      ...segments.map((segment, index) => ({
        name: segment,
        path: segments.slice(0, index + 1).join("/"),
      })),
    ];
  }, [path]);

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) {
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      if (dialog.type === "folder") {
        await apiRequest("/api/files/folders", {
          method: "POST",
          body: JSON.stringify({ parentPath: path, name: form.get("name") }),
        });
      } else if (dialog.type === "rename") {
        await apiRequest("/api/files/rename", {
          method: "PATCH",
          body: JSON.stringify({
            path: dialog.item.path,
            newName: form.get("name"),
          }),
        });
      } else if (dialog.type === "delete") {
        await apiRequest(
          `/api/files/delete?path=${encodeURIComponent(dialog.item.path)}`,
          { method: "DELETE" },
        );
      } else {
        const file = form.get("file");
        if (!(file instanceof File)) {
          throw new Error("파일을 선택해 주세요.");
        }
        const uploadUrl = new URL("/api/files/upload", window.location.origin);
        uploadUrl.searchParams.set("parentPath", path);
        uploadUrl.searchParams.set("name", file.name);
        await apiRequest(uploadUrl.toString(), {
          method: "POST",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
      }

      setDialog(null);
      await loadListing(path);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "작업을 완료하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
    } finally {
      onLogout();
    }
  }

  const items = listing?.items ?? [];

  return (
    <main className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.brandMark}>
            <Archive aria-hidden="true" />
          </span>
          <div>
            <strong>F. ARCHIVE</strong>
            <span>PERSONAL COLLECTION</span>
          </div>
        </div>

        <nav aria-label="아카이브 메뉴" className={styles.sideNav}>
          <button className={styles.activeNav} onClick={() => loadListing("")}>
            <FolderOpen aria-hidden="true" />
            모든 파일
          </button>
          <div className={styles.navLabel}>바로가기</div>
          <button onClick={() => loadListing("기록")}>
            <Folder aria-hidden="true" />
            기록
          </button>
          <button onClick={() => loadListing("사진")}>
            <Folder aria-hidden="true" />
            사진
          </button>
          <button onClick={() => loadListing("프로젝트")}>
            <Folder aria-hidden="true" />
            프로젝트
          </button>
        </nav>

        <div className={styles.storageCard}>
          <div>
            <HardDrive aria-hidden="true" />
            <span>Mock storage</span>
          </div>
          <div className={styles.storageTrack}>
            <span />
          </div>
          <p>WebDAV 연결 전 안전한 미리보기</p>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>
            <Archive aria-hidden="true" />
            <strong>F. ARCHIVE</strong>
          </div>
          <div className={styles.userArea}>
            <span className={styles.statusDot} />
            <span>{user.username}</span>
            <button
              aria-label="로그아웃"
              className={styles.iconButton}
              onClick={handleLogout}
              title="로그아웃"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.contentHeading}>
            <div>
              <p className={styles.eyebrow}>PERSONAL ARCHIVE</p>
              <h1>내 아카이브</h1>
              <p>오래 간직할 파일과 기록을 정돈합니다.</p>
            </div>
            <div className={styles.headingActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setDialog({ type: "folder" })}
              >
                <Plus aria-hidden="true" />
                새 폴더
              </button>
              <button
                className={styles.primaryButton}
                onClick={() => setDialog({ type: "upload" })}
              >
                <Upload aria-hidden="true" />
                업로드
              </button>
            </div>
          </div>

          <nav aria-label="현재 경로" className={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path || "root"}>
                {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
                <button
                  aria-current={
                    index === breadcrumbs.length - 1 ? "page" : undefined
                  }
                  onClick={() => loadListing(crumb.path)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          {error ? (
            <div className={styles.inlineError} role="alert">
              {error}
              <button aria-label="알림 닫기" onClick={() => setError("")}>
                <X aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <section className={styles.filePanel} aria-label="파일 목록">
            <div className={styles.filePanelHeader}>
              <span>{items.length}개 항목</span>
              <span>이름순</span>
            </div>

            <div className={styles.tableHeader} aria-hidden="true">
              <span>이름</span>
              <span>크기</span>
              <span>수정일</span>
              <span>작업</span>
            </div>

            <div className={styles.fileList}>
              {!listing ? (
                <div className={styles.emptyState}>목록을 불러오는 중…</div>
              ) : items.length === 0 ? (
                <div className={styles.emptyState}>
                  <FolderOpen aria-hidden="true" />
                  <strong>이 폴더는 비어 있습니다.</strong>
                  <span>파일을 올리거나 새 폴더를 만들어 보세요.</span>
                </div>
              ) : (
                items.map((item) => (
                  <article className={styles.fileRow} key={item.path}>
                    <button
                      className={styles.fileName}
                      disabled={item.type !== "folder"}
                      onClick={() =>
                        item.type === "folder"
                          ? loadListing(item.path)
                          : undefined
                      }
                    >
                      <span className={styles.fileIconBox}>
                        {getFileIcon(item)}
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.type === "folder"
                            ? "폴더"
                            : formatSize(item.size)}
                        </small>
                      </span>
                    </button>
                    <span className={styles.fileSize}>
                      {formatSize(item.size)}
                    </span>
                    <time dateTime={item.modifiedAt}>
                      {dateFormatter.format(new Date(item.modifiedAt))}
                    </time>
                    <div className={styles.rowActions}>
                      {item.type === "file" ? (
                        <a
                          aria-label={`${item.name} 다운로드`}
                          className={styles.iconButton}
                          href={`/api/files/download?path=${encodeURIComponent(item.path)}`}
                          title="다운로드"
                        >
                          <Download aria-hidden="true" />
                        </a>
                      ) : null}
                      <button
                        aria-label={`${item.name} 이름 변경`}
                        className={styles.iconButton}
                        onClick={() => setDialog({ type: "rename", item })}
                        title="이름 변경"
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        aria-label={`${item.name} 삭제`}
                        className={styles.iconButton}
                        onClick={() => setDialog({ type: "delete", item })}
                        title="삭제"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>

      {dialog ? (
        <ActionDialog
          busy={busy}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSubmit={handleDialogSubmit}
        />
      ) : null}
    </main>
  );
}

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let active = true;
    void apiRequest<{ user: SessionUser }>("/api/auth/session")
      .then(({ user }) => {
        if (active) {
          setAuth({ status: "authenticated", user });
        }
      })
      .catch(() => {
        if (active) {
          setAuth({ status: "anonymous" });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (auth.status === "checking") {
    return <LoadingScreen />;
  }
  if (auth.status === "anonymous") {
    return (
      <LoginScreen
        onAuthenticated={(user) =>
          setAuth({ status: "authenticated", user })
        }
      />
    );
  }
  return (
    <ArchiveManager
      onLogout={() => setAuth({ status: "anonymous" })}
      user={auth.user}
    />
  );
}
