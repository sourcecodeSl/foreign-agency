import { useEffect, useMemo, useState } from 'react';

/** How many rows a table may show at a time. */
export const PAGE_SIZES = [10, 25, 50, 100];

/**
 * One page of rows, with the page and the page size the reader chose.
 *
 * The page comes back to the first whenever the rows change underneath - a
 * filter or a search leaves fewer rows than the page being read.
 */
export function usePaged(rows, initialSize = PAGE_SIZES[0]) {
  const [pageSize, setPageSize] = useState(initialSize);
  const [page, setPage] = useState(1);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(rows.length / pageSize))));
  }, [rows.length, pageSize]);

  const paged = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);

  return {
    paged,
    total,
    pages,
    page,
    pageSize,
    setPage,
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

/**
 * The bar under a table: how many rows to a page, which rows are on screen,
 * and the way to the next page. It is left out while everything fits on one
 * page and the smallest page size would still hold it.
 */
export default function Pagination({ page, pages, pageSize, total, onPage, onPageSize, label = 'rows' }) {
  if (total <= PAGE_SIZES[0]) return null;

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-3">
      <div className="flex items-center gap-2">
        <label htmlFor="pageSize" className="text-xs text-gray-500">
          Rows per page
        </label>
        <select
          id="pageSize"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-700 focus:border-primary-500 focus:outline-none"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-xs text-gray-500">
          {first}-{last} of {total} {label}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            Previous
          </button>
          <span className="px-2 text-xs text-gray-500">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
