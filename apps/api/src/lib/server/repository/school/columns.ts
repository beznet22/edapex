import { smGeneralSettings } from "../../db/schema";
import type { CachedGeneralSetting } from "../base/repository-context";

/** One projection shared by the settings repository and the config loader. */
export const generalSettingColumns = {
  id: smGeneralSettings.id,
  schoolId: smGeneralSettings.schoolId,
  academicId: smGeneralSettings.academicId,
  sessionId: smGeneralSettings.sessionId,
  languageId: smGeneralSettings.languageId,
  dateFormatId: smGeneralSettings.dateFormatId,
  schoolName: smGeneralSettings.schoolName,
  phone: smGeneralSettings.phone,
  email: smGeneralSettings.email,
  address: smGeneralSettings.address,
  logo: smGeneralSettings.logo,
  identity: smGeneralSettings.identity
} as const;

/** The active 12-column surface; `extras` is never projected in a hot query. */
export type GeneralSetting = CachedGeneralSetting;
