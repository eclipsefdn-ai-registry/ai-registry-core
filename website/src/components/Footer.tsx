import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="py-12 bg-background">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="AI Registry"
            className="h-6"
          />
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://www.eclipse.org/legal/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </a>
            <Link
              to="/terms"
              className="hover:text-foreground transition-colors"
            >
              Terms of Use
            </Link>
            <a
              href="https://www.eclipse.org/legal/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Legal
            </a>
            <a
              href="https://www.eclipse.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Eclipse Foundation
            </a>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>
            Copyright &copy; {new Date().getFullYear()}{" "}
            <a
              href="https://www.eclipse.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Eclipse Foundation AISBL
            </a>
            . All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
