export const parsePagination = (query, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit || '20', 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasMore: page * limit < total,
});

export const paginate = async (queryBuilder, { page = 1, limit = 20, maxLimit = 100 } = {}) => {
  const safeLimit = Math.min(parseInt(limit), maxLimit);
  const safePage = Math.max(parseInt(page), 1);
  const offset = (safePage - 1) * safeLimit;

  const [{ count }] = await queryBuilder.clone().count('* as count');
  const data = await queryBuilder.limit(safeLimit).offset(offset);

  return {
    data,
    meta: {
      page: safePage,
      limit: safeLimit,
      total: parseInt(count, 10),
      totalPages: Math.ceil(parseInt(count, 10) / safeLimit),
      hasMore: offset + data.length < parseInt(count, 10),
    },
  };
};
