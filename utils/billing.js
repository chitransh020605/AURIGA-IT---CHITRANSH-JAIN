/**
 * Core billing logic for the tiffin service.
 *
 * Rule: tiffin is delivered on weekdays only (Mon-Fri).
 * A customer is billed = planPrice * (deliveredWeekdays / totalWeekdaysInMonth)
 * where deliveredWeekdays excludes:
 *   - days before the subscription started / after it ended or was cancelled
 *   - any weekday that falls inside a pause range (inclusive)
 */

function toDate(str) {
  // str: 'YYYY-MM-DD' -> UTC date at midnight (avoids timezone drift)
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

function isWeekday(date) {
  const day = date.getUTCDay(); // 0 = Sun, 6 = Sat
  return day !== 0 && day !== 6;
}

/** All weekday dates (YYYY-MM-DD) in a given year/month (month is 1-12). */
function weekdaysInMonth(year, month) {
  const days = [];
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCMonth() === month - 1) {
    if (isWeekday(d)) days.push(fmt(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

/** Does a given YYYY-MM-DD date fall inside any pause range? */
function isPaused(dateStr, pauses) {
  return pauses.some((p) => {
    const start = p.start_date;
    const end = p.end_date || '9999-12-31'; // open-ended pause = still paused
    return dateStr >= start && dateStr <= end;
  });
}

/**
 * Compute the pro-rated bill for one subscription for a given month.
 * @param {object} subscription {start_date, end_date, status}
 * @param {number} planPrice
 * @param {Array}  pauses  array of {start_date, end_date}
 * @param {number} year
 * @param {number} month 1-12
 */
function computeBill(subscription, planPrice, pauses, year, month) {
  const allWeekdays = weekdaysInMonth(year, month);
  const totalWeekdays = allWeekdays.length;

  const subStart = subscription.start_date;
  const subEnd = subscription.end_date || '9999-12-31';

  let deliveredCount = 0;
  const deliveredDates = [];
  const pausedDates = [];

  for (const day of allWeekdays) {
    if (day < subStart || day > subEnd) continue; // subscription not active that day
    if (isPaused(day, pauses)) {
      pausedDates.push(day);
      continue;
    }
    deliveredCount++;
    deliveredDates.push(day);
  }

  const perDayRate = totalWeekdays > 0 ? planPrice / totalWeekdays : 0;
  const amount = Math.round(perDayRate * deliveredCount * 100) / 100;

  return {
    year,
    month,
    totalWeekdaysInMonth: totalWeekdays,
    deliveredDays: deliveredCount,
    pausedDays: pausedDates.length,
    perDayRate: Math.round(perDayRate * 100) / 100,
    planPrice,
    amount,
    deliveredDates,
    pausedDates,
  };
}

module.exports = { computeBill, weekdaysInMonth, isPaused, toDate, fmt };
