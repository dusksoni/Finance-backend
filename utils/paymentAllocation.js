const { SUPPORTED_ALLOCATION_COMPONENTS, getRepaymentPolicy } = require("./loanTypeRules");

const r2 = (value) => Math.round(Number(value) || 0);

const normalizeComponentOrder = (componentOrder = []) => {
  const normalized = Array.isArray(componentOrder)
    ? componentOrder.map((value) => `${value}`.trim().toUpperCase())
    : [];

  const valid = normalized.filter((value) => SUPPORTED_ALLOCATION_COMPONENTS.includes(value));
  const unique = [...new Set(valid)];

  for (const component of SUPPORTED_ALLOCATION_COMPONENTS) {
    if (!unique.includes(component)) unique.push(component);
  }

  return unique;
};

const getSortedInstallments = (installments = [], rules = null) => {
  const repaymentPolicy = getRepaymentPolicy(rules);
  const sorted = [...installments];

  sorted.sort((left, right) => {
    const byDate = new Date(left.paymentFor) - new Date(right.paymentFor);
    if (byDate !== 0) {
      return repaymentPolicy.dueAllocationOrder === "NEWEST_DUE_FIRST" ? -byDate : byDate;
    }
    return `${left.id}`.localeCompare(`${right.id}`);
  });

  return sorted;
};

const distributeAcrossComponents = ({
  amount,
  balances = {},
  componentOrder = SUPPORTED_ALLOCATION_COMPONENTS,
}) => {
  const paid = {
    FINE: 0,
    INTEREST: 0,
    PRINCIPAL: 0,
  };

  let remaining = r2(amount);

  for (const component of normalizeComponentOrder(componentOrder)) {
    if (remaining <= 0) break;
    const due = Math.max(r2(balances[component] || 0), 0);
    if (due <= 0) continue;
    const applied = Math.min(remaining, due);
    paid[component] = r2(applied);
    remaining = r2(remaining - applied);
  }

  return {
    paid,
    usedAmount: r2(amount - remaining),
    remainingAmount: remaining,
  };
};

module.exports = {
  distributeAcrossComponents,
  getSortedInstallments,
  normalizeComponentOrder,
};
