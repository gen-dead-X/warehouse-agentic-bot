import type { ApiEnvelope } from "../types/chat";
import type { Warehouse } from "../types/warehouse";

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Request failed with status ${response.status}`;
}

export async function listWarehouses(
  baseUrl: string,
  token: string,
): Promise<Warehouse[]> {
  const response = await fetch(`${baseUrl}/warehouse/get-warehouses`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const json = (await response.json()) as ApiEnvelope<Warehouse[]>;
  return json.data;
}
