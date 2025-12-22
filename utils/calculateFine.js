import { differenceInDays } from "date-fns";

export function calculateFine(dueDate, pendingPrincipal) {
  const today = new Date();
  const daysLate = Math.max(differenceInDays(today, dueDate), 0);

  if (!pendingPrincipal || isNaN(pendingPrincipal)) {
    return { daysLate: 0, fineAmt: 0, pct: 0 };
  }

  let pct = 0;

  // Fine slabs
  if (daysLate > 7 && daysLate <= 20) {
    pct = 2.5; // 2.5% fine between 8 to 20 days
  } else if (daysLate > 20 && daysLate <= 30) {
    pct = 5; // 5% fine between 21 to 30 days
  } else if (daysLate > 30) {
    const extraMonths = Math.ceil((daysLate - 30) / 30);
    pct = 5 + extraMonths * 5; // 5% + 5% for each month after 30 days
  }

  const fineAmt = parseFloat(
    ((pct / 100) * Number(pendingPrincipal)).toFixed(2)
  );
  return { daysLate, fineAmt, pct };
}