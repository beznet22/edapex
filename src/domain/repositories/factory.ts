import { SqliteAiRepository } from "./sqlite/ai.repository.js";
import { SqliteFinanceRepository } from "./sqlite/finance.repository.js";
import { SqliteAcademicRepository } from "./sqlite/academic.repository.js";
import { SqliteAssessmentRepository } from "./sqlite/assessment.repository.js";
import { SqliteAttendanceRepository } from "./sqlite/attendance.repository.js";
import { SqliteClassroomRepository } from "./sqlite/classroom.repository.js";
import { SqliteCmsRepository } from "./sqlite/cms.repository.js";
import { SqliteCommunicationRepository } from "./sqlite/communication.repository.js";
import { SqliteCoreRepository } from "./sqlite/core.repository.js";
import { SqliteDocumentsRepository } from "./sqlite/documents.repository.js";
import { SqliteEventsRepository } from "./sqlite/events.repository.js";
import { SqliteFacilitiesRepository } from "./sqlite/facilities.repository.js";
import { SqliteHomeschoolRepository } from "./sqlite/homeschool.repository.js";
import { SqliteHrRepository } from "./sqlite/hr.repository.js";
import { SqliteLibraryRepository } from "./sqlite/library.repository.js";
import { SqliteLmsRepository } from "./sqlite/lms.repository.js";
import { SqlitePbacRepository } from "./sqlite/pbac.repository.js";
import { SqliteSettingsRepository } from "./sqlite/settings.repository.js";

import { D1AiRepository } from "./d1/ai.repository.js";
import { D1FinanceRepository } from "./d1/finance.repository.js";
import { D1ClassroomRepository } from "./d1/classroom.repository.js";

import { MySqlAiRepository } from "./mysql/ai.repository.js";
import { MySqlFinanceRepository } from "./mysql/finance.repository.js";
import { MySqlAcademicRepository } from "./mysql/academic.repository.js";
import { MySqlAssessmentRepository } from "./mysql/assessment.repository.js";
import { MySqlAttendanceRepository } from "./mysql/attendance.repository.js";
import { MySqlClassroomRepository } from "./mysql/classroom.repository.js";
import { MySqlCmsRepository } from "./mysql/cms.repository.js";
import { MySqlCommunicationRepository } from "./mysql/communication.repository.js";
import { MySqlCoreRepository } from "./mysql/core.repository.js";
import { MySqlDocumentsRepository } from "./mysql/documents.repository.js";
import { MySqlEventsRepository } from "./mysql/events.repository.js";
import { MySqlFacilitiesRepository } from "./mysql/facilities.repository.js";
import { MySqlHomeschoolRepository } from "./mysql/homeschool.repository.js";
import { MySqlHrRepository } from "./mysql/hr.repository.js";
import { MySqlLibraryRepository } from "./mysql/library.repository.js";
import { MySqlLmsRepository } from "./mysql/lms.repository.js";
import { MySqlPbacRepository } from "./mysql/pbac.repository.js";
import { MySqlSettingsRepository } from "./mysql/settings.repository.js";

import { PostgresAiRepository } from "./postgres/ai.repository.js";
import { PostgresFinanceRepository } from "./postgres/finance.repository.js";
import { PostgresAcademicRepository } from "./postgres/academic.repository.js";
import { PostgresAssessmentRepository } from "./postgres/assessment.repository.js";
import { PostgresAttendanceRepository } from "./postgres/attendance.repository.js";
import { PostgresClassroomRepository } from "./postgres/classroom.repository.js";
import { PostgresCmsRepository } from "./postgres/cms.repository.js";
import { PostgresCommunicationRepository } from "./postgres/communication.repository.js";
import { PostgresCoreRepository } from "./postgres/core.repository.js";
import { PostgresDocumentsRepository } from "./postgres/documents.repository.js";
import { PostgresEventsRepository } from "./postgres/events.repository.js";
import { PostgresFacilitiesRepository } from "./postgres/facilities.repository.js";
import { PostgresHomeschoolRepository } from "./postgres/homeschool.repository.js";
import { PostgresHrRepository } from "./postgres/hr.repository.js";
import { PostgresLibraryRepository } from "./postgres/library.repository.js";
import { PostgresLmsRepository } from "./postgres/lms.repository.js";
import { PostgresPbacRepository } from "./postgres/pbac.repository.js";
import { PostgresSettingsRepository } from "./postgres/settings.repository.js";

import type { IAiRepository } from "../interfaces/ai.interface.js";
import type { IFinanceEventRepository } from "../interfaces/finance.interface.js";
import type { IAcademicRepository } from "../interfaces/academic.interface.js";
import type { IAssessmentRepository } from "../interfaces/assessment.interface.js";
import type { IAttendanceRepository } from "../interfaces/attendance.interface.js";
import type { IClassroomRepository } from "../interfaces/classroom.interface.js";
import type { ICmsRepository } from "../interfaces/cms.interface.js";
import type { ICommunicationRepository } from "../interfaces/communication.interface.js";
import type { ICoreRepository } from "../interfaces/core.interface.js";
import type { IDocumentsRepository } from "../interfaces/documents.interface.js";
import type { IEventsRepository } from "../interfaces/events.interface.js";
import type { IFacilitiesRepository } from "../interfaces/facilities.interface.js";
import type { IHomeschoolRepository } from "../interfaces/homeschool.interface.js";
import type { IHrRepository } from "../interfaces/hr.interface.js";
import type { ILibraryRepository } from "../interfaces/library.interface.js";
import type { ILmsRepository } from "../interfaces/lms.interface.js";
import type { IPbacRepository } from "../interfaces/pbac.interface.js";
import type { ISettingsRepository } from "../interfaces/settings.interface.js";

export class RepositoryFactory {
  static getAiRepository(dialect: string): IAiRepository {
    switch (dialect) {
      case "sqlite": return new SqliteAiRepository();
      case "d1": return new D1AiRepository();
      case "mysql": return new MySqlAiRepository();
      case "postgres": return new PostgresAiRepository();
      default: throw new Error(`Unsupported dialect for AI: ${dialect}`);
    }
  }

  static getFinanceEventRepository(dialect: string): IFinanceEventRepository {
    switch (dialect) {
      case "sqlite": return new SqliteFinanceRepository();
      case "d1": return new D1FinanceRepository();
      case "mysql": return new MySqlFinanceRepository();
      case "postgres": return new PostgresFinanceRepository();
      default: throw new Error(`Unsupported dialect for Finance: ${dialect}`);
    }
  }

  static getAcademicRepository(dialect: string): IAcademicRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteAcademicRepository();
      case "mysql": return new MySqlAcademicRepository();
      case "postgres": return new PostgresAcademicRepository();
      default: throw new Error(`Unsupported dialect for Academic: ${dialect}`);
    }
  }

  static getAssessmentRepository(dialect: string): IAssessmentRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteAssessmentRepository();
      case "mysql": return new MySqlAssessmentRepository();
      case "postgres": return new PostgresAssessmentRepository();
      default: throw new Error(`Unsupported dialect for Assessment: ${dialect}`);
    }
  }

  static getAttendanceRepository(dialect: string): IAttendanceRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteAttendanceRepository();
      case "mysql": return new MySqlAttendanceRepository();
      case "postgres": return new PostgresAttendanceRepository();
      default: throw new Error(`Unsupported dialect for Attendance: ${dialect}`);
    }
  }

  static getClassroomRepository(dialect: string): IClassroomRepository {
    switch (dialect) {
      case "sqlite": return new SqliteClassroomRepository();
      case "d1": return new D1ClassroomRepository();
      case "mysql": return new MySqlClassroomRepository();
      case "postgres": return new PostgresClassroomRepository();
      default: throw new Error(`Unsupported dialect for Classroom: ${dialect}`);
    }
  }

  static getCmsRepository(dialect: string): ICmsRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteCmsRepository();
      case "mysql": return new MySqlCmsRepository();
      case "postgres": return new PostgresCmsRepository();
      default: throw new Error(`Unsupported dialect for CMS: ${dialect}`);
    }
  }

  static getCommunicationRepository(dialect: string): ICommunicationRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteCommunicationRepository();
      case "mysql": return new MySqlCommunicationRepository();
      case "postgres": return new PostgresCommunicationRepository();
      default: throw new Error(`Unsupported dialect for Communication: ${dialect}`);
    }
  }

  static getCoreRepository(dialect: string): ICoreRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteCoreRepository();
      case "mysql": return new MySqlCoreRepository();
      case "postgres": return new PostgresCoreRepository();
      default: throw new Error(`Unsupported dialect for Core: ${dialect}`);
    }
  }

  static getDocumentsRepository(dialect: string): IDocumentsRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteDocumentsRepository();
      case "mysql": return new MySqlDocumentsRepository();
      case "postgres": return new PostgresDocumentsRepository();
      default: throw new Error(`Unsupported dialect for Documents: ${dialect}`);
    }
  }

  static getEventRepository(dialect: string): IEventsRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteEventsRepository();
      case "mysql": return new MySqlEventsRepository();
      case "postgres": return new PostgresEventsRepository();
      default: throw new Error(`Unsupported dialect for Events: ${dialect}`);
    }
  }

  static getFacilitiesRepository(dialect: string): IFacilitiesRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteFacilitiesRepository();
      case "mysql": return new MySqlFacilitiesRepository();
      case "postgres": return new PostgresFacilitiesRepository();
      default: throw new Error(`Unsupported dialect for Facilities: ${dialect}`);
    }
  }

  static getHomeschoolRepository(dialect: string): IHomeschoolRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteHomeschoolRepository();
      case "mysql": return new MySqlHomeschoolRepository();
      case "postgres": return new PostgresHomeschoolRepository();
      default: throw new Error(`Unsupported dialect for Homeschool: ${dialect}`);
    }
  }

  static getHrRepository(dialect: string): IHrRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteHrRepository();
      case "mysql": return new MySqlHrRepository();
      case "postgres": return new PostgresHrRepository();
      default: throw new Error(`Unsupported dialect for HR: ${dialect}`);
    }
  }

  static getLibraryRepository(dialect: string): ILibraryRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteLibraryRepository();
      case "mysql": return new MySqlLibraryRepository();
      case "postgres": return new PostgresLibraryRepository();
      default: throw new Error(`Unsupported dialect for Library: ${dialect}`);
    }
  }

  static getLmsRepository(dialect: string): ILmsRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteLmsRepository();
      case "mysql": return new MySqlLmsRepository();
      case "postgres": return new PostgresLmsRepository();
      default: throw new Error(`Unsupported dialect for LMS: ${dialect}`);
    }
  }

  static getPbacRepository(dialect: string): IPbacRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqlitePbacRepository();
      case "mysql": return new MySqlPbacRepository();
      case "postgres": return new PostgresPbacRepository();
      default: throw new Error(`Unsupported dialect for PBAC: ${dialect}`);
    }
  }

  static getSettingsRepository(dialect: string): ISettingsRepository {
    switch (dialect) {
      case "sqlite": case "d1": return new SqliteSettingsRepository();
      case "mysql": return new MySqlSettingsRepository();
      case "postgres": return new PostgresSettingsRepository();
      default: throw new Error(`Unsupported dialect for Settings: ${dialect}`);
    }
  }
}

