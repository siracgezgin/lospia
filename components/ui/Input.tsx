import { cn } from "@/lib/utils/cn";

/**
 * Input / Textarea / Field — the canonical form primitives. Brand-toned focus
 * ring (not the ad-hoc blue-500 seen in older forms), consistent height, and a
 * shared label/helper/error pattern via <Field>.
 */

const CONTROL =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink " +
  "placeholder:text-subtle transition-colors " +
  "focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 " +
  "disabled:opacity-50 disabled:bg-surface-sunken";

const CONTROL_ERROR =
  "border-danger focus:border-danger focus:ring-danger/25";

export function Input({
  className,
  invalid = false,
  ...rest
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL, "h-9", invalid && CONTROL_ERROR, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  invalid = false,
  ...rest
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(CONTROL, "py-2 min-h-[4.5rem]", invalid && CONTROL_ERROR, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({
  className,
  invalid = false,
  children,
  ...rest
}: React.ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      className={cn(CONTROL, "h-9", invalid && CONTROL_ERROR, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Label + control + helper/error wrapper. Error replaces helper when set. */
export function Field({
  label,
  helper,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  helper?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-muted">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11.5px] text-danger">{error}</p>
      ) : helper ? (
        <p className="text-[11.5px] text-subtle">{helper}</p>
      ) : null}
    </div>
  );
}
