import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>PDF to Markdown. Convert documents without leaving your browser tab.</p>
        <nav aria-label="Footer" className="flex gap-4">
          <Link className="hover:text-foreground" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="hover:text-foreground" href="/terms">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
