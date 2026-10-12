"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

interface Props {
  markdown: string;
}

/**
 * Renders Markdown with raw HTML disabled and the output sanitized. Remote images are
 * never loaded (only their alt text is shown) and links open without referrer.
 */
export function MarkdownPreview({ markdown }: Props) {
  return (
    <div className="md-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ alt }) => <span className="italic text-muted-foreground">[image: {alt || "unnamed"}]</span>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
