import type { ReactNode } from "react";

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{children}</code>
  );
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="bg-[#1e293b] text-[#e2e8f0] p-3 rounded-lg overflow-x-auto text-sm leading-relaxed mb-3">
      {children}
    </pre>
  );
}

export interface Field {
  name: string;
  type: string;
  description: string;
}

/**
 * Field reference for one response object. Every field the registry emits is
 * listed, including ones a client ignores — an example that omits awkward
 * fields produces clients that break on the real feed.
 */
export function FieldTable({
  caption,
  fields,
}: {
  caption: string;
  fields: Field[];
}) {
  return (
    <div className="mb-6">
      <h3 className="font-semibold text-sm mt-5 mb-2">
        <InlineCode>{caption}</InlineCode>
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 pr-3 border-b-2 border-border font-semibold">
              Field
            </th>
            <th className="text-left py-2 pr-3 border-b-2 border-border font-semibold">
              Type
            </th>
            <th className="text-left py-2 border-b-2 border-border font-semibold">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name} className="border-b border-border align-top">
              <td className="py-2 pr-3 whitespace-nowrap">
                <InlineCode>{field.name}</InlineCode>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground text-xs">
                {field.type}
              </td>
              <td className="py-2">{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
