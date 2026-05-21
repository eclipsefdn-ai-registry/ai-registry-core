import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-links">
          <a
            href="https://github.com/eclipsefdn-ai-registry/ai-registry-core"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <Link to="/terms">Terms of Use</Link>
          <a
            href="https://www.eclipse.org/legal/privacy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
          <Link to="/about">About</Link>
        </div>
        <div className="site-footer-copyright">
          &copy; {new Date().getFullYear()} Eclipse Foundation AISBL
        </div>
      </div>
    </footer>
  );
}
