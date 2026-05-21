import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="page-content">
      <h1>Page not found</h1>
      <p>
        The page you are looking for does not exist.{" "}
        <Link to="/">Go back to the registry</Link>.
      </p>
    </div>
  );
}
