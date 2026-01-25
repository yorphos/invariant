//! Update management module
//!
//! Handles checking for updates, downloading, and installing them.
//! Supports stable and beta release channels.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[cfg(desktop)]
use tauri_plugin_updater::{Update, UpdaterExt};

/// Errors that can occur during update operations
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[cfg(desktop)]
    #[error("updater error: {0}")]
    Updater(String),
    #[error("there is no pending update")]
    NoPendingUpdate,
}

#[cfg(desktop)]
impl From<tauri_plugin_updater::Error> for Error {
    fn from(err: tauri_plugin_updater::Error) -> Self {
        Error::Updater(err.to_string())
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let msg = match self {
            #[cfg(desktop)]
            Error::Updater(s) => format!("updater error: {}", s),
            Error::NoPendingUpdate => "there is no pending update".to_string(),
        };
        serializer.serialize_str(&msg)
    }
}

type Result<T> = std::result::Result<T, Error>;

/// Download progress events sent to frontend
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename_all = "camelCase")]
    Progress { chunk_length: usize },
    Finished,
}

/// Update metadata returned to frontend
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub version: String,
    pub current_version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

/// Release channel type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseChannel {
    Stable,
    Beta,
}

impl ReleaseChannel {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "beta" => ReleaseChannel::Beta,
            _ => ReleaseChannel::Stable,
        }
    }

    pub fn to_str(&self) -> &'static str {
        match self {
            ReleaseChannel::Stable => "stable",
            ReleaseChannel::Beta => "beta",
        }
    }
}

/// Stores the pending update to be installed later
#[cfg(desktop)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[cfg(not(desktop))]
pub struct PendingUpdate(pub Mutex<Option<()>>);

/// Check for updates on the specified channel
///
/// # Arguments
/// * `app` - Application handle
/// * `pending_update` - State to store pending update
/// * `channel` - Release channel to check ("stable" or "beta")
///
/// # Returns
/// Update metadata if an update is available, None otherwise
#[cfg(desktop)]
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
    channel: String,
) -> Result<Option<UpdateMetadata>> {
    log::info!("Checking for updates on channel: {}", channel);

    let release_channel = ReleaseChannel::from_str(&channel);

    // Build the updater with appropriate settings based on channel
    let mut builder = app.updater_builder();

    // For beta channel, check pre-releases
    if release_channel == ReleaseChannel::Beta {
        // GitHub releases with pre-release flag
        builder = builder.endpoints(vec![
            "https://github.com/yorphos/invariant/releases/download/latest-beta/latest.json"
                .parse()
                .expect("invalid beta URL"),
        ])?;
    }
    // Stable channel uses default endpoint from tauri.conf.json

    let update = builder.build()?.check().await?;

    let update_metadata = update.as_ref().map(|update| UpdateMetadata {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        date: update.date.as_ref().map(|d| d.to_string()),
        body: update.body.clone(),
    });

    *pending_update.0.lock().unwrap() = update;

    log::info!(
        "Update check result: {}",
        if update_metadata.is_some() {
            "Update available"
        } else {
            "No update available"
        }
    );

    Ok(update_metadata)
}

/// Download and install the pending update
///
/// # Arguments
/// * `app` - Application handle
/// * `pending_update` - State containing the pending update
///
/// # Returns
/// Ok(()) on success, Error on failure
#[cfg(desktop)]
#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<()> {
    log::info!("Starting update download and installation");

    let Some(update) = pending_update.0.lock().unwrap().take() else {
        log::warn!("No pending update to install");
        return Err(Error::NoPendingUpdate);
    };

    let mut started = false;

    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    log::info!("Download started, content length: {:?}", content_length);
                    let _ = app.emit("download-and-install-update", DownloadEvent::Started { content_length });
                    started = true;
                }

                let _ = app.emit("download-and-install-update", DownloadEvent::Progress { chunk_length });
            },
            || {
                log::info!("Download finished, installing...");
                let _ = app.emit("download-and-install-update", DownloadEvent::Finished);
            },
        )
        .await?;

    log::info!("Update installed successfully");

    // On Windows, the app will exit automatically
    // On macOS/Linux, we need to restart manually
    #[cfg(not(target_os = "windows"))]
    {
        log::info!("Restarting application...");
        app.restart();
        // restart() doesn't return, but we need this for Windows path
    }

    #[cfg(target_os = "windows")]
    Ok(())
}

/// Get the current application version
#[cfg(desktop)]
#[tauri::command]
pub fn get_current_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}
