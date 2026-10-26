// "Looking for your document": three pages (white, folded blue corner, text
// lines) slide up one after another and stack, then start again. Used while
// a payslip or document is being fetched.
export default function DocStackLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center" aria-live="polite">
      <div className="relative h-[150px] w-36 overflow-hidden" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 100 124"
            className="doc-stack absolute left-1/2 top-[24px] h-[116px] w-[94px]"
            style={{ animationDelay: `${i * 0.32}s`, zIndex: i, ['--stack-y' as string]: `${(2 - i) * -9}px` }}
          >
            <path d="M10 2h62l26 26v84a10 10 0 0 1-10 10H10A10 10 0 0 1 0 112V12A10 10 0 0 1 10 2z" fill="#fff" stroke="#b7cdf6" strokeWidth="2" />
            <path d="M72 2v18a8 8 0 0 0 8 8h18z" fill="#dbe7fb" stroke="#b7cdf6" strokeWidth="2" strokeLinejoin="round" />
            <rect x="16" y="42" width="54" height="7" rx="3.5" fill="#7fa6ec" />
            <rect x="16" y="60" width="68" height="6" rx="3" fill="#c9daf8" />
            <rect x="16" y="74" width="60" height="6" rx="3" fill="#c9daf8" />
            <rect x="16" y="88" width="44" height="6" rx="3" fill="#c9daf8" />
          </svg>
        ))}
      </div>
      <p className="mt-3 text-[15px] font-semibold text-ink">{label}</p>
      <span aria-hidden className="mt-2 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="search-dot h-2 w-2 rounded-full bg-royal-600" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </div>
  )
}
