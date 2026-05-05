import db from '../../config/database.js';
import redis from '../../config/redis.js';

// Returns [userId, ...all descendant user IDs] via parent_user_id recursive CTE
export const getSubtreeUserIds = async (userId, tenantId) => {
  const cacheKey = `subtree:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const rows = await db.raw(
    `WITH RECURSIVE tree AS (
       SELECT id FROM users WHERE id = ? AND tenant_id = ?
       UNION ALL
       SELECT u.id FROM users u INNER JOIN tree t ON u.parent_user_id = t.id
     )
     SELECT id FROM tree`,
    [userId, tenantId],
  );

  const ids = rows.rows.map((r) => r.id);
  await redis.setex(cacheKey, 300, JSON.stringify(ids));
  return ids;
};

export const invalidateSubtreeCache = async (userId) => {
  await redis.del(`subtree:${userId}`);
};
