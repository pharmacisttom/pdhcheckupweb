"use client";
import { ResponsiveTable } from "./responsive-table";
import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { EmptyState } from "./ui";
export function DataTable<T>({
  data,
  columns,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });
  return (
    <>
      <input
        aria-label="ค้นหาในตาราง"
        placeholder="ค้นหาในตาราง…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ maxWidth: 300, marginBottom: 15 }}
      />
      {data.length ? (
        <>
          <label className="mobile-table-sort">
            เรียงข้อมูล
            <select
              value={
                sorting.length
                  ? sorting[0].id + ":" + (sorting[0].desc ? "desc" : "asc")
                  : ""
              }
              onChange={(event) => {
                const [id, direction] = event.target.value.split(":");
                setSorting(id ? [{ id, desc: direction === "desc" }] : []);
              }}
            >
              <option value="">ลำดับเริ่มต้น</option>
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanSort())
                .flatMap((column) =>
                  ["asc", "desc"].map((direction) => (
                    <option
                      key={column.id + direction}
                      value={column.id + ":" + direction}
                    >
                      {typeof column.columnDef.header === "string"
                        ? column.columnDef.header
                        : column.id}{" "}
                      · {direction === "asc" ? "น้อยไปมาก" : "มากไปน้อย"}
                    </option>
                  )),
                )}
            </select>
          </label>
          <div className="table-wrap">
            <ResponsiveTable>
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "none"
                        }
                      >
                        <button
                          type="button"
                          className="button ghost small"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}{" "}
                          {header.column.getIsSorted() === "asc"
                            ? "↑"
                            : header.column.getIsSorted() === "desc"
                              ? "↓"
                              : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        data-label={
                          typeof cell.column.columnDef.header === "string"
                            ? cell.column.columnDef.header
                            : cell.column.id
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
          <div className="form-actions">
            <button
              className="button secondary small"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              ก่อนหน้า
            </button>
            <span className="muted">
              หน้า {table.getState().pagination.pageIndex + 1} /{" "}
              {Math.max(1, table.getPageCount())}
            </span>
            <button
              className="button secondary small"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              ถัดไป
            </button>
          </div>
        </>
      ) : (
        <EmptyState>ยังไม่มีข้อมูล</EmptyState>
      )}
    </>
  );
}
