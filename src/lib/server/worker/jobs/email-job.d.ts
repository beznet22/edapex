// Type definitions for the email worker
declare module "worker_threads" {
  export interface WorkerData {
    emailData: {
      to: string;
      subject: string;
      html: string;
      smtpConfig: {
        host?: string;
        port?: number;
        secure?: boolean;
        user?: string;
        pass?: string;
        from?: string;
      };
    };
    taskId: string;
  }
}
