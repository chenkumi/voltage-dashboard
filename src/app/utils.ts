const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

export function getSystemTheme(): 'dark' | 'light' {
    if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
        return "dark"
    }

    return "light"
}