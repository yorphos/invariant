<script lang="ts">
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import type { UpdateMetadata, DownloadProgress } from '../services/updater';

  interface Props {
    open: boolean;
    updateInfo: UpdateMetadata;
    downloadProgress: DownloadProgress | null;
    onInstall: () => void;
    onSkip: () => void;
    onRemindLater: () => void;
  }

  let { open, updateInfo, downloadProgress, onInstall, onSkip, onRemindLater }: Props = $props();

  let isDownloading = $derived(downloadProgress !== null);
  let progressPercent = $derived(
    downloadProgress?.contentLength
      ? Math.round((downloadProgress.downloaded / downloadProgress.contentLength) * 100)
      : 0
  );

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
  }
</script>

<Modal open={open} title="Update Available" size="large" onclose={onRemindLater}>
  <div class="update-content">
    <div class="version-info">
      <h3>Version {updateInfo.version} is now available!</h3>
      <p class="current-version">You are currently running version {updateInfo.currentVersion}</p>
      {#if updateInfo.date}
        <p class="release-date">Released: {new Date(updateInfo.date).toLocaleDateString()}</p>
      {/if}
    </div>

    {#if updateInfo.body}
      <div class="release-notes">
        <h4>What's New:</h4>
        <div class="notes-content">
          {@html updateInfo.body.replace(/\n/g, '<br>')}
        </div>
      </div>
    {/if}

    {#if isDownloading}
      <div class="download-progress">
        <div class="progress-header">
          <span>Downloading update...</span>
          {#if downloadProgress?.contentLength}
            <span class="progress-size">
              {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.contentLength)}
            </span>
          {/if}
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progressPercent}%"></div>
        </div>
        <p class="progress-percent">{progressPercent}%</p>
      </div>
    {:else}
      <div class="actions">
        <Button onclick={onInstall} variant="primary">
          Download & Install
        </Button>
        <Button onclick={onRemindLater} variant="secondary">
          Remind Me Later
        </Button>
        <Button onclick={onSkip} variant="ghost">
          Skip This Version
        </Button>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .update-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .version-info h3 {
    margin: 0 0 8px 0;
    font-size: 20px;
    font-weight: 600;
    color: #2563eb;
  }

  .current-version {
    margin: 0 0 4px 0;
    color: #6b7280;
    font-size: 14px;
  }

  .release-date {
    margin: 0;
    color: #9ca3af;
    font-size: 13px;
  }

  .release-notes {
    border-top: 1px solid #e5e7eb;
    padding-top: 16px;
  }

  .release-notes h4 {
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
    color: #111827;
  }

  .notes-content {
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
    max-height: 300px;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
  }

  .download-progress {
    border-top: 1px solid #e5e7eb;
    padding-top: 16px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .progress-size {
    font-size: 13px;
    color: #6b7280;
  }

  .progress-bar {
    width: 100%;
    height: 24px;
    background-color: #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #2563eb 0%, #3b82f6 100%);
    transition: width 0.3s ease;
  }

  .progress-percent {
    margin: 8px 0 0 0;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: #2563eb;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    border-top: 1px solid #e5e7eb;
    padding-top: 16px;
  }
</style>
