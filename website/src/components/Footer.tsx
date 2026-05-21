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
          <Link to="/about">About</Link>
          <Link to="/terms">Terms of Use</Link>
          <a
            href="https://www.eclipse.org/legal/privacy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
          <a
            href="https://www.eclipse.org/legal/compliance/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Compliance
          </a>
          <a
            href="https://www.eclipse.org/legal/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Legal
          </a>
        </div>
        <div className="site-footer-copyright">
          Copyright &copy;{" "}
          <a
            href="https://www.eclipse.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Eclipse Foundation AISBL
          </a>
          . All Rights Reserved.
        </div>
      </div>
    </footer>
  );
}
