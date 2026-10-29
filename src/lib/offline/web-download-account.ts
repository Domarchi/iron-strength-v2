/** Downloads must finish before the training lock is taken: their commit needs that same lock. */
export async function reserveWebDownloadAccount(
  download: { reserve(): Promise<() => void> },
  reserveTraining: () => Promise<() => void>,
): Promise<() => void> {
  const releaseDownload = await download.reserve();
  try {
    const releaseTraining = await reserveTraining();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try {
        releaseTraining();
      } finally {
        releaseDownload();
      }
    };
  } catch (error) {
    releaseDownload();
    throw error;
  }
}
