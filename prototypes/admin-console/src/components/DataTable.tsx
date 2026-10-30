import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Empty } from "./common";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
};

export type Filter<T> = {
  key: string;
  label: string;
  options: { value: string; label: string; test: (row: T) => boolean }[];
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: Filter<T>[];
  onRowClick?: (row: T) => void;
  /** The row as a card on a phone. */
  card: (row: T) => ReactNode;
  /** Shown when rows are selected; selection needs this. */
  bulk?: (ids: string[], clear: () => void) => ReactNode;
  toolbar?: ReactNode;
  defaultSort?: { key: string; desc: boolean };
  pageSize?: number;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  searchPlaceholder,
  filters = [],
  onRowClick,
  card,
  bulk,
  toolbar,
  defaultSort,
  pageSize = 12,
}: Props<T>) {
  const mobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((row) => {
      if (q && searchText && !searchText(row).toLowerCase().includes(q)) return false;
      return filters.every((filter) => {
        const value = active[filter.key];
        if (!value || value === "all") return true;
        return filter.options.find((o) => o.value === value)?.test(row) ?? true;
      });
    });
    const column = columns.find((c) => c.key === sort?.key);
    if (sort && column?.sort) {
      const by = column.sort;
      out = [...out].sort((a, b) => {
        const [x, y] = [by(a), by(b)];
        const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar");
        return sort.desc ? -order : order;
      });
    }
    return out;
  }, [rows, query, active, sort, columns, filters, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pickable = Boolean(bulk) && !mobile;
  const allPicked = visible.length > 0 && visible.every((row) => selected.has(rowKey(row)));
  const filtering = query !== "" || Object.values(active).some((v) => v && v !== "all");

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.desc ? { key, desc: false } : null) : { key, desc: true }));

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchText && (
          <div className="relative min-w-0 grow basis-52 md:max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="table-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder ?? "ابحث"}
              className="h-9 ps-8"
            />
          </div>
        )}
        {filters.map((filter) => (
          <Select
            key={filter.key}
            value={active[filter.key] ?? "all"}
            onValueChange={(value) => {
              setActive((a) => ({ ...a, [filter.key]: value }));
              setPage(0);
            }}
          >
            <SelectTrigger size="sm" className="h-9 w-auto gap-1.5" aria-label={filter.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{filter.label}: الكل</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground"
            onClick={() => {
              setQuery("");
              setActive({});
              setPage(0);
            }}
          >
            <X className="size-3.5" /> مسح
          </Button>
        )}
        {toolbar && <div className="ms-auto flex items-center gap-2">{toolbar}</div>}
      </div>

      {pickable && selected.size > 0 && bulk && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-accent px-3 py-1.5 text-[13px]">
          <span className="font-medium">{num(selected.size)} محدد</span>
          <span className="mx-1 h-4 w-px bg-border" />
          {bulk([...selected], () => setSelected(new Set()))}
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setSelected(new Set())}>
            إلغاء التحديد
          </Button>
        </div>
      )}

      {mobile ? (
        <div className="divide-y rounded-lg border bg-card">
          {visible.length === 0 && <Empty title="لا توجد نتائج" hint="جرّب بحثاً أو فلتراً آخر." />}
          {visible.map((row) => (
            <button
              type="button"
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className="block w-full px-3 py-3 text-start active:bg-accent"
            >
              {card(row)}
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {pickable && (
                  <TableHead className="w-9">
                    <Checkbox
                      aria-label="تحديد الصفحة"
                      checked={allPicked}
                      onCheckedChange={(checked) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          visible.forEach((row) =>
                            checked ? next.add(rowKey(row)) : next.delete(rowKey(row)),
                          );
                          return next;
                        })
                      }
                    />
                  </TableHead>
                )}
                {columns.map((column) => (
                  <TableHead key={column.key} className={cn("h-9 text-xs", column.className)}>
                    {column.sort ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.header}
                        {sort?.key === column.key ? (
                          sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1}>
                    <Empty title="لا توجد نتائج" hint="جرّب بحثاً أو فلتراً آخر." />
                  </TableCell>
                </TableRow>
              )}
              {visible.map((row) => {
                const id = rowKey(row);
                return (
                  <TableRow
                    key={id}
                    data-state={selected.has(id) ? "selected" : undefined}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    onClick={() => onRowClick?.(row)}
                  >
                    {pickable && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label="تحديد الصف"
                          checked={selected.has(id)}
                          onCheckedChange={(checked) =>
                            setSelected((s) => {
                              const next = new Set(s);
                              if (checked) next.add(id);
                              else next.delete(id);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.key} className={cn("py-2 text-[13px]", column.className)}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular">
          {filtered.length === 0
            ? "لا صفوف"
            : `${num(safePage * pageSize + 1)}–${num(Math.min((safePage + 1) * pageSize, filtered.length))} من ${num(filtered.length)}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="الصفحة السابقة"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="tabular px-2">
            {num(safePage + 1)} / {num(pages)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="الصفحة التالية"
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
