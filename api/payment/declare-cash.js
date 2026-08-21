/**
 * POST /api/payment/declare-cash
 * Body: { token, note? }
 *
 * Cash payment option (customer-facing) — works for BOTH advance and
 * final payment stages, same as the UPI+receipt and gateway options on
 * the same secure /payment/:token page. There's no file to upload here:
 * the customer is telling us they'll pay in person/cash, and an admin
 * confirms collection afterward via the same payment-verification
 * pipeline used for receipts (POST /api/admin/payments/verify) — see
 * that endpoint's admin-side "APPROVE" path, which works identically
 * regardless of paymentType.
 *
 * Payment.status goes to UNDER_VERIFICATION here too (not a separate
 * status) so the exact same admin approve/reject flow, financial
 * recalculation, timeline, and booking-status page all work unchanged.
 * The admin UI distinguishes cash from receipt-based payments via
 * paymentType === "CASH" (no receiptUrl) and labels the action
 * "Confirm Cash Received" instead of "Approve".
 */
const { prisma } = require("../../lib/db");
const { addTimelineEvent } = require("../../lib/timeline");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const { token, note } = await readJsonBody(req);
  if (!token) return sendJson(res, 400, { error: "Missing payment token." });

  const paymentRequest = await prisma.paymentRequest.findUnique({ where: { secureToken: token }, include: { booking: true } });
  if (!paymentRequest) return sendJson(res, 404, { error: "This payment link is invalid." });
  if (paymentRequest.status !== "ACTIVE") return sendJson(res, 410, { error: "This payment link is no longer active." });
  if (paymentRequest.expiresAt && new Date(paymentRequest.expiresAt) < new Date()) {
    await prisma.paymentRequest.update({ where: { id: paymentRequest.id }, data: { status: "EXPIRED" } });
    return sendJson(res, 410, { error: "This payment link has expired. Please contact us for a new one." });
  }

  // Idempotency guard (Part 45): don't create a duplicate declaration on double-click.
  const existingPending = await prisma.payment.findFirst({
    where: { paymentRequestId: paymentRequest.id, status: "UNDER_VERIFICATION" },
  });
  if (existingPending) {
    return sendJson(res, 200, {
      success: true,
      alreadySubmitted: true,
      message: "Your cash payment has already been noted and is awaiting collection.",
    });
  }

  const eventType = paymentRequest.paymentStage === "ADVANCE" ? "ADVANCE_PAYMENT_SUBMITTED" : "FINAL_PAYMENT_SUBMITTED";
  const cashNote = "Customer chose to pay by cash. Awaiting collection by our team.";

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        bookingId: paymentRequest.bookingId,
        paymentStage: paymentRequest.paymentStage,
        paymentType: "CASH",
        amount: paymentRequest.amount,
        status: "UNDER_VERIFICATION",
        paymentRequestId: paymentRequest.id,
        transactionReference: note ? `Customer note: ${String(note).slice(0, 300)}` : null,
        submittedAt: new Date(),
      },
    });

    const overallStatus = paymentRequest.paymentStage === "ADVANCE" ? "ADVANCE_PAYMENT_UNDER_VERIFICATION" : "FINAL_PAYMENT_UNDER_VERIFICATION";
    await tx.booking.update({ where: { id: paymentRequest.bookingId }, data: { paymentStatus: overallStatus } });

    await addTimelineEvent(paymentRequest.bookingId, eventType, {
      tx,
      titleOverride: paymentRequest.paymentStage === "ADVANCE" ? "Advance Payment — Cash Selected" : "Final Payment — Cash Selected",
      descriptionOverride: cashNote,
    });

    return created;
  });

  sendJson(res, 201, {
    success: true,
    message: "Got it — please have the payment ready in cash. Our team will confirm once it's collected.",
    paymentId: payment.id,
  });
});
