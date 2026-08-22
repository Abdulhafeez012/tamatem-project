/**
 * Renders the messages for one field. Django's password validators can return
 * several at once, so this is deliberately a list rather than a single string.
 */
export function FieldErrors({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null

  return (
    <ul id={id} className="field-error">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}

export function Alert({
  children,
  tone = 'error',
}: {
  children: React.ReactNode
  tone?: 'error' | 'notice'
}) {
  const toneClass =
    tone === 'error'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : 'border-accent/40 bg-accent/10 text-foreground'

  return (
    <p role="alert" className={`border p-3 text-sm ${toneClass}`}>
      {children}
    </p>
  )
}
