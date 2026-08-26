import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ui/theme-provider";
import { MoonStarIcon, SunIcon, SunMoonIcon } from "lucide-react";

export const AssistantThreadThemeMenu = () => {
    const { theme, setTheme } = useTheme();
    return (<>
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant='ghost' className="gap-2">
                {theme === 'dark' && <><MoonStarIcon /></>}
                {theme === 'light' && <><SunIcon /></>}
                {theme === 'system' && <><SunMoonIcon /></>}
            </Button>} />
            <DropdownMenuContent className="w-40" align="end">
                <DropdownMenuItem onClick={() => setTheme('light')} aria-label="Select light theme">
                    <SunIcon /><span>Light Theme</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')} aria-label="Select dark theme">
                    <MoonStarIcon /><span>Dark Theme</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')} aria-label="Select system theme">
                    <SunMoonIcon /><span>System Theme</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    </>);
};
