import {
  createDownloadTask,
  getExistingDownloadTasks,
  setConfig,
  type DownloadTask,
} from '@kesha-antonov/react-native-background-downloader';
import { PermissionsAndroid, Platform } from 'react-native';

let configured = false;

function ensureBackgroundDownloaderConfigured(): void {
  if (configured) {
    return;
  }

  setConfig({
    showNotificationsEnabled: true,
    notificationsGrouping: {
      enabled: true,
      mode: 'summaryOnly',
      texts: {
        downloadTitle: 'Puente',
        downloadStarting: 'Starting model download…',
        downloadProgress: 'Downloading model… {progress}%',
        downloadFinished: 'Model download complete',
        groupTitle: 'Puente',
        groupText: (count) => `${count} model file(s) downloading`,
      },
    },
  });

  configured = true;
}

export async function requestDownloadPermissions(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  if (Platform.Version < 33) {
    return;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: 'Download notifications',
      message: 'Puente shows download progress while the model downloads in the background.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );

  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    console.warn('[puente] POST_NOTIFICATIONS denied — background download notifications may be hidden');
  }
}

function waitForDownloadTask(
  task: DownloadTask,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (task.state === 'DONE') {
      resolve();
      return;
    }

    if (task.state === 'FAILED') {
      reject(new Error(`Download failed for ${task.id}`));
      return;
    }

    task
      .progress(({ bytesDownloaded, bytesTotal }) => {
        onProgress?.(bytesDownloaded, bytesTotal);
      })
      .done(() => resolve())
      .error(({ error }) => reject(new Error(error)));

    if (task.state === 'PAUSED') {
      void task.resume();
    }
  });
}

export async function reconnectExistingDownloadTask(
  id: string,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
): Promise<boolean> {
  ensureBackgroundDownloaderConfigured();

  const existingTasks = await getExistingDownloadTasks();
  const task = existingTasks.find((entry) => entry.id === id);

  if (!task) {
    return false;
  }

  console.log('[puente] androidDownload:reconnect', id, task.state);
  await waitForDownloadTask(task, onProgress);
  return true;
}

export async function downloadFileToDestination(options: {
  id: string;
  url: string;
  destinationUri: string;
  onProgress?: (bytesWritten: number, totalBytes: number) => void;
}): Promise<void> {
  ensureBackgroundDownloaderConfigured();

  const reconnected = await reconnectExistingDownloadTask(options.id, options.onProgress);
  if (reconnected) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const task = createDownloadTask({
      id: options.id,
      url: options.url,
      destination: options.destinationUri,
      maxRedirects: 10,
    });

    task
      .progress(({ bytesDownloaded, bytesTotal }) => {
        options.onProgress?.(bytesDownloaded, bytesTotal);
      })
      .done(() => resolve())
      .error(({ error }) => reject(new Error(error)));

    task.start();
  });
}
