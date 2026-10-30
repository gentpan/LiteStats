type ThemeUpdate = { email: string; theme: string; pending: boolean; failed: boolean }

/** Share an in-flight account preference across page remounts until loaders refresh. */
export function createThemeUpdate(save: (theme: string) => Promise<unknown>, refresh: () => Promise<unknown>) {
  let current: ThemeUpdate | undefined
  const listeners = new Set<() => void>()
  const publish = (value: ThemeUpdate | undefined) => {
    current = value
    listeners.forEach(listener => listener())
  }
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async change(email: string, previous: string, next: string) {
      if (current?.pending) return
      const request: ThemeUpdate = {email, theme: next, pending: true, failed: false}
      publish(request)
      try { await save(next) }
      catch {
        if (current === request) publish({email, theme: previous, pending: false, failed: true})
        return
      }
      try {
        await refresh()
        if (current === request) publish(undefined)
      } catch {
        // The account save succeeded. A loader failure must not undo its choice.
        if (current === request) publish({...request, pending: false})
      }
    },
  }
}
