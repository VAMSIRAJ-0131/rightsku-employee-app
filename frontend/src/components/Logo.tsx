// The official RIGHTSKU logo (arrow-and-circle mark, wordmark and
// "Redefining Growth" tagline). Every screen uses this one component and the
// single shared file in src/assets, so the logo only ever needs replacing there.
//
// The PNG has a transparent background and a thin dark outline, so it is
// designed to sit on white or light surfaces, not on navy.
import logoUrl from '../assets/rightsku-logo.png'

/** Natural size of the source image (817 x 221). Used to keep the aspect ratio. */
const LOGO_WIDTH = 817
const LOGO_HEIGHT = 221

/**
 * Pass a height class (for example "h-9 sm:h-10"). The width follows
 * automatically, so the logo is never stretched or cropped.
 */
export function Logo({ className = 'h-9' }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="RIGHTSKU, Redefining Growth"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      draggable={false}
      decoding="async"
      className={`block w-auto max-w-full select-none object-contain ${className}`}
    />
  )
}
