export * from "./clock.port";
export * from "./email-sender.port";
export * from "./google-oauth.port";
export * from "./auth-config.port";
export * from "./ocr-client.port";
export * from "./photo-store.port";
export * from "./report-settings-store.port";
export * from "./student-directory.port";

import type { Clock } from "./clock.port";
import type { AuthConfigPort } from "./auth-config.port";
import type { EmailSender } from "./email-sender.port";
import type { GoogleOAuthPort } from "./google-oauth.port";
import type { OcrClient } from "./ocr-client.port";
import type { PhotoStore } from "./photo-store.port";
import type { ReportSettingsStore } from "./report-settings-store.port";
import type { StudentDirectory } from "./student-directory.port";

export interface ServicePorts {
  readonly email: EmailSender;
  readonly ocr: OcrClient;
  readonly reportSettings: ReportSettingsStore;
  readonly clock: Clock;
  readonly students: StudentDirectory;
  readonly photos: PhotoStore;
  readonly authConfig: AuthConfigPort;
  readonly google: GoogleOAuthPort;
}
