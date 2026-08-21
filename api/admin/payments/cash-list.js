/**
 * GET /api/admin/payments/cash-list?status=pending|collected|rejected
 * Admin "Cash Payments" management view. Cash payments are ordinary
 * Payment rows with paymentType === "CASH" — this endpoint just filters
 * and totals them for a dedicated admin page, and reuses
 * /api/admin/payments/verify to actually mark one collected/rejected
 * (no separate action endpoint needed).
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

const STATUS_MAP = {
  pending: "UNDER_VERIFICATION",
  collected: "APPROVED",
  rejected: "REJECTED",
};

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;

  const statusParam = req.query && req.query.status;
  const status = STATUS_MAP[statusParam] || null;

  const payments = await prisma.payment.findMany({
    where: { paymentType: "CASH", ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    include: { booking: { select: { bookingId: true, customerName: true, customerPhone: true, customerEmail: true } } },
  });

  const [pendingTotal, collectedTotal] = await Promise.all([
    prisma.payment.aggregate({ where: { paymentType: "CASH", status: "UNDER_VERIFICATION" }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { paymentType: "CASH", status: "APPROVED" }, _sum: { amount: true }, _count: true }),
  ]);

  sendJson(res, 200, {
    success: true,
    payments,
    totals: {
      pendingCount: pendingTotal._count,
      pendingAmount: Number(pendingTotal._sum.amount || 0),
      collectedCount: collectedTotal._count,
      collectedAmount: Number(collectedTotal._sum.amount || 0),
    },
  });
}));
