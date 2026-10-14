/*
 * The reservation terms the person accepts before holding a seat. They only
 * describe how the system already behaves (hold timer, manual review, data
 * use), so the checkbox points at something real and readable.
 */
export function ReservationTerms({ holdMinutes }: { holdMinutes: number }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-ink-soft">
      <li>
        Al enviar este formulario te guardamos el lugar por {holdMinutes}{" "}
        minutos. Si en ese plazo no subís el comprobante, el lugar se libera
        solo.
      </li>
      <li>
        Se abona el total del evento por transferencia, al alias que te
        mostramos en el paso siguiente.
      </li>
      <li>
        La reserva queda confirmada cuando revisamos tu comprobante. Te avisamos
        por WhatsApp.
      </li>
      <li>
        Si no podemos verificar la transferencia, la reserva se rechaza y nos
        comunicamos con vos para resolverlo.
      </li>
      <li>
        Si no podés asistir, escribinos por WhatsApp lo antes posible y lo vemos
        juntos.
      </li>
      <li>
        Usamos tus datos solo para gestionar la reserva y contactarte. Lo que
        nos cuentes sobre tu salud se usa únicamente para cuidarte durante el
        evento: no se comparte con terceros ni se usa para publicidad (Ley
        25.326). Podés pedirnos que los borremos cuando quieras.
      </li>
    </ul>
  );
}
