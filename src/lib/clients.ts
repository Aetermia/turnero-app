import { desc, eq, ilike, max, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, reservations, OCCUPYING_STATUSES } from "@/db/schema";
import { effectiveStatusSql } from "@/lib/reservations";
import type { AdminClientFilters } from "@/lib/reservation-admin-schema";
import { formatDateTime } from "@/lib/format";

/**
 * One row of the client list: contact data (what the owner reaches the person
 * through, including the T11 WhatsApp deep link) plus what that person
 * reserved.
 *
 * Health data and marketing consent are deliberately NOT selected here (Ley
 * 25.326): the list and the CSV are the owner's Rolodex, and the sensitive
 * field belongs behind the reservation detail page, same rule as the
 * reservations list.
 */
export type AdminClientListItem = {
  id: string;
  fullName: string;
  email: string;
  whatsapp: string;
  totalReservations: number;
  activeReservations: number;
  lastReservationAt: Date | null;
};

/**
 * Escapes the LIKE metacharacters in a user term so it matches literally under
 * Postgres' default backslash escape. A typed `%` or `_` must never act as a
 * wildcard (one `%` would otherwise list every client); the escaped term is
 * handed to ILIKE as a bound parameter, never interpolated raw.
 */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Clients for the panel, one row per customer, ordered by their most recent
 * reservation (newest activity first). Only customers with at least one
 * reservation appear: the list is built on an inner join, like every other
 * admin surface.
 *
 * `activeReservations` reuses the system's seat-holding rule through
 * `effectiveStatusSql`, so the hold timer folds into the count: an overdue
 * `pending_no_receipt` reads as `expired` there and stops counting. Drizzle
 * expands an interpolated array into `( $1, $2, $3 )` (see
 * SQL.buildQueryFromSourceParams), so passing OCCUPYING_STATUSES straight in
 * keeps every enum value a bound parameter.
 */
export async function listClientsForAdmin(
  filters: AdminClientFilters,
): Promise<AdminClientListItem[]> {
  const search = filters.search;

  let searchCondition: SQL | undefined;
  if (search) {
    const pattern = `%${escapeLikeTerm(search)}%`;
    searchCondition = or(
      ilike(customers.fullName, pattern),
      ilike(customers.email, pattern),
      ilike(customers.whatsapp, pattern),
    );
  }

  return db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      whatsapp: customers.whatsapp,
      totalReservations: sql<number>`count(*)::int`,
      activeReservations: sql<number>`(count(*) filter (where ${effectiveStatusSql} in ${OCCUPYING_STATUSES}))::int`,
      lastReservationAt: max(reservations.createdAt),
    })
    .from(customers)
    .innerJoin(reservations, eq(reservations.customerId, customers.id))
    .where(searchCondition)
    .groupBy(customers.id, customers.fullName, customers.email, customers.whatsapp)
    .orderBy(desc(max(reservations.createdAt)));
}

/** Always quoted with `"` and inner quotes doubled, so comma/quote/newline cannot break a row. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** The six CSV columns, in the order the owner expects when opening Excel. */
const CSV_HEADER = [
  "Nombre",
  "Email",
  "WhatsApp",
  "Reservas totales",
  "Reservas activas",
  "Última reserva",
];

/**
 * Pure CSV export: UTF-8 with a BOM so Excel opens the accents right, CRLF row
 * endings, a trailing newline, and every field quoted (inner quotes doubled).
 * Dates go through `formatDateTime`; a client with no reservation renders an
 * empty date field.
 */
export function toClientsCsv(rows: AdminClientListItem[]): string {
  const lines = [CSV_HEADER.map(csvField).join(",")];

  for (const row of rows) {
    lines.push(
      [
        csvField(row.fullName),
        csvField(row.email),
        csvField(row.whatsapp),
        csvField(String(row.totalReservations)),
        csvField(String(row.activeReservations)),
        csvField(row.lastReservationAt ? formatDateTime(row.lastReservationAt) : ""),
      ].join(","),
    );
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}