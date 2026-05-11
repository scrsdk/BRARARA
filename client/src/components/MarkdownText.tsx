import ReactMarkdown from 'react-markdown';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export function MarkdownText({ content, className = '' }: MarkdownTextProps) {
  return (
    <ReactMarkdown
      className={`markdown-content ${className}`}
      components={{
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-slate-700/50 px-1 py-0.5 font-mono text-sm">
                {children}
              </code>
            );
          }
          return (
            <code className={`${className} block rounded bg-slate-800 p-2 font-mono text-sm`}>
              {children}
            </code>
          );
        },
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="ml-4 list-disc space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="ml-4 list-decimal space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-[15px] leading-relaxed">{children}</li>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-slate-500 pl-3 italic text-slate-400">
            {children}
          </blockquote>
        ),
        p: ({ children }) => (
          <p className="text-[15px] leading-relaxed">{children}</p>
        ),
        h1: ({ children }) => (
          <h1 className="text-xl font-bold">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-bold">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold">{children}</h3>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}