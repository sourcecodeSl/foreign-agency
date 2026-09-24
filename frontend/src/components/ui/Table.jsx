import { PageLoader } from './Spinner';
import Pagination, { usePaged } from './Pagination';

/**
 * Generic data table.
 *
 * columns: [{ key, header, className, render?(row) }]
 * rows:    array of objects (must expose a unique `id`)
 *
 * Long lists are read a page at a time, the page size the reader's to choose;
 * `paginate={false}` is for the tables that are read whole.
 */
export default function Table({
  columns,
  rows,
  loading = false,
  empty = 'No records found.',
  paginate = true,
  rowLabel = 'records',
}) {
  const { paged, total, pages, page, pageSize, setPage, setPageSize } = usePaged(rows);
  const shown = paginate ? paged : rows;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={
                    'whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ' +
                    (col.className || '')
                  }
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-surface">
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-5">
                  <PageLoader label="Loading records..." className="py-10" />
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center">
                  <p className="text-sm font-medium text-gray-900">{empty}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Try adjusting your search or filter to find what you are looking for.
                  </p>
                </td>
              </tr>
            )}

            {!loading &&
              shown.map((row) => (
                <tr key={row.id} className="transition hover:bg-gray-50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={'whitespace-nowrap px-5 py-3.5 text-gray-700 ' + (col.className || '')}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {paginate && !loading && (
        <Pagination
          page={page}
          pages={pages}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={setPageSize}
          label={rowLabel}
        />
      )}
    </>
  );
}
