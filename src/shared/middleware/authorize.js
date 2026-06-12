import { AppError } from '../errors/AppError.js';

export const authorize = (permission) => (req, res, next) => {
  const { permissions = [] } = req.user || {};

  // *:* = platform super-admin; bypasses every permission check
  if (permissions.includes('*:*')) return next();

  const [domain] = permission.split(':');
  const hasWildcard = permissions.includes(`${domain}:*`);
  const hasDirect = permissions.includes(permission);

  if (!hasWildcard && !hasDirect) {
    throw new AppError('FORBIDDEN', `Missing permission: ${permission}`, 403);
  }

  next();
};
