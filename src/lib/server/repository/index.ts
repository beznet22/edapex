import { BaseRepository } from "./base.repo";
import { AuthRepository } from "./auth.repo";
import { ChatRepository } from "./chat.repo";
import { JobRepository } from "./job.repo";
import { ParentRepository } from "./parent.repo";
import { ResultsRepository } from "./result.repo";
import { StaffRepository } from "./staff.repo";
import { StudentRepository } from "./student.repo";
import { TimelineRepository } from "./timeline.repo";

// Initialize all repositories
export const base = await BaseRepository.build();
export const authRepo = await AuthRepository.build();
export const chat = await ChatRepository.build();
export const jobRepo = await JobRepository.build();
export const parentRepo = await ParentRepository.build();
export const resultRepo = await ResultsRepository.build();
export const staffRepo = await StaffRepository.build();
export const studentRepo = await StudentRepository.build();
export const timelineRepo = await TimelineRepository.build();

// Unified repo object for convenience
export const repo = {
  base,
  auth: authRepo,
  chat,
  job: jobRepo,
  parent: parentRepo,
  result: resultRepo,
  staff: staffRepo,
  student: studentRepo,
  timeline: timelineRepo,
};

export * from "./base.repo";
export * from "./auth.repo";
export * from "./chat.repo";
export * from "./job.repo";
export * from "./parent.repo";
export * from "./result.repo";
export * from "./staff.repo";
export * from "./student.repo";
export * from "./timeline.repo";
