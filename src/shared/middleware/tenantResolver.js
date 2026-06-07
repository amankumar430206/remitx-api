import db from '../../config/database.js';
import { AppError } from '../errors/AppError.js';

export const tenantResolver = async (req, res, next) => {
  const host = req.hostname || '';
  let slug = req.headers['x-tenant-slug'] || host.split('.')[0];

  if (!slug || slug === 'localhost' || slug.startsWith('127') || slug === 'remitx-api') {
    slug = 'remitx';
  }

  const tenant = await db('tenants').where({ slug }).first();

  if (!tenant) {
    throw new AppError('TENANT_NOT_FOUND', 'Workspace not found', 404);
  }
  if (tenant.status !== 'active') {
    throw new AppError('TENANT_INACTIVE', 'Tenant is not active', 403);
  }

  req.tenantId = tenant.id;
  req.tenant = tenant;
  next();
};
