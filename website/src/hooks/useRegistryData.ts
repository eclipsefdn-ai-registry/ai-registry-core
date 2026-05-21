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
}

export function useToolRegistryData(toolId: string): ToolRegistryDataResult {
  const [data, setData] = useState<RegistryData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.BASE_URL + "api/v1/";

    Promise.all([
      fetch(base + encodeURIComponent(toolId) + ".json"),
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
