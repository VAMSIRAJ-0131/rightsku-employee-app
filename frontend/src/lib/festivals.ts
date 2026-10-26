// Which festive drawing the Home Holidays card shows for a holiday. Holidays are
// added by HR with free-text names, so the theme is recognised from the name
// (common Indian spellings included). A name that matches nothing gets the
// general festive look, so every holiday HR adds still gets a drawing.

export type FestivalTheme =
  | 'christmas' | 'diwali' | 'holi' | 'eid' | 'harvest' | 'ganesh' | 'dasara' | 'national' | 'gandhi'
  | 'onam' | 'rakhi' | 'newyear-regional' | 'janmashtami' | 'lotus' | 'dove' | 'calm' | 'newyear' | 'generic'

// Checked in order: the first match wins (regional new years before "new year",
// for example). Every keyword matches whole words only, so "holiday" is not Holi.
const RULES: { theme: FestivalTheme; words: string[] }[] = [
  { theme: 'christmas', words: ['christmas', 'xmas', 'x mas'] },
  {
    theme: 'newyear-regional',
    words: ['ugadi', 'yugadi', 'gudi padwa', 'gudhi padwa', 'telugu new year', 'kannada new year', 'marathi new year',
      'tamil new year', 'puthandu', 'vishu', 'cheti chand', 'navreh', 'bengali new year', 'poila boishakh', 'pohela boishakh'],
  },
  {
    theme: 'harvest',
    words: ['sankranti', 'sankranthi', 'makar sankranti', 'pongal', 'lohri', 'bihu', 'baisakhi', 'vaisakhi', 'uttarayan', 'uttarayana'],
  },
  {
    theme: 'diwali',
    words: ['diwali', 'deepavali', 'deepawali', 'divali', 'dhanteras', 'bhai dooj', 'bhaiya dooj', 'bhai duj', 'govardhan',
      'kali puja', 'chhath', 'guru nanak', 'gurpurab', 'gurpurb', 'shivaratri', 'shivratri', 'karthigai', 'deepam'],
  },
  { theme: 'holi', words: ['holi', 'dhulandi', 'dhuleti', 'rangwali', 'rang panchami', 'holika'] },
  { theme: 'calm', words: ['muharram', 'ashura'] },
  {
    theme: 'eid',
    words: ['eid', 'id ul fitr', 'idul fitr', 'id ul zuha', 'id ul adha', 'idul adha', 'idul zuha', 'ramzan', 'ramadan',
      'bakrid', 'bakri id', 'bakri eid', 'milad', 'milad un nabi', 'meelad', 'mawlid', 'shab e barat', 'eid e milad'],
  },
  { theme: 'ganesh', words: ['ganesh', 'ganesha', 'ganapati', 'ganpati', 'vinayaka', 'vinayagar', 'vinayak', 'chaturthi'] },
  {
    theme: 'dasara',
    words: ['dasara', 'dussehra', 'dasera', 'dussera', 'dashain', 'vijayadashami', 'vijaya dashami', 'navratri', 'navaratri',
      'durga', 'durga puja', 'ayudha puja', 'saraswati puja', 'bathukamma', 'maha navami', 'mahanavami', 'maha ashtami'],
  },
  { theme: 'gandhi', words: ['gandhi', 'gandhi jayanti', 'bapu'] },
  {
    theme: 'national',
    words: ['independence', 'republic', 'swatantrata', 'gantantra', 'rajyotsava', 'formation day', 'statehood',
      'maharashtra day', 'gujarat day', 'kerala piravi', 'utkal divas'],
  },
  { theme: 'onam', words: ['onam', 'thiruvonam'] },
  { theme: 'rakhi', words: ['raksha bandhan', 'rakhi', 'rakshabandhan'] },
  { theme: 'janmashtami', words: ['janmashtami', 'janmastami', 'krishna', 'gokulashtami', 'krishnashtami'] },
  { theme: 'lotus', words: ['buddha', 'budh purnima', 'buddha purnima', 'vesak', 'mahavir', 'mahaveer', 'mahavir jayanti'] },
  { theme: 'dove', words: ['good friday', 'easter'] },
  { theme: 'newyear', words: ['new year', 'new years', 'new year s'] },
]

/** Lower case, letters and digits only, single spaces: "Eid-ul-Fitr" → "eid ul fitr". */
function normalise(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** The festive theme for a holiday name, or 'generic' when it isn't recognised. */
export function festivalTheme(name: string): FestivalTheme {
  const text = ` ${normalise(name)} `
  for (const rule of RULES) {
    if (rule.words.some((w) => text.includes(` ${w} `))) return rule.theme
  }
  return 'generic'
}

/** Morning before 12:00, afternoon until 17:00, evening after (same as the greeting). */
export type DayPart = 'morning' | 'afternoon' | 'evening'

export function dayPart(hour: number): DayPart {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
