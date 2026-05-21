import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-logo">
          AI Registry
        </Link>
        <nav className="site-nav">
          <Link to="/about">About</Link>
          <Link to="/api-docs">API</Link>
          <a
            href="https://github.com/eclipsefdn-ai-registry/ai-registry-core"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
