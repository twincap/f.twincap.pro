const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const PATH_SEPARATOR = /[\\/]/;

export class InvalidArchivePathError extends Error {
  constructor(message = "올바르지 않은 경로입니다.") {
    super(message);
    this.name = "InvalidArchivePathError";
  }
}

function decodeRepeatedly(input: string): string {
  let decoded = input;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new InvalidArchivePathError();
    }

    if (next === decoded) {
      return decoded;
    }
    decoded = next;
  }

  return decoded;
}

export function validateArchiveName(input: string): string {
  const name = decodeRepeatedly(input).normalize("NFC").trim();

  if (
    name.length === 0 ||
    name.length > 255 ||
    name === "." ||
    name === ".." ||
    PATH_SEPARATOR.test(name) ||
    CONTROL_CHARACTERS.test(name)
  ) {
    throw new InvalidArchivePathError("올바르지 않은 이름입니다.");
  }

  return name;
}

export function normalizeArchivePath(input: unknown): string {
  if (typeof input !== "string") {
    throw new InvalidArchivePathError();
  }

  const decoded = decodeRepeatedly(input).normalize("NFC").trim();
  if (decoded === "") {
    return "";
  }

  if (
    decoded.startsWith("/") ||
    decoded.startsWith("\\") ||
    decoded.includes("\\") ||
    CONTROL_CHARACTERS.test(decoded)
  ) {
    throw new InvalidArchivePathError();
  }

  const segments = decoded.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.length > 255,
    )
  ) {
    throw new InvalidArchivePathError();
  }

  return segments.join("/");
}

export function joinArchivePath(parent: string, name: string): string {
  const safeParent = normalizeArchivePath(parent);
  const safeName = validateArchiveName(name);
  return safeParent ? `${safeParent}/${safeName}` : safeName;
}

export function parentArchivePath(path: string): string {
  const safePath = normalizeArchivePath(path);
  const separatorIndex = safePath.lastIndexOf("/");
  return separatorIndex === -1 ? "" : safePath.slice(0, separatorIndex);
}

export function isDescendantPath(candidate: string, parent: string): boolean {
  const safeCandidate = normalizeArchivePath(candidate);
  const safeParent = normalizeArchivePath(parent);
  return safeParent === ""
    ? safeCandidate !== ""
    : safeCandidate.startsWith(`${safeParent}/`);
}
