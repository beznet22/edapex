use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::state::HostError;

/// Everything the agent runtime needs from the process it runs in.
///
/// A struct rather than a trait, because it is data: three directories, no
/// behaviour. The Tauri host builds it from the app's paths; a WorkManager
/// worker builds it from the paths Kotlin passes, and that is what lets a turn
/// resume with no Activity alive.
#[derive(Debug, Clone)]
pub struct HostEnv {
    pub cache_dir: PathBuf,
    /// The run journal opens `agent.db` here. The field exists now because it is
    /// the seam's third path; the journal is the next commit, not this one.
    #[allow(dead_code)]
    pub data_dir: PathBuf,
    pub resource_dir: PathBuf,
}

impl HostEnv {
    pub fn new(cache_dir: PathBuf, data_dir: PathBuf, resource_dir: PathBuf) -> Self {
        HostEnv {
            cache_dir,
            data_dir,
            resource_dir,
        }
    }

    pub fn from_app(app: &AppHandle) -> Result<Self, HostError> {
        let paths = app.path();
        let cache_dir = paths
            .app_cache_dir()
            .map_err(|error| HostError::new("internal_error", format!("Cache directory: {error}"), true))?;
        let data_dir = paths.app_data_dir().map_err(|error| {
            HostError::new("internal_error", format!("Data directory: {error}"), true)
        })?;
        let resource_dir = paths.resource_dir().unwrap_or_default();
        Ok(HostEnv::new(cache_dir, data_dir, resource_dir))
    }

    pub fn captures_dir(&self) -> PathBuf {
        self.cache_dir.join("captures")
    }

    #[allow(dead_code)]
    pub fn agent_db(&self) -> PathBuf {
        self.data_dir.join("agent.db")
    }

    /// Where the RustO model release is installed.
    ///
    /// An explicit override wins, then the bundled resource, then the working
    /// copy in the repository — a debug build on a desk has no resource bundle.
    pub fn models_dir(&self) -> Result<PathBuf, HostError> {
        if let Ok(path) = std::env::var("EDAPEX_OCR_MODELS_DIR") {
            return Ok(PathBuf::from(path));
        }
        let bundled = self.resource_dir.join("ocr");
        if bundled.join("manifest.json").is_file() {
            return Ok(bundled);
        }
        let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ocr");
        if development.join("manifest.json").is_file() {
            return Ok(development);
        }
        Err(HostError::new(
            "model_missing",
            "RustO OCR models are not installed; run scripts/fetch-rusto-models.mjs",
            false,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_runtime_environment_needs_no_application() {
        let env = HostEnv::new(
            PathBuf::from("/cache"),
            PathBuf::from("/data"),
            PathBuf::from("/res"),
        );
        assert_eq!(env.captures_dir(), PathBuf::from("/cache/captures"));
        assert_eq!(env.agent_db(), PathBuf::from("/data/agent.db"));
    }
}
