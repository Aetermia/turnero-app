import { db } from "./index";
import { events } from "./schema";

/**
 * Development seed. Inserts a few published events so the public catalog has
 * something to render. Idempotent and non-destructive: it does nothing if the
 * events table already has rows.
 */

function atHourInDays(days: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

const seedEvents = [
  {
    title: "Taller de acuarela para principiantes",
    theme: "Pintura",
    description:
      "Una tarde para perderle el miedo al agua y al color. Incluye todos los materiales.",
    location: "Salón principal",
    startsAt: atHourInDays(7, 18),
    endsAt: atHourInDays(7, 20),
    capacity: 12,
    price: "15000.00",
    isPublished: true,
  },
  {
    title: "Círculo de escritura creativa",
    theme: "Escritura",
    description:
      "Ejercicios disparadores y lectura en voz alta. No hace falta experiencia previa.",
    location: "Sala de lectura",
    startsAt: atHourInDays(12, 19),
    endsAt: atHourInDays(12, 21),
    capacity: 10,
    price: "12000.00",
    isPublished: true,
  },
  {
    title: "Charla: cocina sin TACC en casa",
    theme: "Charla",
    description:
      "Contaminación cruzada, compras seguras y recetas simples para todos los días.",
    location: "Salón principal",
    startsAt: atHourInDays(20, 18),
    endsAt: atHourInDays(20, 20),
    capacity: 25,
    price: "8000.00",
    isPublished: true,
  },
  {
    title: "Taller de cerámica (borrador)",
    theme: "Cerámica",
    description: "Evento de ejemplo sin publicar, para probar que no aparece en el catálogo.",
    location: "Taller",
    startsAt: atHourInDays(30, 17),
    endsAt: atHourInDays(30, 20),
    capacity: 8,
    price: "20000.00",
    isPublished: false,
  },
];

async function seed() {
  const existing = await db.select({ id: events.id }).from(events).limit(1);

  if (existing.length > 0) {
    console.log("Seed skipped: the events table already has rows.");
    return;
  }

  const inserted = await db.insert(events).values(seedEvents).returning({
    title: events.title,
    isPublished: events.isPublished,
  });

  console.log(`Seed complete: ${inserted.length} events inserted.`);
  for (const event of inserted) {
    console.log(`  - ${event.title}${event.isPublished ? "" : " (draft)"}`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
