/**
 * Migration 017: Update Channel Preference
 * 
 * Adds update_channel setting to store user's preferred release channel (stable or beta).
 * Beta channel is restricted to Pro Mode users.
 */

export const migration017 = {
  id: '017',
  name: 'add_update_channel_setting',
  up: `
    -- Add update_channel setting (default: 'stable')
    INSERT OR IGNORE INTO settings (key, value, description)
    VALUES ('update_channel', 'stable', 'Update release channel (stable or beta)');

    -- Add last_update_check timestamp
    INSERT OR IGNORE INTO settings (key, value, description)
    VALUES ('last_update_check', '', 'Timestamp of last update check');
  `
};
