import Link from "next/link";
import { loginAdmin } from "./actions";

/*
 * Server Component. The form posts directly to the `loginAdmin` Server Action,
 * so no client JavaScript is required: the pending state is the browser's own
 * form submission and errors come back as an `error` search param.
 *
 * Reads `searchParams`, which blocks prerendering, so it opts into a blocking
 * route (same pattern as the public event pages).
 */
export const instant = false;

const ERROR_MESSAGES: Record<string, string> = {
  credentials: "Usuario o contraseña incorrectos.",
  config:
    "El acceso de administrador todavía no está configurado en el servidor. Revisá las variables de entorno.",
};

const DEFAULT_ERROR = "No pudimos iniciar sesión. Intentá de nuevo.";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? DEFAULT_ERROR)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <section className="rounded-lg border border-brand-100 bg-white p-6">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
          Acceso privado
        </span>
        <h1 className="mt-1 text-2xl font-bold text-brand-900">
          Panel de administración
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ingresá con tu usuario y contraseña para administrar los eventos.
        </p>

        <form action={loginAdmin} className="mt-6 flex flex-col gap-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-ink"
            >
              Usuario
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-ink"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>

          {errorMessage ? (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Ingresar
          </button>
        </form>
      </section>

      <p className="mt-4 text-center text-sm text-ink-soft">
        <Link
          href="/"
          className="font-semibold text-brand-700 hover:underline"
        >
          Volver al sitio
        </Link>
      </p>
    </div>
  );
}
