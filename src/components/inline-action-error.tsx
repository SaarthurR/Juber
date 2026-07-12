export function InlineActionError({
  id,
  error,
  className,
}: {
  id?: string;
  error: string | null | undefined;
  className: string;
}) {
  if (!error) return null;

  return (
    <p id={id} role="alert" className={className}>
      {error}
    </p>
  );
}
