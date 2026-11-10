export function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-top"><span>{label}</span><span className="mono">{value}%</span></span>
      <input type="range" min={5} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--pct' as string]: `${((value - 5) / 95) * 100}%` }} />
    </label>
  )
}
