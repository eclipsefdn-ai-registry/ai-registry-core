import { useState, useEffect } from "react";
import type { RegistryData } from "../types";

interface RegistryDataResult {
  data: RegistryData | undefined;
  error: string | undefined;
  loading: boolean;
}

export function useAllRegistryData(): RegistryDataResult {
  const [data, setData] = useState<RegistryData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "api/v1/all.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: RegistryData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  return { data, error, loading };
}

interface ScopedRegistryDataResult extends RegistryDataResult {
  notFound: boolean;
}

interface OrgsData {
  organizations: RegistryData["organizations"];
  tools: RegistryData["tools"];
}

// Shape of both tools/<tool-id>.json and orgs/<org-id>.json — the per-org
// file carries full, unstripped install configs (see buildOrgEntryView), but
// otherwise matches the per-tool file's shape, so one type serves both.
interface ScopedData {
  mcp: RegistryData["mcp"];
  skills: RegistryData["skills"];
  plugins: RegistryData["plugins"];
  agents: RegistryData["agents"];
}

// Shared by useToolRegistryData and useOrgRegistryData: both fetch one
// "scope" file (tools/<id>.json or orgs/<id>.json) alongside
// organizations.json, and merge them into a RegistryData the same way.
function useScopedRegistryData(
  dir: string,
  id: string,
): ScopedRegistryDataResult {
  const [data, setData] = useState<RegistryData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.BASE_URL + "api/v1/";

    Promise.all([
      fetch(`${base}${dir}/${encodeURIComponent(id)}.json`),
      fetch(base + "organizations.json"),
    ])
      .then(async ([scopedRes, orgsRes]) => {
        if (scopedRes.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!scopedRes.ok) throw new Error(`HTTP ${scopedRes.status}`);
        if (!orgsRes.ok)
          throw new Error(`HTTP ${orgsRes.status} loading organizations`);

        const scopedData = (await scopedRes.json()) as ScopedData;
        const orgsData = (await orgsRes.json()) as OrgsData;

        setData({
          organizations: orgsData.organizations,
          tools: orgsData.tools,
          mcp: scopedData.mcp,
          skills: scopedData.skills ?? [],
          plugins: scopedData.plugins ?? [],
          agents: scopedData.agents ?? [],
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [dir, id]);

  return { data, error, loading, notFound };
}

export function useToolRegistryData(toolId: string): ScopedRegistryDataResult {
  return useScopedRegistryData("tools", toolId);
}

export function useOrgRegistryData(orgId: string): ScopedRegistryDataResult {
  return useScopedRegistryData("orgs", orgId);
}
