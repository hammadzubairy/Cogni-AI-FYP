/** Bloom level tag matching v7 `bloom(b)`. */
export default function BloomTag({ level }) {
  if (!level) return null
  return <span className={`bloom b-${level}`}>{level}</span>
}
