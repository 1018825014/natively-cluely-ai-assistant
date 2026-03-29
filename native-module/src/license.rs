use napi::bindgen_prelude::*;
use napi::Task;
use serde_json::json;
use sha2::{Digest, Sha256};

/// Returns a deterministic hardware fingerprint (SHA-256 hash of the machine UID).
/// This is used to lock license keys to a specific physical device.
#[napi]
pub fn get_hardware_id() -> String {
    let raw_id = machine_uid::get().unwrap_or_else(|_| {
        // Fallback: use hostname if hardware UID unavailable
        hostname_fallback()
    });

    let mut hasher = Sha256::new();
    hasher.update(raw_id.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Background task that verifies a license key via the configured license server.
/// Runs on a libuv worker thread and returns the raw JSON body from the service.
pub struct VerifyLicenseTask {
    license_key: String,
    hardware_id: String,
    endpoint: String,
}

impl Task for VerifyLicenseTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| napi::Error::from_reason(format!("ERR:client:{}", e)))?;

        let endpoint = if self.endpoint.trim().is_empty() {
            default_license_endpoint()
        } else {
            self.endpoint.trim().to_string()
        };

        let payload = json!({
            "license_key": self.license_key,
            "hardware_id": self.hardware_id,
        });

        match client.post(endpoint.as_str()).json(&payload).send() {
            Ok(response) => {
                let status = response.status();
                let body = response.text().unwrap_or_else(|_| {
                    json!({
                        "success": status.is_success(),
                        "status": "empty_response",
                        "error": "license server returned an empty body"
                    })
                    .to_string()
                });

                if body.trim().is_empty() {
                    Ok(json!({
                        "success": status.is_success(),
                        "status": "empty_response",
                        "error": "license server returned an empty body"
                    })
                    .to_string())
                } else {
                    Ok(body)
                }
            }
            Err(e) => Ok(json!({
                "success": false,
                "status": "network_error",
                "error": format!("无法连接许可证服务: {}", e),
            })
            .to_string()),
        }
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

/// Validates a license key by calling the provided license service endpoint.
/// Returns the raw JSON response from the license service.
#[napi]
pub fn verify_license_key(license_key: String, hardware_id: String, endpoint: String) -> AsyncTask<VerifyLicenseTask> {
    AsyncTask::new(VerifyLicenseTask { license_key, hardware_id, endpoint })
}

/// Compatibility alias kept for older JS call sites.
/// Uses the current hardware id and the configured NATIVELY_LICENSE_API_URL.
#[napi(js_name = "verifyGumroadKey")]
pub fn verify_gumroad_key_compat(license_key: String) -> AsyncTask<VerifyLicenseTask> {
    AsyncTask::new(VerifyLicenseTask {
        license_key,
        hardware_id: get_hardware_id(),
        endpoint: default_license_endpoint(),
    })
}

fn hostname_fallback() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| {
            // Last resort: read /etc/hostname on Unix
            std::fs::read_to_string("/etc/hostname")
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|_| "unknown-device".to_string())
        })
}

fn default_license_endpoint() -> String {
    let base = std::env::var("NATIVELY_LICENSE_API_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8787".to_string());
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/licenses/activate") {
        trimmed.to_string()
    } else {
        format!("{}/licenses/activate", trimmed)
    }
}
