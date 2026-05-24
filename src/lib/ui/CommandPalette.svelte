<script lang="ts">
import { createEventDispatcher } from 'svelte';
import { keyboardStore, formatShortcut, type Shortcut } from '../stores/keyboard';

export let open = false;

const dispatch = createEventDispatcher<{ close: void }>();

let query = '';
let searchInput: HTMLInputElement | null = null;

$: if (open) {
  query = '';
}

$: if (open && searchInput) {
  queueMicrotask(() => {
    searchInput?.focus();
    searchInput?.select();
  });
}

$: shortcuts = $keyboardStore;
$: normalizedQuery = query.trim().toLowerCase();
$: filteredShortcuts = shortcuts.filter((shortcut) => {
  if (!normalizedQuery) {
    return true;
  }

  const searchableText = [shortcut.description, shortcut.category, formatShortcut(shortcut)]
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
});

function closePalette() {
  dispatch('close');
}

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    closePalette();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
    return;
  }

  if (event.key === 'Enter' && filteredShortcuts.length > 0) {
    event.preventDefault();
    filteredShortcuts[0].action();
    closePalette();
  }
}

function runShortcut(shortcut: Shortcut) {
  shortcut.action();
  closePalette();
}

function getCategoryLabel(category: Shortcut['category']) {
  if (category === 'navigation') return 'Navigation';
  if (category === 'action') return 'Actions';
  return 'General';
}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="palette-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="palette-modal" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
      <div class="palette-header">
        <div>
          <p class="palette-kicker">Quick actions</p>
          <h2 id="command-palette-title">Command Palette</h2>
        </div>
        <span class="palette-hint">Enter to run</span>
      </div>

      <div class="search-shell">
        <span class="search-icon" aria-hidden="true">⌘</span>
        <input
          bind:this={searchInput}
          bind:value={query}
          type="text"
          placeholder="Search commands and shortcuts"
          aria-label="Search commands and shortcuts"
        />
      </div>

      <div class="palette-results">
        {#if filteredShortcuts.length > 0}
          {#each filteredShortcuts as shortcut (`${shortcut.category}-${formatShortcut(shortcut)}-${shortcut.description}`)}
            <button class="shortcut-row" onclick={() => runShortcut(shortcut)}>
              <span class="shortcut-copy">
                <span class="shortcut-category">{getCategoryLabel(shortcut.category)}</span>
                <span class="shortcut-description">{shortcut.description}</span>
              </span>
              <span class="shortcut-key">{formatShortcut(shortcut)}</span>
            </button>
          {/each}
        {:else}
          <div class="empty-state">
            <p>No commands match “{query}”.</p>
            <span>Try a view name like invoices or a key combo like Alt+2.</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 72px 24px 24px;
    background: rgba(15, 23, 42, 0.56);
    backdrop-filter: blur(10px);
    z-index: 1100;
  }

  .palette-modal {
    width: min(100%, 680px);
    background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
    border: 1px solid rgba(52, 152, 219, 0.16);
    border-radius: 12px;
    box-shadow: 0 28px 64px rgba(44, 62, 80, 0.24);
    overflow: hidden;
  }

  .palette-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 24px 16px;
    border-bottom: 1px solid #ecf0f1;
  }

  .palette-kicker {
    margin: 0 0 6px 0;
    color: #3498db;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .palette-header h2 {
    margin: 0;
    color: #2c3e50;
    font-size: 24px;
    line-height: 1.1;
  }

  .palette-hint {
    align-self: center;
    padding: 6px 10px;
    background: #edf6fc;
    border: 1px solid #d6eaf8;
    border-radius: 999px;
    color: #2874a6;
    font-size: 12px;
    font-weight: 600;
  }

  .search-shell {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 12px;
    margin: 20px 24px 16px;
    padding: 14px 16px;
    background: white;
    border: 1px solid #d6eaf8;
    border-radius: 10px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .search-shell:focus-within {
    border-color: #3498db;
    box-shadow: 0 0 0 4px rgba(52, 152, 219, 0.12);
  }

  .search-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #edf6fc;
    color: #3498db;
    font-size: 16px;
    font-weight: 700;
  }

  .search-shell input {
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: #2c3e50;
    font-size: 16px;
  }

  .search-shell input:focus {
    outline: none;
  }

  .search-shell input::placeholder {
    color: #7f8c8d;
  }

  .palette-results {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 420px;
    padding: 0 16px 16px;
    overflow-y: auto;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    padding: 14px 16px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: white;
    color: #2c3e50;
    cursor: pointer;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }

  .shortcut-row:hover,
  .shortcut-row:focus-visible {
    border-color: #aed6f1;
    box-shadow: 0 10px 24px rgba(52, 152, 219, 0.12);
    transform: translateY(-1px);
    outline: none;
  }

  .shortcut-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .shortcut-category {
    color: #3498db;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .shortcut-description {
    color: #2c3e50;
    font-size: 15px;
    font-weight: 600;
  }

  .shortcut-key {
    flex-shrink: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #2c3e50;
    color: white;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 32px 20px 36px;
    text-align: center;
    color: #2c3e50;
  }

  .empty-state p {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .empty-state span {
    color: #7f8c8d;
    font-size: 14px;
  }

  @media (max-width: 640px) {
    .palette-backdrop {
      padding: 24px 12px 12px;
    }

    .palette-header,
    .search-shell {
      margin-left: 16px;
      margin-right: 16px;
      padding-left: 14px;
      padding-right: 14px;
    }

    .palette-header {
      padding-top: 18px;
      padding-bottom: 14px;
    }

    .shortcut-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
