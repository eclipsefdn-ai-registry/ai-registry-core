import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Page not found</h1>
      <p className="leading-relaxed">
        The page you are looking for does not exist.{" "}
        <Link to="/" className="text-primary hover:underline">
          Go back to the registry
        </Link>
        .
      </p>
    </div>
  );
}
