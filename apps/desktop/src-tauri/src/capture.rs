use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::state::{HostError, HostState};

pub const OCR_MAX_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CaptureSource {
    Camera,
    Gallery,
    File,
    Screenshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRef {
    pub capture_id: String,
    pub source: CaptureSource,
    pub file_name: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
}

#[derive(Debug, Clone)]
pub struct CaptureRecord {
    pub path: PathBuf,
}

fn cache_root(app: &AppHandle) -> Result<PathBuf, HostError> {
    app.path()
        .app_cache_dir()
        .map_err(|error| HostError::new("internal_error", format!("Cache directory: {error}"), false))
}

fn captures_dir(app: &AppHandle) -> Result<PathBuf, HostError> {
    let dir = cache_root(app)?.join("captures");
    fs::create_dir_all(&dir)
        .map_err(|error| HostError::new("internal_error", format!("Create capture directory: {error}"), false))?;
    Ok(dir)
}

fn image_size(path: &Path) -> Result<(u32, u32), HostError> {
    image::image_dimensions(path)
        .map_err(|error| HostError::new("invalid_input", format!("Unsupported image: {error}"), false))
}

fn mime_for(path: &Path) -> String {
    match image::guess_format(&fs::read(path).unwrap_or_default()) {
        Ok(image::ImageFormat::Png) => "image/png".to_string(),
        Ok(image::ImageFormat::WebP) => "image/webp".to_string(),
        _ => "image/jpeg".to_string(),
    }
}

fn record_file(
    app: &AppHandle,
    state: &HostState,
    path: PathBuf,
    file_name: String,
    source: CaptureSource,
) -> Result<CaptureRef, HostError> {
    let metadata = fs::metadata(&path)
        .map_err(|error| HostError::new("invalid_input", format!("Read capture: {error}"), false))?;
    if metadata.len() > OCR_MAX_BYTES {
        return Err(HostError::new(
            "invalid_input",
            "Capture is larger than 10 MB",
            false,
        ));
    }
    let (width, height) = image_size(&path)?;
    let id = Uuid::new_v4().to_string();
    state.insert_capture(
        id.clone(),
        CaptureRecord { path: path.clone() },
    )?;
    let _ = app;
    Ok(CaptureRef {
        capture_id: id,
        source,
        file_name,
        mime_type: mime_for(&path),
        width,
        height,
        size_bytes: metadata.len(),
    })
}

#[tauri::command]
pub async fn capture_screen(
    app: AppHandle,
    state: tauri::State<'_, HostState>,
    region: Option<CaptureRegion>,
) -> Result<CaptureRef, HostError> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, state, region);
        return Err(HostError::unsupported(
            "Screenshot capture is not available on mobile; import a screenshot instead",
        ));
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let screen = screenshots::Screen::all()
            .map_err(|error| HostError::new("unsupported_capability", format!("Capture display: {error}"), true))?
            .into_iter()
            .next()
            .ok_or_else(|| HostError::new("unsupported_capability", "No display is available", false))?;
        let image = match region {
            Some(region) => {
                if region.width == 0 || region.height == 0 {
                    return Err(HostError::new("invalid_input", "Capture region is empty", false));
                }
                screen
                    .capture_area(region.x as i32, region.y as i32, region.width, region.height)
                    .map_err(|error| HostError::new("unsupported_capability", format!("Capture region: {error}"), true))?
            }
            None => screen
                .capture()
                .map_err(|error| HostError::new("unsupported_capability", format!("Capture display: {error}"), true))?,
        };
        let path = captures_dir(&app)?.join(format!("{}.png", Uuid::new_v4()));
        image
            .save(&path)
            .map_err(|error| HostError::new("internal_error", format!("Write screenshot: {error}"), false))?;
        record_file(
            &app,
            &state,
            path,
            "screenshot.png".to_string(),
            CaptureSource::Screenshot,
        )
    }
}

#[tauri::command]
pub async fn capture_import(
    app: AppHandle,
    state: tauri::State<'_, HostState>,
    bytes: Vec<u8>,
    file_name: String,
    source: CaptureSource,
) -> Result<CaptureRef, HostError> {
    if bytes.is_empty() {
        return Err(HostError::new("invalid_input", "The image is empty", false));
    }
    if bytes.len() as u64 > OCR_MAX_BYTES {
        return Err(HostError::new("invalid_input", "The image is larger than 10 MB", false));
    }
    let path = captures_dir(&app)?.join(format!("{}.img", Uuid::new_v4()));
    fs::write(&path, &bytes)
        .map_err(|error| HostError::new("internal_error", format!("Write image: {error}"), false))?;
    if image_size(&path).is_err() {
        let _ = fs::remove_file(&path);
        return Err(HostError::new("invalid_input", "The file is not a supported image", false));
    }
    record_file(&app, &state, path, file_name, source)
}

#[tauri::command]
pub async fn capture_import_path(
    app: AppHandle,
    state: tauri::State<'_, HostState>,
    path: String,
    file_name: String,
    source: CaptureSource,
) -> Result<CaptureRef, HostError> {
    let source_path = PathBuf::from(path);
    let canonical = source_path
        .canonicalize()
        .map_err(|error| HostError::new("invalid_input", format!("Capture file: {error}"), false))?;
    let cache = cache_root(&app)?
        .canonicalize()
        .map_err(|error| HostError::new("internal_error", format!("Cache root: {error}"), false))?;
    if !canonical.starts_with(&cache) {
        return Err(HostError::new(
            "invalid_input",
            "Capture file must be inside the app cache",
            false,
        ));
    }
    let metadata = fs::metadata(&canonical)
        .map_err(|error| HostError::new("invalid_input", format!("Capture file: {error}"), false))?;
    if metadata.len() > OCR_MAX_BYTES {
        return Err(HostError::new("invalid_input", "Capture is larger than 10 MB", false));
    }
    let destination = captures_dir(&app)?.join(format!("{}.img", Uuid::new_v4()));
    fs::copy(&canonical, &destination)
        .map_err(|error| HostError::new("internal_error", format!("Copy capture: {error}"), false))?;
    record_file(&app, &state, destination, file_name, source)
}

#[tauri::command]
pub async fn capture_release(
    state: tauri::State<'_, HostState>,
    capture_id: String,
) -> Result<(), HostError> {
    if let Some(record) = state.remove_capture(&capture_id)? {
        let _ = fs::remove_file(record.path);
    }
    Ok(())
}

#[tauri::command]
pub async fn capture_preview(
    state: tauri::State<'_, HostState>,
    capture_id: String,
) -> Result<String, HostError> {
    let path = state.capture_path(&capture_id)?;
    let bytes = fs::read(&path)
        .map_err(|error| HostError::new("invalid_input", format!("Read capture: {error}"), false))?;
    let mime = mime_for(&path);
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
