import type { ChangeEvent } from "react"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search bookmarks",
}: SearchInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value)
  }

  return (
    <label className="flex items-center gap-3 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-white/85 px-4 py-3">
      <span className="text-sm text-[var(--color-muted)]">Search</span>
      <input
        className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
        onChange={handleChange}
        placeholder={placeholder}
        value={value}
      />
    </label>
  )
}
