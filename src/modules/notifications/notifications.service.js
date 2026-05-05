import { AppError } from '../../shared/errors/AppError.js';
import * as repo from './notifications.repository.js';

export const listNotifications = async (userId, tenantId, { page = 1, limit = 20, unread } = {}) => {
  const unreadOnly = unread === 'true' || unread === true;
  const { data, total } = await repo.list({ tenantId, userId, unreadOnly, page, limit });
  const unreadCount = await repo.countUnread(userId, tenantId);
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), unreadCount },
  };
};

export const markOneRead = async (id, userId, tenantId) => {
  const notification = await repo.findById(id, userId, tenantId);
  if (!notification) throw new AppError('NOT_FOUND', 'Notification not found', 404);
  const updated = await repo.markRead(id, userId, tenantId);
  return updated || notification; // already read — return as-is
};

export const markAllRead = async (userId, tenantId) => {
  await repo.markAllRead(userId, tenantId);
  return { marked: true };
};
