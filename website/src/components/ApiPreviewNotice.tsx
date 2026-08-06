import { Link } from "react-router-dom";
import { InfoCallout } from "./InfoCallout";

/**
 * Shared "API preview" copy shown on both the About and API-docs pages.
 * `linkToApiDocs` adds a pointer to /api-docs — omit it on the API-docs page
 * itself to avoid a self-referential link.
 */
export function ApiPreviewNotice({
  linkToApiDocs = false,
}: {
  linkToApiDocs?: boolean;
}) {
  return (
    <InfoCallout>
      <strong>API preview:</strong> The public catalogue is available for use.
      The API and metadata schema are still evolving and may change.
      {linkToApiDocs && (
        <>
          {" "}
          See the{" "}
          <Link to="/api-docs" className="text-primary hover:underline">
            API documentation
          </Link>{" "}
          for current details.
        </>
      )}
    </InfoCallout>
  );
}
