/**
 * Update service
 * 
 * Frontend service for checking and installing application updates.
 * Supports stable and beta release channels.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface UpdateMetadata {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface DownloadProgress {
  downloaded: number;
  contentLength: number | null;
}

export type DownloadEvent = 
  | { event: 'Started'; data: { contentLength: number | null } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished'; data: null };

export type ReleaseChannel = 'stable' | 'beta';

/**
 * Check for updates on the specified channel
 * 
 * @param channel - Release channel to check (stable or beta)
 * @returns Update metadata if an update is available, null otherwise
 */
export async function checkForUpdate(channel: ReleaseChannel = 'stable'): Promise<UpdateMetadata | null> {
  try {
    const result = await invoke<UpdateMetadata | null>('check_for_update', { channel });
    return result;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    throw error;
  }
}

/**
 * Download and install a pending update
 * 
 * @param onProgress - Callback to receive download progress events
 * @returns Promise that resolves when download and install is complete
 */
export async function downloadAndInstallUpdate(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  let unlisten: UnlistenFn | null = null;
  
  try {
    let currentProgress: DownloadProgress = {
      downloaded: 0,
      contentLength: null,
    };

    // Listen for download progress events
    if (onProgress) {
      unlisten = await listen<DownloadEvent>('download-and-install-update', (event) => {
        const payload = event.payload;
        
        if (payload.event === 'Started') {
          currentProgress.contentLength = payload.data.contentLength;
          onProgress(currentProgress);
        } else if (payload.event === 'Progress') {
          currentProgress.downloaded += payload.data.chunkLength;
          onProgress(currentProgress);
        } else if (payload.event === 'Finished') {
          // Download complete
          onProgress(currentProgress);
        }
      });
    }

    // Start the download and installation
    await invoke('download_and_install_update');
  } catch (error) {
    console.error('Failed to download and install update:', error);
    throw error;
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}

/**
 * Get the current application version
 * 
 * @returns The current version string
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    return await invoke<string>('get_current_version');
  } catch (error) {
    console.error('Failed to get current version:', error);
    return 'unknown';
  }
}
