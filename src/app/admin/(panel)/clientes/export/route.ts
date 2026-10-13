import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { listClientsForAdmin, toClientsCsv } from "@/lib/clients";
import { parseAdminClientFilters } from "@/lib/reservation-admin-schema";

/*
 * CSV export of the current client list. Reuses the exact same filter parsing
 * and data access as the page, so the download always matches what the owner
 * sees (/admin/clientes?search=… exports that same search).
 *
 * Route handlers are NOT wrapped by the `(panel)` layout, so the layout's
 * session check never runs for this URL. The edge proxy is the front door;
 * this check right here is mandatory defense in depth — without it, an
 * unauthenticated request could still reach the data.
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const url = new URL(request.url);
  const filters = parseAdminClientFilters(
    Object.fromEntries(url.searchParams.entries()),
  );

  const rows = await listClientsForAdmin(filters);
  const csv = toClientsCsv(rows);

  // ASCII date so the filename is safe on every OS/Excel build.
  const filename = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}