use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::error::OcrError;

pub const MANIFEST_FILE: &str = "manifest.json";
pub const REQUIRED_MODEL_FILES: [&str; 3] = ["det.onnx", "rec.onnx", "dict.txt"];

#[derive(Debug, Clone, Deserialize)]
pub struct ModelManifest {
    pub version: String,
    pub source: String,
    pub files: Vec<ModelFile>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelFile {
    pub name: String,
    pub sha256: String,
    pub bytes: u64,
    pub url: String,
}

#[derive(Debug, Clone)]
pub struct ModelSet {
    pub version: String,
    pub det: PathBuf,
    pub rec: PathBuf,
    pub dict: PathBuf,
}

pub fn is_safe_model_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains('\0')
        && !Path::new(name).is_absolute()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub fn sha256_file(path: &Path) -> Result<String, OcrError> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 16 * 1024];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn required_file<'a>(
    manifest: &'a ModelManifest,
    name: &str,
) -> Result<&'a ModelFile, OcrError> {
    let mut matches = manifest.files.iter().filter(|file| file.name == name);
    let first = matches
        .next()
        .ok_or_else(|| OcrError::ManifestInvalid(format!("missing required model file {name}")))?;
    if matches.next().is_some() {
        return Err(OcrError::ManifestInvalid(format!(
            "duplicate required model file {name}"
        )));
    }
    Ok(first)
}

fn verify_model(dir: &Path, file: &ModelFile) -> Result<PathBuf, OcrError> {
    if !is_safe_model_name(&file.name) {
        return Err(OcrError::InvalidModelPath(file.name.clone()));
    }
    let path = dir.join(&file.name);
    let metadata = fs::metadata(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            OcrError::ModelFileMissing(path.clone())
        } else {
            OcrError::Io(error)
        }
    })?;
    if metadata.len() != file.bytes {
        return Err(OcrError::ModelSizeMismatch {
            file: file.name.clone(),
            expected: file.bytes,
            actual: metadata.len(),
        });
    }
    let actual = sha256_file(&path)?;
    if actual != file.sha256.to_lowercase() {
        return Err(OcrError::ModelChecksumMismatch {
            file: file.name.clone(),
            expected: file.sha256.to_lowercase(),
            actual,
        });
    }
    Ok(path)
}

pub fn load_models(dir: &Path) -> Result<ModelSet, OcrError> {
    if !dir.is_dir() {
        return Err(OcrError::ModelsMissing(dir.to_path_buf()));
    }
    let manifest_path = dir.join(MANIFEST_FILE);
    let manifest_text = fs::read_to_string(&manifest_path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            OcrError::ModelsMissing(manifest_path.clone())
        } else {
            OcrError::Io(error)
        }
    })?;
    let manifest: ModelManifest = serde_json::from_str(&manifest_text)
        .map_err(|error| OcrError::ManifestInvalid(error.to_string()))?;
    if manifest.version.trim().is_empty() {
        return Err(OcrError::ManifestInvalid(
            "model version must not be empty".to_string(),
        ));
    }
    for file in &manifest.files {
        if !is_safe_model_name(&file.name) {
            return Err(OcrError::InvalidModelPath(file.name.clone()));
        }
    }

    let det_file = required_file(&manifest, "det.onnx")?;
    let rec_file = required_file(&manifest, "rec.onnx")?;
    let dict_file = required_file(&manifest, "dict.txt")?;
    let det = verify_model(dir, det_file)?;
    let rec = verify_model(dir, rec_file)?;
    let dict = verify_model(dir, dict_file)?;

    Ok(ModelSet {
        version: manifest.version,
        det,
        rec,
        dict,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;
    use tempfile::tempdir;

    use super::*;

    fn write_model(dir: &Path, name: &str, contents: &[u8]) -> (String, u64) {
        fs::write(dir.join(name), contents).unwrap();
        (sha256_hex(contents), contents.len() as u64)
    }

    fn manifest_for(dir: &Path, version: &str) -> String {
        let det = write_model(dir, "det.onnx", b"det");
        let rec = write_model(dir, "rec.onnx", b"rec");
        let dict = write_model(dir, "dict.txt", b"dict");
        let manifest = json!({
            "version": version,
            "source": "test",
            "files": [
                {"name": "det.onnx", "sha256": det.0, "bytes": det.1, "url": "https://example.test/det"},
                {"name": "rec.onnx", "sha256": rec.0, "bytes": rec.1, "url": "https://example.test/rec"},
                {"name": "dict.txt", "sha256": dict.0, "bytes": dict.1, "url": "https://example.test/dict"}
            ]
        });
        serde_json::to_string(&manifest).unwrap()
    }

    #[test]
    fn loads_a_valid_manifest() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join(MANIFEST_FILE), manifest_for(dir.path(), "test-v1")).unwrap();
        let models = load_models(dir.path()).unwrap();
        assert_eq!(models.version, "test-v1");
        assert_eq!(models.det, dir.path().join("det.onnx"));
        assert_eq!(models.rec, dir.path().join("rec.onnx"));
        assert_eq!(models.dict, dir.path().join("dict.txt"));
    }

    #[test]
    fn fails_closed_when_manifest_is_missing() {
        let dir = tempdir().unwrap();
        let error = load_models(dir.path()).unwrap_err();
        assert!(matches!(error, OcrError::ModelsMissing(_)));
    }

    #[test]
    fn rejects_checksum_mismatch() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join(MANIFEST_FILE), manifest_for(dir.path(), "test-v1")).unwrap();
        fs::write(dir.path().join("det.onnx"), b"BAD").unwrap();
        let error = load_models(dir.path()).unwrap_err();
        assert!(matches!(error, OcrError::ModelChecksumMismatch { .. }));
    }

    #[test]
    fn rejects_path_traversal_before_reading_files() {
        let dir = tempdir().unwrap();
        let manifest = json!({
            "version": "test-v1",
            "source": "test",
            "files": [
                {"name": "../det.onnx", "sha256": "00", "bytes": 1, "url": "https://example.test/det"},
                {"name": "rec.onnx", "sha256": "00", "bytes": 1, "url": "https://example.test/rec"},
                {"name": "dict.txt", "sha256": "00", "bytes": 1, "url": "https://example.test/dict"}
            ]
        });
        fs::write(
            dir.path().join(MANIFEST_FILE),
            serde_json::to_string(&manifest).unwrap(),
        )
        .unwrap();
        let error = load_models(dir.path()).unwrap_err();
        assert!(matches!(error, OcrError::InvalidModelPath(_)));
    }

    #[test]
    fn rejects_size_mismatch() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join(MANIFEST_FILE), manifest_for(dir.path(), "test-v1")).unwrap();
        fs::write(dir.path().join("dict.txt"), b"too long").unwrap();
        let error = load_models(dir.path()).unwrap_err();
        assert!(matches!(error, OcrError::ModelSizeMismatch { .. }));
    }

    #[test]
    fn validates_safe_names_and_hashes() {
        assert!(is_safe_model_name("det.onnx"));
        assert!(!is_safe_model_name("../det.onnx"));
        assert!(!is_safe_model_name("nested/det.onnx"));
        assert!(!is_safe_model_name("nested\\det.onnx"));
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
