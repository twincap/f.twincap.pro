"use client";

import {
  Archive,
  ChevronRight,
  Download,
  Eye,
  File as FileIcon,
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
import {
  type DragEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

type StorageDriver = "mock" | "webdav";
type ViewMode = "files" | "trash";
type PreviewKind = "audio" | "document" | "image" | "video";

type DialogState =
  | { type: "folder" }
  | { type: "upload" }
  | { type: "rename"; item: ArchiveItem }
  | { type: "delete"; items: ArchiveItem[] }
  | { type: "empty-trash" }
  | null;

interface SelectionBox {
  height: number;
  left: number;
  top: number;
  width: number;
}

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
  return <FileIcon className={styles.fileIcon} aria-hidden="true" />;
}

function getPreviewKind(item: ArchiveItem): PreviewKind | null {
  if (item.type !== "file") {
    return null;
  }
  const contentType = item.contentType?.split(";", 1)[0].toLowerCase() ?? "";
  const extension = item.name.split(".").pop()?.toLowerCase() ?? "";
  if (
    contentType.startsWith("image/") ||
    ["avif", "bmp", "gif", "heic", "jpeg", "jpg", "png", "svg", "webp"].includes(
      extension,
    )
  ) {
    return "image";
  }
  if (
    contentType.startsWith("audio/") ||
    ["aac", "flac", "m4a", "mp3", "ogg", "wav"].includes(extension)
  ) {
    return "audio";
  }
  if (
    contentType.startsWith("video/") ||
    ["m4v", "mov", "mp4", "ogv", "webm"].includes(extension)
  ) {
    return "video";
  }
  if (
    contentType.startsWith("text/") ||
    ["application/json", "application/pdf", "application/xml"].includes(
      contentType,
    ) ||
    contentType.endsWith("+json") ||
    contentType.endsWith("+xml") ||
    [
      "css",
      "csv",
      "html",
      "ini",
      "js",
      "json",
      "log",
      "md",
      "pdf",
      "toml",
      "ts",
      "tsx",
      "txt",
      "xml",
      "yaml",
      "yml",
    ].includes(extension)
  ) {
    return "document";
  }
  return null;
}

function browseUrl(path: string): string {
  if (!path) {
    return "/";
  }
  return `/browse/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function locationTarget(): { mode: ViewMode; path: string } {
  if (window.location.pathname === "/trash") {
    return { mode: "trash", path: "" };
  }
  if (window.location.pathname.startsWith("/browse/")) {
    try {
      return {
        mode: "files",
        path: window.location.pathname
          .slice("/browse/".length)
          .split("/")
          .map((segment) => decodeURIComponent(segment))
          .join("/"),
      };
    } catch {
      return { mode: "files", path: "" };
    }
  }
  return { mode: "files", path: "" };
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
  const isDelete =
    dialog.type === "delete" || dialog.type === "empty-trash";
  const title =
    dialog.type === "folder"
      ? "새 폴더"
      : dialog.type === "upload"
        ? "파일 업로드"
        : dialog.type === "rename"
          ? "이름 변경"
          : dialog.type === "empty-trash"
            ? "휴지통 비우기"
            : "휴지통으로 이동";

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
              <input autoFocus multiple name="file" required type="file" />
            </label>
          ) : null}
          {dialog.type === "delete" ? (
            <p className={styles.deleteMessage}>
              {dialog.items.length === 1 ? (
                <>
                  <strong>{dialog.items[0].name}</strong>을(를) 휴지통으로
                  이동할까요?
                </>
              ) : (
                <>
                  선택한 <strong>{dialog.items.length}개 항목</strong>을
                  휴지통으로 이동할까요?
                </>
              )}
              {dialog.items.some((item) => item.type === "folder")
                ? " 폴더 안의 항목도 함께 이동됩니다."
                : null}
            </p>
          ) : null}
          {dialog.type === "empty-trash" ? (
            <p className={styles.deleteMessage}>
              휴지통의 모든 항목을 영구 삭제할까요? 이 작업은 되돌릴 수
              없습니다.
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
              {busy
                ? "처리 중…"
                : dialog.type === "empty-trash"
                  ? "영구 삭제"
                  : dialog.type === "delete"
                    ? "휴지통으로 이동"
                    : "확인"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PreviewDialog({
  item,
  kind,
  onClose,
}: {
  item: ArchiveItem;
  kind: PreviewKind;
  onClose: () => void;
}) {
  const previewUrl = `/api/files/preview?path=${encodeURIComponent(item.path)}`;
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section
        aria-labelledby="preview-title"
        aria-modal="true"
        className={styles.previewDialog}
        role="dialog"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>FILE PREVIEW</p>
            <h2 id="preview-title">{item.name}</h2>
          </div>
          <div className={styles.previewActions}>
            <a
              className={styles.iconButton}
              href={`/api/files/download?path=${encodeURIComponent(item.path)}`}
              title="다운로드"
            >
              <Download aria-hidden="true" />
            </a>
            <button
              aria-label="미리보기 닫기"
              className={styles.iconButton}
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={styles.previewContent}>
          {kind === "image" ? (
            // The source is an authenticated, same-origin streaming endpoint.
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={item.name} src={previewUrl} />
          ) : kind === "audio" ? (
            <audio controls src={previewUrl}>
              브라우저가 오디오 미리보기를 지원하지 않습니다.
            </audio>
          ) : kind === "video" ? (
            <video controls src={previewUrl}>
              브라우저가 비디오 미리보기를 지원하지 않습니다.
            </video>
          ) : (
            <iframe sandbox="" src={previewUrl} title={`${item.name} 미리보기`} />
          )}
        </div>
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
  const [rootFolders, setRootFolders] = useState<ArchiveItem[]>([]);
  const [storageDriver, setStorageDriver] = useState<StorageDriver | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("files");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    item: ArchiveItem;
    kind: PreviewKind;
  } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileListRef = useRef<HTMLDivElement>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);

  const loadListing = useCallback(
    async (nextPath: string, pushHistory = true) => {
      try {
        const nextListing = await apiRequest<ArchiveListing>(
          `/api/files?path=${encodeURIComponent(nextPath)}`,
        );
        setError("");
        setListing(nextListing);
        setPath(nextListing.path);
        setViewMode("files");
        setSelectedPaths(new Set());
        setSelectionAnchor(null);
        if (nextListing.path === "") {
          setRootFolders(
            nextListing.items.filter((item) => item.type === "folder"),
          );
        }
        if (pushHistory) {
          window.history.pushState(null, "", browseUrl(nextListing.path));
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "목록을 불러오지 못했습니다.",
        );
      }
    },
    [],
  );

  const loadTrash = useCallback(async (pushHistory = true) => {
    try {
      const trashListing = await apiRequest<ArchiveListing>("/api/trash");
      setError("");
      setListing(trashListing);
      setPath("");
      setViewMode("trash");
      setSelectedPaths(new Set());
      setSelectionAnchor(null);
      if (pushHistory) {
        window.history.pushState(null, "", "/trash");
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "휴지통을 불러오지 못했습니다.",
      );
    }
  }, []);

  useEffect(() => {
    const loadCurrentLocation = () => {
      const target = locationTarget();
      if (target.mode === "trash") {
        void loadTrash(false);
      } else {
        void loadListing(target.path, false);
      }
    };
    loadCurrentLocation();
    window.addEventListener("popstate", loadCurrentLocation);
    return () => {
      window.removeEventListener("popstate", loadCurrentLocation);
    };
  }, [loadListing, loadTrash]);

  useEffect(() => {
    let active = true;
    const target = locationTarget();
    if (target.mode === "files" && target.path === "") {
      return () => {
        active = false;
      };
    }
    void apiRequest<ArchiveListing>("/api/files?path=")
      .then((rootListing) => {
        if (active) {
          setRootFolders(
            rootListing.items.filter((item) => item.type === "folder"),
          );
        }
      })
      .catch(() => {
        // Root shortcuts are optional; the current listing still reports errors.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<{ driver: StorageDriver }>("/api/storage")
      .then(({ driver }) => {
        if (active) {
          setStorageDriver(driver);
        }
      })
      .catch(() => {
        // Storage details stay hidden when the authenticated status check fails.
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

  async function uploadFiles(
    files: File[],
    destinationPath = path,
  ): Promise<void> {
    if (
      files.length === 0 ||
      files.some((file) => !(file instanceof globalThis.File))
    ) {
      throw new Error("파일을 선택해 주세요.");
    }
    await Promise.all(
      files.map(async (file) => {
        const uploadUrl = new URL(
          "/api/files/upload",
          window.location.origin,
        );
        uploadUrl.searchParams.set("parentPath", destinationPath);
        uploadUrl.searchParams.set("name", file.name);
        await apiRequest(uploadUrl.toString(), {
          method: "POST",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
      }),
    );
  }

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
        await Promise.all(
          dialog.items.map((item) =>
            apiRequest(
              `/api/files/delete?path=${encodeURIComponent(item.path)}`,
              { method: "DELETE" },
            ),
          ),
        );
      } else if (dialog.type === "empty-trash") {
        await apiRequest("/api/trash", { method: "DELETE" });
      } else {
        const fileInput = event.currentTarget.elements.namedItem("file");
        const files =
          fileInput instanceof HTMLInputElement
            ? Array.from(fileInput.files ?? [])
            : [];
        if (
          files.length === 0 ||
          files.some((file) => !(file instanceof globalThis.File))
        ) {
          throw new Error("파일을 선택해 주세요.");
        }
        await uploadFiles(files);
      }

      setDialog(null);
      setSelectedPaths(new Set());
      if (viewMode === "trash") {
        await loadTrash(false);
      } else {
        await loadListing(path, false);
      }
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

  async function handleMoveItems(
    paths: string[],
    destinationParentPath: string,
  ) {
    const movablePaths = paths.filter(
      (sourcePath) => sourcePath !== destinationParentPath,
    );
    if (movablePaths.length === 0) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await Promise.all(
        movablePaths.map((sourcePath) =>
          apiRequest("/api/files/move", {
            method: "PATCH",
            body: JSON.stringify({
              path: sourcePath,
              destinationParentPath,
            }),
          }),
        ),
      );
      setSelectedPaths(new Set());
      await loadListing(path, false);
    } catch (moveError) {
      setError(
        moveError instanceof Error
          ? moveError.message
          : "항목을 이동하지 못했습니다.",
      );
    } finally {
      setBusy(false);
      setDropTarget(null);
    }
  }

  async function handleDroppedFiles(
    files: File[],
    destinationPath = path,
  ) {
    if (viewMode !== "files" || files.length === 0) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await uploadFiles(files, destinationPath);
      await loadListing(path, false);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "파일을 업로드하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleItemClick(
    event: MouseEvent<HTMLElement>,
    item: ArchiveItem,
    index: number,
  ) {
    if (event.shiftKey && selectionAnchor !== null) {
      const start = Math.min(selectionAnchor, index);
      const end = Math.max(selectionAnchor, index);
      setSelectedPaths(
        new Set(items.slice(start, end + 1).map((candidate) => candidate.path)),
      );
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedPaths((current) => {
        const next = new Set(current);
        if (next.has(item.path)) {
          next.delete(item.path);
        } else {
          next.add(item.path);
        }
        return next;
      });
    } else {
      setSelectedPaths(new Set([item.path]));
    }
    setSelectionAnchor(index);
  }

  function handleItemOpen(item: ArchiveItem) {
    if (viewMode === "trash") {
      return;
    }
    if (item.type === "folder") {
      void loadListing(item.path);
      return;
    }
    const kind = getPreviewKind(item);
    if (kind) {
      setPreview({ item, kind });
    } else {
      setError("이 파일 형식은 브라우저 미리보기를 지원하지 않습니다.");
    }
  }

  function handleDragStart(
    event: DragEvent<HTMLElement>,
    item: ArchiveItem,
  ) {
    if (viewMode !== "files") {
      event.preventDefault();
      return;
    }
    const dragPaths = selectedPaths.has(item.path)
      ? [...selectedPaths]
      : [item.path];
    if (!selectedPaths.has(item.path)) {
      setSelectedPaths(new Set([item.path]));
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-f-archive-paths",
      JSON.stringify(dragPaths),
    );
  }

  function draggedPaths(event: DragEvent<HTMLElement>): string[] {
    try {
      const value = JSON.parse(
        event.dataTransfer.getData("application/x-f-archive-paths"),
      ) as unknown;
      return Array.isArray(value) &&
        value.every((entry) => typeof entry === "string")
        ? value
        : [];
    } catch {
      return [];
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(
        "[data-file-path], button, a, input",
      )
    ) {
      return;
    }
    const container = fileListRef.current;
    if (!container) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    selectionStartRef.current = { x: event.clientX, y: event.clientY };
    if (!event.ctrlKey && !event.metaKey) {
      setSelectedPaths(new Set());
    }
    const bounds = container.getBoundingClientRect();
    setSelectionBox({
      height: 0,
      left: event.clientX - bounds.left + container.scrollLeft,
      top: event.clientY - bounds.top + container.scrollTop,
      width: 0,
    });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = selectionStartRef.current;
    const container = fileListRef.current;
    if (!start || !container) {
      return;
    }
    const left = Math.min(start.x, event.clientX);
    const right = Math.max(start.x, event.clientX);
    const top = Math.min(start.y, event.clientY);
    const bottom = Math.max(start.y, event.clientY);
    const selected = new Set<string>();
    container
      .querySelectorAll<HTMLElement>("[data-file-path]")
      .forEach((row) => {
        const bounds = row.getBoundingClientRect();
        if (
          bounds.right >= left &&
          bounds.left <= right &&
          bounds.bottom >= top &&
          bounds.top <= bottom
        ) {
          const selectedPath = row.dataset.filePath;
          if (selectedPath) {
            selected.add(selectedPath);
          }
        }
      });
    const containerBounds = container.getBoundingClientRect();
    setSelectedPaths(selected);
    setSelectionBox({
      height: bottom - top,
      left: left - containerBounds.left + container.scrollLeft,
      top: top - containerBounds.top + container.scrollTop,
      width: right - left,
    });
  }

  function finishPointerSelection(event: PointerEvent<HTMLDivElement>) {
    if (selectionStartRef.current) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      selectionStartRef.current = null;
      setSelectionBox(null);
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
  const selectedItems = items.filter((item) => selectedPaths.has(item.path));

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
          <button
            className={
              viewMode === "files" && path === "" ? styles.activeNav : undefined
            }
            onClick={() => loadListing("")}
          >
            <FolderOpen aria-hidden="true" />
            모든 파일
          </button>
          {rootFolders.length > 0 ? (
            <>
              <div className={styles.navLabel}>바로가기</div>
              {rootFolders.map((folder) => (
                <button
                  className={
                    viewMode === "files" && path === folder.path
                      ? styles.activeNav
                      : undefined
                  }
                  key={folder.path}
                  onClick={() => loadListing(folder.path)}
                >
                  <Folder aria-hidden="true" />
                  {folder.name}
                </button>
              ))}
            </>
          ) : null}
          <div className={styles.navLabel}>관리</div>
          <button
            className={viewMode === "trash" ? styles.activeNav : undefined}
            onClick={() => loadTrash()}
          >
            <Trash2 aria-hidden="true" />
            휴지통
          </button>
        </nav>

        <div className={styles.storageCard}>
          <div>
            <HardDrive aria-hidden="true" />
            <span>
              {storageDriver === "webdav"
                ? "Nextcloud WebDAV"
                : storageDriver === "mock"
                  ? "Mock storage"
                  : "저장소 확인 중"}
            </span>
          </div>
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
              <p className={styles.eyebrow}>
                {viewMode === "trash" ? "DELETED FILES" : "PERSONAL ARCHIVE"}
              </p>
              <h1>{viewMode === "trash" ? "휴지통" : "내 아카이브"}</h1>
              <p>
                {viewMode === "trash"
                  ? "삭제한 파일과 폴더를 확인합니다."
                  : "클릭, Shift/Ctrl 선택 또는 빈 공간 드래그로 항목을 선택하세요."}
              </p>
            </div>
            <div className={styles.headingActions}>
              {viewMode === "files" ? (
                <>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => loadTrash()}
                  >
                    <Trash2 aria-hidden="true" />
                    휴지통
                  </button>
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
                </>
              ) : (
                <>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => loadListing("")}
                  >
                    <FolderOpen aria-hidden="true" />
                    모든 파일
                  </button>
                  <button
                    className={styles.dangerButton}
                    disabled={items.length === 0}
                    onClick={() => setDialog({ type: "empty-trash" })}
                  >
                    <Trash2 aria-hidden="true" />
                    휴지통 비우기
                  </button>
                </>
              )}
            </div>
          </div>

          <nav aria-label="현재 경로" className={styles.breadcrumbs}>
            {viewMode === "trash" ? (
              <>
                <span>
                  <button onClick={() => loadListing("")}>내 아카이브</button>
                </span>
                <span>
                  <ChevronRight aria-hidden="true" />
                  <button aria-current="page">휴지통</button>
                </span>
              </>
            ) : (
              breadcrumbs.map((crumb, index) => (
                <span key={crumb.path || "root"}>
                  {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
                  <button
                    aria-current={
                      index === breadcrumbs.length - 1 ? "page" : undefined
                    }
                    onDragOver={(event) => {
                      if (
                        event.dataTransfer.types.includes(
                          "application/x-f-archive-paths",
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void handleMoveItems(draggedPaths(event), crumb.path);
                    }}
                    onClick={() => loadListing(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))
            )}
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
              <span>
                {items.length}개 항목
                {selectedPaths.size > 0
                  ? ` · ${selectedPaths.size}개 선택`
                  : ""}
              </span>
              {viewMode === "files" && selectedItems.length > 0 ? (
                <button
                  className={styles.selectionAction}
                  onClick={() =>
                    setDialog({ type: "delete", items: selectedItems })
                  }
                  type="button"
                >
                  선택 항목을 휴지통으로
                </button>
              ) : (
                <span>{viewMode === "trash" ? "삭제일순" : "이름순"}</span>
              )}
            </div>

            <div className={styles.tableHeader} aria-hidden="true">
              <span />
              <span>이름</span>
              <span>크기</span>
              <span>{viewMode === "trash" ? "삭제일" : "수정일"}</span>
              <span>작업</span>
            </div>

            <div
              className={styles.fileList}
              data-testid="file-list"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files")) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(event) => {
                if (event.dataTransfer.files.length > 0) {
                  event.preventDefault();
                  void handleDroppedFiles(
                    Array.from(event.dataTransfer.files),
                  );
                }
              }}
              onPointerCancel={finishPointerSelection}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerSelection}
              ref={fileListRef}
            >
              {!listing ? (
                <div className={styles.emptyState}>목록을 불러오는 중…</div>
              ) : items.length === 0 ? (
                <div className={styles.emptyState}>
                  {viewMode === "trash" ? (
                    <Trash2 aria-hidden="true" />
                  ) : (
                    <FolderOpen aria-hidden="true" />
                  )}
                  <strong>
                    {viewMode === "trash"
                      ? "휴지통이 비어 있습니다."
                      : "이 폴더는 비어 있습니다."}
                  </strong>
                  <span>
                    {viewMode === "trash"
                      ? "삭제한 항목이 여기에 표시됩니다."
                      : "파일을 끌어 놓거나 새 폴더를 만들어 보세요."}
                  </span>
                </div>
              ) : (
                items.map((item, index) => (
                  <article
                    className={[
                      styles.fileRow,
                      selectedPaths.has(item.path)
                        ? styles.fileRowSelected
                        : "",
                      dropTarget === item.path ? styles.fileRowDropTarget : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-file-path={item.path}
                    draggable={viewMode === "files"}
                    key={item.path}
                    onClick={(event) => handleItemClick(event, item, index)}
                    onDoubleClick={() => handleItemOpen(item)}
                    onDragEnd={() => setDropTarget(null)}
                    onDragEnter={(event) => {
                      if (viewMode === "files" && item.type === "folder") {
                        event.preventDefault();
                        setDropTarget(item.path);
                      }
                    }}
                    onDragOver={(event) => {
                      if (viewMode === "files" && item.type === "folder") {
                        event.preventDefault();
                        event.dataTransfer.dropEffect =
                          event.dataTransfer.files.length > 0
                            ? "copy"
                            : "move";
                      }
                    }}
                    onDragStart={(event) => handleDragStart(event, item)}
                    onDrop={(event) => {
                      if (viewMode === "files" && item.type === "folder") {
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.dataTransfer.files.length > 0) {
                          void handleDroppedFiles(
                            Array.from(event.dataTransfer.files),
                            item.path,
                          );
                        } else {
                          void handleMoveItems(
                            draggedPaths(event),
                            item.path,
                          );
                        }
                      }
                    }}
                  >
                    <input
                      aria-label={`${item.name} 선택`}
                      checked={selectedPaths.has(item.path)}
                      className={styles.selectionCheckbox}
                      onChange={() => {
                        setSelectedPaths((current) => {
                          const next = new Set(current);
                          if (next.has(item.path)) {
                            next.delete(item.path);
                          } else {
                            next.add(item.path);
                          }
                          return next;
                        });
                        setSelectionAnchor(index);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                    <button
                      className={styles.fileName}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleItemClick(event, item, index);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        handleItemOpen(item);
                      }}
                      type="button"
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
                      {viewMode === "files" &&
                      item.type === "file" &&
                      getPreviewKind(item) ? (
                        <button
                          aria-label={`${item.name} 미리보기`}
                          className={styles.iconButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleItemOpen(item);
                          }}
                          title="미리보기"
                          type="button"
                        >
                          <Eye aria-hidden="true" />
                        </button>
                      ) : null}
                      {viewMode === "files" && item.type === "file" ? (
                        <a
                          aria-label={`${item.name} 다운로드`}
                          className={styles.iconButton}
                          href={`/api/files/download?path=${encodeURIComponent(item.path)}`}
                          onClick={(event) => event.stopPropagation()}
                          title="다운로드"
                        >
                          <Download aria-hidden="true" />
                        </a>
                      ) : null}
                      {viewMode === "files" ? (
                        <>
                          <button
                            aria-label={`${item.name} 이름 변경`}
                            className={styles.iconButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDialog({ type: "rename", item });
                            }}
                            title="이름 변경"
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                          <button
                            aria-label={`${item.name} 휴지통으로 이동`}
                            className={styles.iconButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDialog({ type: "delete", items: [item] });
                            }}
                            title="휴지통으로 이동"
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
              {selectionBox ? (
                <div
                  aria-hidden="true"
                  className={styles.selectionBox}
                  style={selectionBox}
                />
              ) : null}
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
      {preview ? (
        <PreviewDialog
          item={preview.item}
          kind={preview.kind}
          onClose={() => setPreview(null)}
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
