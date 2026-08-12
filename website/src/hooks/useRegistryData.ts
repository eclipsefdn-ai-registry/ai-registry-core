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

interface ToolRegistryDataResult extends RegistryDataResult {
  notFound: boolean;
}

interface OrgsData {
  organizations: RegistryData["organizations"];
  tools: RegistryData["tools"];
}

interface ToolData {
  mcp: RegistryData["mcp"];
  skills: RegistryData["skills"];
  plugins: RegistryData["plugins"];
  agents: RegistryData["agents"];
}

export function useToolRegistryData(toolId: string): ToolRegistryDataResult {
  const [data, setData] = useState<RegistryData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.BASE_URL + "api/v1/";

    Promise.all([
      fetch(base + "tools/" + encodeURIComponent(toolId) + ".json"),
      fetch(base + "organizations.json"),
    ])
      .then(async ([toolRes, orgsRes]) => {
        if (toolRes.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!toolRes.ok) throw new Error(`HTTP ${toolRes.status}`);
        if (!orgsRes.ok)
          throw new Error(`HTTP ${orgsRes.status} loading organizations`);

        const toolData = (await toolRes.json()) as ToolData;
        const orgsData = (await orgsRes.json()) as OrgsData;

        setData({
          organizations: orgsData.organizations,
          tools: orgsData.tools,
          mcp: toolData.mcp,
          skills: toolData.skills ?? [],
          plugins: toolData.plugins ?? [],
          agents: toolData.agents ?? [],
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [toolId]);

  return { data, error, loading, notFound };
}

interface OrgRegistryDataResult extends RegistryDataResult {
  notFound: boolean;
}

// Same shape as ToolData: the per-org file carries full, unstripped install
// configs (see buildOrgEntryView), so no separate type is needed.
type OrgData = ToolData;

export function useOrgRegistryData(orgId: string): OrgRegistryDataResult {
  const [data, setData] = useState<RegistryData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.BASE_URL + "api/v1/";

    Promise.all([
      fetch(base + "orgs/" + encodeURIComponent(orgId) + ".json"),
      fetch(base + "organizations.json"),
    ])
      .then(async ([orgRes, orgsRes]) => {
        if (orgRes.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!orgRes.ok) throw new Error(`HTTP ${orgRes.status}`);
        if (!orgsRes.ok)
          throw new Error(`HTTP ${orgsRes.status} loading organizations`);

        const orgData = (await orgRes.json()) as OrgData;
        const orgsData = (await orgsRes.json()) as OrgsData;

        setData({
          organizations: orgsData.organizations,
          tools: orgsData.tools,
          mcp: orgData.mcp,
          skills: orgData.skills ?? [],
          plugins: orgData.plugins ?? [],
          agents: orgData.agents ?? [],
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [orgId]);

  return { data, error, loading, notFound };
}
