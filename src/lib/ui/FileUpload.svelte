<script lang="ts">
  export let label = 'Upload File';
  export let accept = '*/*'; // MIME type filter, e.g., "image/*" or ".pdf,.jpg"
  export let multiple = false;
  export let disabled = false;
  export let maxSizeMB = 10; // Maximum file size in MB
  export let error = '';
  
  // Callback when files are selected
  export let onFilesSelected: ((files: File[]) => void) | undefined = undefined;
  
  let fileInput: HTMLInputElement;
  let dragOver = false;
  let selectedFiles: File[] = [];
  
  const id = `file-upload-${Math.random().toString(36).substr(2, 9)}`;
  
  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      processFiles(Array.from(input.files));
    }
  }
  
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    
    if (disabled) return;
    
    const files = event.dataTransfer?.files;
    if (files) {
      processFiles(Array.from(files));
    }
  }
  
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!disabled) {
      dragOver = true;
    }
  }
  
  function handleDragLeave() {
    dragOver = false;
  }
  
  function processFiles(files: File[]) {
    // Filter files by size
    const maxSize = maxSizeMB * 1024 * 1024;
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        error = `File "${file.name}" exceeds ${maxSizeMB}MB limit`;
        return false;
      }
      return true;
    });
    
    if (validFiles.length === 0) return;
    
    selectedFiles = multiple ? [...selectedFiles, ...validFiles] : validFiles;
    error = ''; // Clear any previous errors
    
    if (onFilesSelected) {
      onFilesSelected(selectedFiles);
    }
  }
  
  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
    if (onFilesSelected) {
      onFilesSelected(selectedFiles);
    }
  }
  
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  
  function triggerFileInput() {
    if (!disabled) {
      fileInput.click();
    }
  }
</script>

<div class="file-upload-group">
  {#if label}
    <label for={id}>{label}</label>
  {/if}
  
  <div 
    class="drop-zone" 
    class:drag-over={dragOver}
    class:disabled
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    onclick={triggerFileInput}
  >
    <input
      {id}
      type="file"
      {accept}
      {multiple}
      {disabled}
      bind:this={fileInput}
      onchange={handleFileSelect}
      style="display: none;"
    />
    
    <div class="drop-zone-content">
      <svg class="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <p class="drop-zone-text">
        {#if disabled}
          Upload disabled
        {:else}
          Drop {multiple ? 'files' : 'a file'} here or <span class="link">click to browse</span>
        {/if}
      </p>
      <p class="drop-zone-hint">
        {#if accept && accept !== '*/*'}
          Accepts: {accept} • 
        {/if}
        Max size: {maxSizeMB}MB
      </p>
    </div>
  </div>
  
  {#if error}
    <span class="error-message">{error}</span>
  {/if}
  
  {#if selectedFiles.length > 0}
    <div class="selected-files">
      <h4>Selected Files:</h4>
      <ul>
        {#each selectedFiles as file, index}
          <li class="file-item">
            <div class="file-info">
              <span class="file-name">{file.name}</span>
              <span class="file-size">{formatFileSize(file.size)}</span>
            </div>
            <button 
              type="button"
              class="remove-btn"
              onclick={() => removeFile(index)}
              disabled={disabled}
            >
              ×
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .file-upload-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  label {
    font-size: 14px;
    font-weight: 500;
    color: #2c3e50;
  }

  .drop-zone {
    border: 2px dashed #bdc3c7;
    border-radius: 8px;
    padding: 32px 24px;
    background: #f8f9fa;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .drop-zone:hover:not(.disabled) {
    border-color: #3498db;
    background: #ecf0f1;
  }

  .drop-zone.drag-over {
    border-color: #3498db;
    background: #e3f2fd;
  }

  .drop-zone.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #f5f5f5;
  }

  .drop-zone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .upload-icon {
    width: 48px;
    height: 48px;
    color: #7f8c8d;
    margin-bottom: 8px;
  }

  .drop-zone-text {
    margin: 0;
    font-size: 15px;
    color: #2c3e50;
  }

  .link {
    color: #3498db;
    font-weight: 500;
  }

  .drop-zone-hint {
    margin: 0;
    font-size: 13px;
    color: #7f8c8d;
  }

  .error-message {
    font-size: 13px;
    color: #e74c3c;
  }

  .selected-files {
    margin-top: 8px;
  }

  .selected-files h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 500;
    color: #2c3e50;
  }

  .selected-files ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .file-name {
    font-size: 14px;
    color: #2c3e50;
    word-break: break-word;
  }

  .file-size {
    font-size: 12px;
    color: #7f8c8d;
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: #e74c3c;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .remove-btn:hover:not(:disabled) {
    background: #ffe5e5;
  }

  .remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
