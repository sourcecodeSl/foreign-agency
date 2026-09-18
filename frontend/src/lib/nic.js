/**
 * Sri Lankan NIC numbers, mirroring App\Support\Nic on the server.
 *
 * Old format: YY DDD SSS C + V/X. New format: YYYY DDD SSSS C. DDD is the day
 * of the year, plus 500 for a woman, counted as if February always had 29
 * days - so day 60 is 29 February and a normal year skips it.
 */
const MONTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The date of birth as YYYY-MM-DD, or null when the NIC does not hold one. */
export function nicBirthDate(nic) {
  const value = String(nic || '')
    .replace(/\s+/g, '')
    .toUpperCase();

  let year;
  let day;
  let m = value.match(/^(\d{2})(\d{3})\d{4}[VX]$/);
  if (m) {
    year = 1900 + Number(m[1]);
    day = Number(m[2]);
  } else if ((m = value.match(/^(\d{4})(\d{3})\d{5}$/))) {
    year = Number(m[1]);
    day = Number(m[2]);
  } else {
    return null;
  }

  if (day > 500) day -= 500;
  if (day < 1 || day > 366) return null;

  let month = 0;
  while (day > MONTHS[month]) {
    day -= MONTHS[month];
    month += 1;
  }

  // 29 February in a year that has none.
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month) return null;

  return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

/** Whole years from a YYYY-MM-DD birthday to today. */
export function ageOn(birthDate, today = new Date()) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}
