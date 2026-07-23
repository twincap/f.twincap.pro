export type StorageDriver = "mock" | "webdav";

export interface NextcloudEnvironment {
  url: URL;
  username: string;
  appPassword: string;
  webdavRoot: string;
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
