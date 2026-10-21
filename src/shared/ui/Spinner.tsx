export function Spinner({ inline = false }: { inline?: boolean }) {
  return <div className={`spinner${inline ? ' spinner--inline' : ''}`} role="status" aria-label="Loading" />;
}
