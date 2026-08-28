export const sendPersistedUserMessage = async ({
  persist,
  send,
  isActive,
}: {
  persist: () => Promise<void>
  send: () => Promise<void>
  isActive: () => boolean
}) => {
  await persist()
  if (!isActive()) return
  await send()
}
