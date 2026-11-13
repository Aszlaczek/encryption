/** Builds the `aria-describedby` value for a field with an optional hint and error. */
export function describedBy(id: string, hint: string | undefined, error: string | undefined) {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined
  );
}
