export type StorageDriver = "mock" | "webdav";

export interface NextcloudEnvironment {
  url: URL;
  username: string;
  appPassword: string;
  webdavRoot: string;
}

export function getAppOrigin(): string | undefined {
  const rawOrigin = process.env.APP_ORIGIN;
  if (!rawOrigin) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error("APP_ORIGIN must be an absolute http or https URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use the http or https protocol.");
  }

  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error(
      "APP_ORIGIN must contain only an origin without credentials, path, query, or fragment.",
    );
  }

  return url.origin;
}

export function getStorageDriver(): StorageDriver {
  const value = process.env.STORAGE_DRIVER ?? "mock";
  if (value !== "mock" && value !== "webdav") {
    throw new Error("STORAGE_DRIVER must be either mock or webdav.");
  }
  return value;
}

export function getNextcloudEnvironment(): NextcloudEnvironment {
  const rawUrl = process.env.NEXTCLOUD_URL;
  const username = process.env.NEXTCLOUD_USERNAME;
  const appPassword = process.env.NEXTCLOUD_APP_PASSWORD;
  const webdavRoot = process.env.NEXTCLOUD_WEBDAV_ROOT;

  if (!rawUrl || !username || !appPassword || !webdavRoot) {
    throw new Error("Nextcloud server environment is incomplete.");
  }

  return {
    url: new URL(rawUrl),
    username,
    appPassword,
    webdavRoot,
  };
}
