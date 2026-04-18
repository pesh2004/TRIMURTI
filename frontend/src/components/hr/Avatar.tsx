import { avatarColor, initials } from '@/lib/hr/format'

export function Avatar({
  firstEn,
  lastEn,
  seed,
  size = 28,
}: {
  firstEn?: string | null
  lastEn?: string | null
  seed: string
  size?: number
}) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: avatarColor(seed),
        fontSize: Math.max(10, size * 0.38),
      }}
    >
      {initials(firstEn, lastEn)}
    </div>
  )
}
