import { cn } from "@/lib/utils";
import React, { ReactNode, useId, useMemo } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkGfm from 'remark-gfm'
import { CodeBlock } from 'react-code-block';
// import rehypeRaw from 'rehype-raw';
// import rehypeSanitize from 'rehype-sanitize'
interface HeaderRange {
    min_header_level: number | null;
    max_header_level: number | null;
}

const getCodeLanguage = (className?: string) => {
    return /(?:^|\s)language-([^\s]+)/.exec(className ?? "")?.[1]?.toLowerCase();
};

function getMarkdownHeaderRange(markdown: string): HeaderRange {
    if (!markdown) return { min_header_level: null, max_header_level: null };

    const lines = markdown.split(/\r?\n/);
    const levels: number[] = [];
    const headerRegex = /^(#{1,6})\s/;
    const fenceRegex = /^\s*```/;
    let inCodeFence = false;

    lines.forEach((line) => {
        if (fenceRegex.test(line)) {
            inCodeFence = !inCodeFence;
            return;
        }

        if (inCodeFence) return;

        const match = line.match(headerRegex);
        if (match) {
            levels.push(match[1].length);
        }
    });

    if (levels.length === 0) {
        return { min_header_level: null, max_header_level: null };
    }

    return {
        min_header_level: Math.min(...levels),
        max_header_level: Math.max(...levels),
    };
}

const getDynamicHeaderStyles = (max: number | null) => {
    const defaultClass = "text-base";
    const styleSet: Record<string, string> = {
        h1: defaultClass, h2: defaultClass, h3: defaultClass,
        h4: defaultClass, h5: defaultClass, h6: defaultClass,
    };

    if (max === null) return styleSet;

    // 視覺階層：最高級標題最顯眼
    const sizeClasses = ["text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl"];

    for (let i = 1; i <= 6; i++) {
        const diff = max - i;
        if (diff >= 0 && diff < sizeClasses.length) {
            styleSet[`h${i}`] = sizeClasses[diff];
        }
    }

    return styleSet;
};



function MarkdownCodeBlock({ src, className, language }:{src:string, className?:string, language:string}) {
  return (<div className="rounded-sm overflow-hidden border">
    <div className="text-sm px-1 py-0.5 bg-background/70 text-foreground">{language}</div>
    <CodeBlock code={src} language={language}>
      <CodeBlock.Code className={cn("bg-foreground px-2 py-1.5 whitespace-pre-wrap", className)} >
        <CodeBlock.LineContent >
          <CodeBlock.Token />
        </CodeBlock.LineContent>
      </CodeBlock.Code>
    </CodeBlock>
    </div>
  );
}

const DefaultPartStyle = "my-1";

export const Markdown = ({
    children,
    id,
    className,
    components,
    normalizedHeaderLevel, // 新增參數
    fontLevel = 'standard',
    parentHeaderRenderers,
}: {
    children: string;
    id?: string;
    className?: string;
    components?: Partial<Components>;
    normalizedHeaderLevel?: number; // 例如傳入 3
    fontLevel?: 'small' | 'standard' | 'large',
    parentHeaderRenderers?: any,
}) => {
    const generatedId = useId();
    const blockId = id ?? generatedId;

    const headerRange = useMemo(() => getMarkdownHeaderRange(children), [children]);

    const currentMinHeaderLevel = useMemo(() => {
        if (!headerRange.min_header_level) return normalizedHeaderLevel;
        if (!normalizedHeaderLevel) return headerRange.min_header_level;

        return Math.max(
            headerRange.min_header_level,
            Math.min(6, normalizedHeaderLevel)
        );
    }, [headerRange.min_header_level, normalizedHeaderLevel]);

    const initialComponents = useMemo((): Partial<Components> => {
        // 1. 計算平移量 (Offset)
        // 如果沒有指定則為 0；否則 offset = 目標等級 - 現有最小等級
        const offset = (normalizedHeaderLevel && headerRange.min_header_level)
            ? Math.max(0, normalizedHeaderLevel - headerRange.min_header_level)
            : 0;

        // 2. 獲取視覺樣式（以原始 Markdown 等級計算，確保視覺層次不變）
        const styleMaxHeaderLevel = normalizedHeaderLevel
            ? currentMinHeaderLevel ?? headerRange.max_header_level
            : headerRange.max_header_level;
        const headerStyles = getDynamicHeaderStyles(styleMaxHeaderLevel);

        // 3. 建立標籤轉換映射與渲染器
        const headerRenderers = parentHeaderRenderers ?? ([1, 2, 3, 4, 5, 6] as const).reduce((acc, level) => {
            const OriginalTag = `h${level}` as const;

            acc[OriginalTag] = ({ children: nodeChildren }: { children: ReactNode }) => {
                // 計算平移後的實際等級，最大限制為 6
                const targetLevel = Math.min(6, level + offset);
                const TargetTag = `h${targetLevel}` as const;

                // 視覺上仍維持該標題在 Markdown 中的相對重要性 (dstyle)
                const dstyle = headerStyles[TargetTag];

                return React.createElement(TargetTag, {
                    className: cn(dstyle, DefaultPartStyle, "font-bold tracking-tight"),
                    // 為了無障礙，如果標籤被擠壓到同級(例如原h5,h6都變h6)，可選用 aria-level 標註原始層次
                    "aria-level": targetLevel
                }, nodeChildren);
            };
            return acc;
        }, {} as any);

        return {
            ...headerRenderers,
            hr: () => <div className="my-4 w-full h-px bg-foreground/20" />,
            p: ({ children }) => <div className={cn("text-base", DefaultPartStyle)}>{children}</div>,
            ol: ({ children }) => <ol className="list-decimal text-base ml-6 my-2">{children}</ol>,
            ul: ({ children }) => <ul className="list-disc text-base ml-6 my-2">{children}</ul>,
            defs: ({ children }) => <div className={cn("text-base", DefaultPartStyle)}>{children}</div>,
            pre:  ({ children }) => <>{children}</>,
            strong:  ({ children }) => <strong className={cn("text-base font-semibold", DefaultPartStyle)}>{children}</strong>,
            table: ({ children }) => <div className="rounded-sm overflow-hidden border"><table className="rounded-sm bg-background/70 text-foreground/90">{children}</table></div>,
            tr: ({ children }) => <tr className="border-b last:border-b-0">{children}</tr>,
            thead: ({ children }) => <thead className="border-b">{children}</thead>,
            th: ({ children }) => <th className="px-2 py-1.5 border-r last:border-r-0">{children}</th>,
            td: ({ children }) => <td className="px-2 py-1.5 border-r last:border-r-0">{children}</td>,
            code: ({ children, className }) => {
                if (typeof children !=='string') {
                    return <span className={cn("text-base", DefaultPartStyle)}>{children}</span>
                }
                const language = getCodeLanguage(className);
                const markdownLanguages = new Set(["markdown", "md", "mdx"]);
                const textLanguages = new Set(["text", "txt"]);
                const isBlockCode = Boolean(language) || children.includes("\n");
                const codeContent = children.replace(/\n$/, "");

                if (!isBlockCode) {
                    return (
                        <span className={cn("text-base text-orange-600 dark:text-orange-400", className)}>
                            {children}
                        </span>
                    );
                }

                if (language && textLanguages.has(language)) {
                    return (
                        <div className={cn("text-base text-blue-700 dark:text-blue-400 px-2 py-1.5 border bg-background rounded-sm", className)}>
                            {children}
                        </div>
                    );
                }

                if (!language || markdownLanguages.has(language)) {
                    return (
                        <Markdown
                            fontLevel={fontLevel}
                            normalizedHeaderLevel={currentMinHeaderLevel}
                            className={cn("text-base language-markdown w-full whitespace-normal overflow-hidden", DefaultPartStyle)}
                        >
                            {codeContent}
                        </Markdown>
                    );
                }

                return (
                    <MarkdownCodeBlock 
                    className={className} 
                    language={language} 
                    src={codeContent} 
                    
                    />
                );
            },
        };
    }, [currentMinHeaderLevel, fontLevel, headerRange, normalizedHeaderLevel]);

    const fontSizeConfig = {
        "[--text-xs:calc(0.75rem*0.8)] [--text-sm:calc(0.875rem*0.8)] [--text-base:calc(1rem*0.8)] [--text-lg:calc(1.125rem*0.8)] [--text-xl:calc(1.25rem*0.8)] [--text-2xl:calc(1.5rem*0.8)] [--text-3xl:calc(1.875rem*0.8)] [--text-4xl:calc(2.25rem*0.8)] [--text-5xl:calc(3rem*0.8)]": fontLevel === 'small',
        "[--text-xs:calc(0.75rem*1.25)] [--text-sm:calc(0.875rem*1.25)] [--text-base:calc(1rem*1.25)] [--text-lg:calc(1.125rem*1.25)] [--text-xl:calc(1.25rem*1.25)] [--text-2xl:calc(1.5rem*1.25)] [--text-3xl:calc(1.875rem*1.25)] [--text-4xl:calc(2.25rem*1.25)] [--text-5xl:calc(3rem*1.25)]": fontLevel === 'large',
    }
    
    const escapedContent = children.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return (
        <div className={cn("text-base overflow-hidden",className, fontSizeConfig)}>
            <ReactMarkdown
                key={blockId}
                remarkPlugins={[remarkGfm,remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    ...initialComponents,
                    ...components
                }}
            >
                {escapedContent}
            </ReactMarkdown>
        </div>
    );
};
