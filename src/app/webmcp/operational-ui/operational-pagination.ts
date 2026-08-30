import { useCallback, useState } from "react"

export function useOperationalPagination(initialPage = 1) {
  const [page, setPage] = useState(initialPage)
  const resetPage = useCallback(() => setPage(1), [])
  const applyAndReset = useCallback(
    (apply: () => void) => {
      apply()
      resetPage()
    },
    [resetPage]
  )

  return { page, setPage, resetPage, applyAndReset }
}
