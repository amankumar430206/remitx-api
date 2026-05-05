import { Worker } from 'bullmq';
import { createHmac } from 'crypto';
import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import { publishSseEvent } from '../config/sse.js';
import db from '../config/database.js';
import * as repo from '../modules/notifications/notifications.repository.js';

const connection = { url: config.redisUrl };

// ─── Event config ─────────────────────────────────────────────────────────────

const EVENTS = {
  'payment.approval_required': { channels: ['email', 'inapp'], roles: ['checker'],      title: 'Payment Awaiting Approval' },
  'payment.approved':          { channels: ['email', 'inapp'], roles: ['maker'],         title: 'Payment Approved' },
  'payment.rejected':          { channels: ['email', 'inapp', 'sms'], roles: ['maker'], title: 'Payment Rejected' },
  'payment.completed':         { channels: ['email', 'inapp', 'sms'], roles: ['maker', 'client_admin'], title: 'Payment Completed' },
  'payment.failed':            { channels: ['email', 'inapp', 'sms'], roles: ['maker', 'client_admin'], title: 'Payment Failed' },
  'payment.manual_pending':    { channels: ['email', 'inapp'], roles: ['super_admin'],   title: 'Payment Pending Manual Review' },
  'payment.compliance_flagged':{ channels: ['email', 'inapp'], roles: ['super_admin'],   title: 'Payment Flagged for Compliance' },
  'kyc.submitted':             { channels: ['email', 'inapp'], roles: ['super_admin', 'client_admin'], title: 'New KYC Application' },
  'kyc.approved':              { channels: ['email', 'inapp'], roles: ['self'],           title: 'KYC Approved' },
  'kyc.rejected':              { channels: ['email', 'inapp', 'sms'], roles: ['self'],   title: 'KYC Rejected' },
};

const buildBody = (eventType, payload) => {
  const ref = payload.reference || payload.paymentId || '';
  switch (eventType) {
    case 'payment.approval_required': return `Payment ${ref} requires your approval.`;
    case 'payment.approved':          return `Your payment ${ref} has been approved and is being processed.`;
    case 'payment.rejected':          return `Your payment ${ref} was rejected. ${payload.reason ? `Reason: ${payload.reason}` : ''}`;
    case 'payment.completed':         return `Your payment ${ref} has been completed successfully.`;
    case 'payment.failed':            return `Your payment ${ref} has failed. Please contact support.`;
    case 'payment.manual_pending':    return `Payment ${ref} has been dispatched to the manual processing queue.`;
    case 'payment.compliance_flagged':return `Payment ${ref} has been flagged for compliance review.`;
    case 'kyc.submitted':             return 'A new KYC application has been submitted and requires review.';
    case 'kyc.approved':              return 'Your identity verification has been approved. You can now send payments.';
    case 'kyc.rejected':              return `Your identity verification was rejected. ${payload.reason ? `Reason: ${payload.reason}` : 'Please resubmit your documents.'}`;
    default:                          return eventType;
  }
};

// ─── User resolution ─────────────────────────────────────────────────────────

const resolveTargetUsers = async (roles, payload, tenantId) => {
  const userIds = new Set();

  for (const role of roles) {
    if (role === 'self') {
      if (payload.userId) userIds.add(payload.userId);
    } else if (role === 'maker') {
      if (payload.paymentId) {
        const payment = await db('payments').where({ id: payload.paymentId, tenant_id: tenantId }).first();
        if (payment) userIds.add(payment.user_id);
      }
    } else {
      const users = await db('users').where({ tenant_id: tenantId, role, status: 'active' }).select('id');
      users.forEach((u) => userIds.add(u.id));
    }
  }

  return [...userIds];
};

// ─── Email ────────────────────────────────────────────────────────────────────

let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  if (config.smtpHost) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  } else {
    // Dev fallback: Ethereal test account (emails viewable at ethereal.email)
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    logger.info({ user: testAccount.user }, 'Using Ethereal test email account');
  }

  return transporter;
};

const sendEmail = async (toEmail, subject, text) => {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: config.smtpFrom || '"RemitX" <noreply@remitx.io>',
      to: toEmail,
      subject,
      text,
    });
    if (nodemailer.getTestMessageUrl(info)) {
      logger.info({ url: nodemailer.getTestMessageUrl(info) }, 'Email preview');
    }
  } catch (err) {
    logger.warn({ err: err.message, to: toEmail }, 'Email send failed — skipping');
  }
};

// ─── SMS stub ─────────────────────────────────────────────────────────────────

const sendSms = (phone, body) => {
  if (!phone) return;
  logger.info({ phone, body }, '[SMS stub] would send SMS');
  // Production: Twilio client.messages.create({ to: phone, from: config.twilioFrom, body })
};

// ─── Outbound webhook ─────────────────────────────────────────────────────────

const deliverWebhook = async (tenantId, eventType, payload, notificationId) => {
  const theme = await db('tenant_theme_configs').where({ tenant_id: tenantId }).first();
  if (!theme || !theme.webhook_enabled || !theme.webhook_url) return;

  const body = JSON.stringify({ event: eventType, payload, timestamp: new Date().toISOString() });
  const sig = createHmac('sha256', theme.webhook_secret || '').update(body).digest('hex');

  try {
    const res = await fetch(theme.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RemitX-Signature': `sha256=${sig}`,
        'X-RemitX-Event': eventType,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    logger.info({ tenantId, eventType, status: res.status }, 'Webhook delivered');
  } catch (err) {
    if (notificationId) await repo.incrementAttemptCount(notificationId);
    logger.warn({ tenantId, eventType, err: err.message }, 'Webhook delivery failed');
  }
};

// ─── Core processor ──────────────────────────────────────────────────────────

export const processNotification = async (eventType, payload, tenantId) => {
  const eventCfg = EVENTS[eventType];
  if (!eventCfg) {
    logger.warn({ eventType }, 'Unknown notification event — skipping');
    return;
  }

  const { channels, roles, title } = eventCfg;
  const body = buildBody(eventType, payload);

  // Enrich payload with payment reference if present
  if (payload.paymentId && !payload.reference) {
    const payment = await db('payments').where({ id: payload.paymentId, tenant_id: tenantId }).first();
    if (payment) payload.reference = payment.reference;
  }

  const targetUserIds = await resolveTargetUsers(roles, payload, tenantId);

  for (const userId of targetUserIds) {
    const user = await db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!user) continue;

    let notification = null;

    if (channels.includes('inapp')) {
      notification = await repo.create({
        tenant_id: tenantId,
        user_id: userId,
        type: eventType,
        title,
        body,
        metadata: JSON.stringify(payload),
      });

      // Push via SSE
      await publishSseEvent(`notif:user:${userId}`, {
        type: 'notification.new',
        notification: { id: notification.id, type: eventType, title, body, createdAt: notification.created_at },
      }).catch(() => {});
    }

    if (channels.includes('email') && user.email) {
      await sendEmail(user.email, title, body);
    }

    if (channels.includes('sms')) {
      sendSms(user.phone || null, body);
    }
  }

  // Also publish a tenant-wide SSE event for dashboards
  await publishSseEvent(`notif:tenant:${tenantId}`, {
    type: 'payment.status_changed',
    payload,
    eventType,
  }).catch(() => {});

  // Outbound webhook (fire-and-forget retry handled by BullMQ)
  await deliverWebhook(tenantId, eventType, payload, null);
};

// ─── Worker ───────────────────────────────────────────────────────────────────

const processJob = async (job) => {
  const { name, data } = job;
  const tenantId = data.tenantId;
  if (!tenantId) {
    logger.warn({ jobName: name }, 'Notification job missing tenantId — skipping');
    return;
  }
  await processNotification(name, { ...data }, tenantId);
};

export const notificationWorker = new Worker(
  'notification-queue',
  processJob,
  { connection, autorun: false, attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
);

notificationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, 'Notification job failed');
});
