export const resolveAssistantSiteUrl = (
  selectedSiteUrl: string | null,
  mostRecentlyActiveUrl: string | undefined,
  defaultSiteUrl: string
) => selectedSiteUrl ?? mostRecentlyActiveUrl ?? defaultSiteUrl

export const shouldCreateAssistantThread = ({
  activeSiteUrl,
  isCreating,
  latestProfileLoaded,
  latestProfileUrl,
  hasThread,
}: {
  activeSiteUrl: string
  isCreating: boolean
  latestProfileLoaded: boolean
  latestProfileUrl: string | undefined
  hasThread: boolean
}) => {
  if (!latestProfileLoaded || hasThread || isCreating) return false
  return !latestProfileUrl || latestProfileUrl === activeSiteUrl
}

export const shouldReportAssistantLifecycleError = (
  requestId: number,
  currentRequestId: number
) => requestId === currentRequestId
