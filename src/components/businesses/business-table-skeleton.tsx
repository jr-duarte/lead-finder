import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"

/** Row-shaped skeletons so the table does not jump when data arrives. */
export function BusinessTableSkeleton({
  rows = 8,
  columns = 12,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columns }).map((__, cellIndex) => (
            <TableCell key={cellIndex}>
              <Skeleton className="h-4 w-full max-w-28" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
