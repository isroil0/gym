import 'server-only';
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { apiPath, callBackend } from './backend';
import { readTokens } from './session';

/**
 * Fetches a page's data on the server so the first paint already has numbers
 * on it instead of a grid of skeletons.
 *
 * Deliberately forgiving: if a call fails — an expired access token, a role
 * that may not read one of the resources — the query is simply left out of
 * the dehydrated cache and the browser fetches it through the proxy, which
 * can refresh the token properly. A dashboard must never fail to render
 * because one panel could not be pre-filled.
 */
export async function prefetch(
  entries: Array<{ key: readonly unknown[]; path: string; query?: Record<string, string | number> }>,
): Promise<QueryClient> {
  const client = new QueryClient();
  const { accessToken } = await readTokens();
  if (!accessToken) return client;

  await Promise.all(
    entries.map(async (entry) => {
      try {
        const search = entry.query
          ? `?${new URLSearchParams(
              Object.entries(entry.query).map(([k, v]) => [k, String(v)]),
            ).toString()}`
          : '';
        const result = await callBackend(apiPath(entry.path), { accessToken, search });
        if (result.status === 200) {
          client.setQueryData(entry.key, result.body);
        }
      } catch {
        /* Left for the client to fetch. */
      }
    }),
  );

  return client;
}

/** Wraps a subtree with a server-prefetched cache. */
export function Hydrate({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  return <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>;
}
