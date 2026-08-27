import { useCallback, useRef, useState } from "react"

export type WebMcpNavigationSnapshot<T extends string> = {
  page: T
  canGoBack: boolean
  canGoForward: boolean
}

export const useWebMcpNavigation = <T extends string>(initialPage: T) => {
  const historyRef = useRef<T[]>([initialPage])
  const indexRef = useRef(0)
  const pageRef = useRef(initialPage)
  const [navigation, setNavigation] = useState<
    WebMcpNavigationSnapshot<T>
  >({ page: initialPage, canGoBack: false, canGoForward: false })

  const snapshot = useCallback((): WebMcpNavigationSnapshot<T> => ({
    page: pageRef.current,
    canGoBack: indexRef.current > 0,
    canGoForward: indexRef.current < historyRef.current.length - 1,
  }), [])

  const commit = useCallback((nextPage: T) => {
    const currentPage = pageRef.current
    if (currentPage === nextPage) return

    const nextHistory = historyRef.current.slice(0, indexRef.current + 1)
    nextHistory.push(nextPage)
    historyRef.current = nextHistory
    indexRef.current = nextHistory.length - 1
    pageRef.current = nextPage
    setNavigation(snapshot())
  }, [snapshot])

  const move = useCallback((offset: -1 | 1) => {
    const nextIndex = indexRef.current + offset
    if (nextIndex < 0 || nextIndex >= historyRef.current.length) return false

    indexRef.current = nextIndex
    pageRef.current = historyRef.current[nextIndex]
    setNavigation(snapshot())
    return true
  }, [snapshot])

  return {
    view: navigation.page,
    setView: commit,
    goBack: () => move(-1),
    goForward: () => move(1),
    getNavigationState: snapshot,
    navigation,
  }
}
