const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

const DEFAULT_CHECKLIST_ITEMS = [
  { key: "KYC_VERIFIED", label: "KYC Verification Complete", blocking: true, checked: false },
  { key: "INCOME_PROOF", label: "Income Proof Collected", blocking: true, checked: false },
  { key: "CONSENT_SIGNED", label: "Loan Agreement / Consent Signed", blocking: true, checked: false },
  { key: "NACH_REGISTERED", label: "NACH Mandate Registered", blocking: false, checked: false },
  { key: "INSURANCE_DONE", label: "Insurance Completed", blocking: false, checked: false },
  { key: "LEGAL_CLEAR", label: "Legal / Background Check Clear", blocking: true, checked: false },
  { key: "DISBURSAL_APPROVED", label: "Disbursal Approved by Authority", blocking: true, checked: false },
];

exports.createChecklist = async (req, res) => {
  try {
    const { loanId, items } = req.body;

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const checklistItems = items || DEFAULT_CHECKLIST_ITEMS;

    const checklist = await prisma.disbursalChecklist.create({
      data: { loanId, items: checklistItems },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "DISBURSAL_CHECKLIST_CREATED", table: "DisbursalChecklist", targetId: checklist.id, metadata: { loanId } });
    res.status(201).json({ message: "Checklist created", data: checklist });
  } catch (err) {
    res.status(500).json({ error: "Failed to create checklist", message: err.message });
  }
};

exports.getChecklist = async (req, res) => {
  try {
    const checklist = await prisma.disbursalChecklist.findUnique({
      where: { loanId: req.params.loanId },
    });
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });
    res.json({ data: checklist });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch checklist" });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { key, checked, checkedBy } = req.body;

    const checklist = await prisma.disbursalChecklist.findUnique({ where: { loanId } });
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    const items = checklist.items.map((item) => {
      if (item.key === key) {
        return { ...item, checked, checkedAt: checked ? new Date().toISOString() : null, checkedBy: checked ? (checkedBy || req.user.adminId || req.user.employeeId) : null };
      }
      return item;
    });

    const allBlockingCleared = items.filter((i) => i.blocking).every((i) => i.checked);
    const readyForDisbursal = allBlockingCleared;

    const updated = await prisma.disbursalChecklist.update({
      where: { loanId },
      data: {
        items,
        allBlockingCleared,
        readyForDisbursal,
        ...(readyForDisbursal && !checklist.readyForDisbursal
          ? { clearedByAdminId: req.user.adminId, clearedByEmployeeId: req.user.employeeId, clearedAt: new Date() }
          : {}),
      },
    });

    res.json({ message: "Checklist item updated", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update checklist item", message: err.message });
  }
};
