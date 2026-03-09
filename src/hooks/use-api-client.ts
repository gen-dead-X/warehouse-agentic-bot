import { useMemo } from "react";
import { getApiClient } from "../api/http-client";

export function useApiClient() {
  const client = useMemo(() => getApiClient(), []);

  return {
    client,
    get: client.get.bind(client),
    post: client.post.bind(client),
    put: client.put.bind(client),
    patch: client.patch.bind(client),
    delete: client.delete.bind(client),
  };
}
