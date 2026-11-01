import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let customTransporter: Transporter | null = null;

export function setMailTransporter(transporter: Transporter | null) {
  customTransporter = transporter;
}

export function getMailTransporter(): Transporter {
  if (customTransporter) {
    return customTransporter;
  }

  if (env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
      connectionTimeout: 10000,
    });
  }

  // Fallback: in-memory stream transport for dev / testing when SMTP is not configured
  return nodemailer.createTransport({
    jsonTransport: true,
  });
}

export interface DownEmailParams {
  monitorName: string;
  monitorUrl: string;
  failureReason?: string;
  startedAt: string;
}

export interface RecoveredEmailParams {
  monitorName: string;
  monitorUrl: string;
  startedAt: string;
  resolvedAt: string;
  durationSeconds?: number;
}

export function formatDurationText(totalSeconds: number): string {
  if (totalSeconds < 1) return '< 1 second';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

export function renderDownEmail(params: DownEmailParams): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `[DOWN ALERT] ${params.monitorName} is down`;
  const formattedDate = new Date(params.startedAt).toUTCString();
  const reason = params.failureReason || 'Failed health check';

  const text = `
ALERT: Service Outage Detected

Monitor: ${params.monitorName}
Target URL: ${params.monitorUrl}
Status: DOWN
Failure Reason: ${reason}
Started At: ${formattedDate}

Please inspect your application or server immediately.
--
UptimeHub Monitoring System
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .header { background: #dc2626; color: #ffffff; padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .content { padding: 24px; color: #374151; font-size: 14px; line-height: 1.5; }
    .table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
    .label { font-weight: 600; color: #4b5563; width: 140px; }
    .val { font-family: monospace; color: #111827; }
    .footer { padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Service Outage Detected</h1>
    </div>
    <div class="content">
      <p>Your monitor <strong>${params.monitorName}</strong> has failed health checks and is currently <strong>DOWN</strong>.</p>
      <table class="table">
        <tr><td class="label">Monitor:</td><td class="val">${params.monitorName}</td></tr>
        <tr><td class="label">URL:</td><td class="val"><a href="${params.monitorUrl}">${params.monitorUrl}</a></td></tr>
        <tr><td class="label">Failure Reason:</td><td class="val" style="color: #dc2626;">${reason}</td></tr>
        <tr><td class="label">Started At:</td><td class="val">${formattedDate}</td></tr>
      </table>
      <p>Please check your application or server infrastructure.</p>
    </div>
    <div class="footer">
      Sent by UptimeHub &bull; Automated Alert Notification
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
}

export function renderRecoveredEmail(params: RecoveredEmailParams): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `[RECOVERED] ${params.monitorName} is back UP`;
  const startDate = new Date(params.startedAt).toUTCString();
  const resolvedDate = new Date(params.resolvedAt).toUTCString();
  const durationSecs =
    params.durationSeconds ??
    Math.max(0, Math.floor((new Date(params.resolvedAt).getTime() - new Date(params.startedAt).getTime()) / 1000));
  const durationFormatted = formatDurationText(durationSecs);

  const text = `
RECOVERY: Service Restored

Monitor: ${params.monitorName}
Target URL: ${params.monitorUrl}
Status: UP (Recovered)
Outage Duration: ${durationFormatted}
Started At: ${startDate}
Resolved At: ${resolvedDate}

All consecutive recovery health checks have succeeded.
--
UptimeHub Monitoring System
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .header { background: #16a34a; color: #ffffff; padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .content { padding: 24px; color: #374151; font-size: 14px; line-height: 1.5; }
    .table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
    .label { font-weight: 600; color: #4b5563; width: 140px; }
    .val { font-family: monospace; color: #111827; }
    .footer { padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Service Restored</h1>
    </div>
    <div class="content">
      <p>Good news! Your monitor <strong>${params.monitorName}</strong> has recovered and is now <strong>UP</strong>.</p>
      <table class="table">
        <tr><td class="label">Monitor:</td><td class="val">${params.monitorName}</td></tr>
        <tr><td class="label">URL:</td><td class="val"><a href="${params.monitorUrl}">${params.monitorUrl}</a></td></tr>
        <tr><td class="label">Outage Duration:</td><td class="val" style="color: #16a34a; font-weight: 600;">${durationFormatted}</td></tr>
        <tr><td class="label">Started At:</td><td class="val">${startDate}</td></tr>
        <tr><td class="label">Resolved At:</td><td class="val">${resolvedDate}</td></tr>
      </table>
    </div>
    <div class="footer">
      Sent by UptimeHub &bull; Automated Alert Notification
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const transporter = getMailTransporter();

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  logger.info({ to: options.to, subject: options.subject }, 'Alert email dispatched successfully');
}
