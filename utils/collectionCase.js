const { differenceInCalendarDays } = require("date-fns");
const { getCollectionPolicy } = require("./loanTypeRules");

const toNumber = (value) => Number(value || 0);
const round2 = (value) => Number(toNumber(value).toFixed(2));

const getCollectionBucket = (dpd, rules = null) => {
  const policy = getCollectionPolicy(rules);
  if (dpd <= 0) return "CURRENT";
  if (dpd <= 30) return "0-30";
  if (dpd <= 60) return "31-60";
  if (dpd < policy.legalActionDpd) return "61-90";
  if (dpd >= policy.writeOffEligibleDpd) return "WRITE_OFF";
  if (dpd >= policy.settlementEligibleDpd) return "SETTLEMENT";
  if (dpd >= policy.legalActionDpd) return "LEGAL";
  return "90+";
};

const getCollectionPriority = (dpd, bucket = null) => {
  if (["LEGAL", "SETTLEMENT", "WRITE_OFF"].includes(bucket)) return "CRITICAL";
  if (dpd > 90) return "CRITICAL";
  if (dpd > 60) return "HIGH";
  if (dpd > 30) return "MEDIUM";
  return "LOW";
};

const buildCollectionSummaryFromEmis = (emis, today = new Date(), rules = null) => {
  if (!Array.isArray(emis) || emis.length === 0) {
    return {
      dpd: 0,
      bucket: "CURRENT",
      priority: "LOW",
      overdueEmiCount: 0,
      overdueAmount: 0,
      overdueFineAmount: 0,
      totalDue: 0,
      oldestDueDate: null,
    };
  }

  const sorted = [...emis].sort((a, b) => new Date(a.paymentFor) - new Date(b.paymentFor));
  const oldestDueDate = new Date(sorted[0].paymentFor);
  const dpd = Math.max(differenceInCalendarDays(today, oldestDueDate), 0);

  let overdueAmount = 0;
  let overdueFineAmount = 0;

  for (const emi of sorted) {
    const totalDue = Math.max(toNumber(emi.emiPayAmount) - (toNumber(emi.amountPaidSoFar) - toNumber(emi.finePaid)), 0);
    overdueAmount += round2(totalDue);
    overdueFineAmount += round2(emi.fineAmount || 0) - round2(emi.finePaid || 0);
  }

  overdueFineAmount = Math.max(round2(overdueFineAmount), 0);
  overdueAmount = round2(overdueAmount);

  return {
    dpd,
    bucket: getCollectionBucket(dpd, rules),
    priority: getCollectionPriority(dpd, getCollectionBucket(dpd, rules)),
    overdueEmiCount: sorted.length,
    overdueAmount,
    overdueFineAmount,
    totalDue: round2(overdueAmount + overdueFineAmount),
    oldestDueDate,
  };
};

module.exports = {
  buildCollectionSummaryFromEmis,
  getCollectionBucket,
  getCollectionPriority,
};
