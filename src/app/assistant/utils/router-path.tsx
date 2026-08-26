
import { useLocation } from "react-router";


export const useRouterPath = () => {
    const loc = useLocation();
    let pathname = loc.pathname;
    const base_url = import.meta.env.VITE_APP_BASE_URL;
    if (base_url.length > 1) {
        if (pathname.startsWith(base_url)) {
            pathname = pathname.substring(base_url.length);
        }
        if (!pathname.startsWith('/')) {
            pathname = '/' + pathname;
        }
    }

    return pathname;

}
