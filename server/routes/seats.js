import express from "express";
import Seat from "../models/Seat.js";

const router = express.Router();

/**
 * Helper: infer seat type (primary/premium) from row letter
 * Default rule: A–J = primary, K–T = premium
 */
function rowToType(row) {
  const premiumRows = new Set(["K","L","M","N","O","P","Q","R","S","T"]);
  return premiumRows.has(String(row).toUpperCase()) ? "premium" : "primary";
}

/**
 * GET /api/seats
 * List all seats with key fields for UI/admin
 */
router.get("/", async (_req, res) => {
  const seats = await Seat.find(
    {},
    { _id: 0, label: 1, status: 1, row: 1, number: 1, type: 1, occupiedByBookingId: 1 }
  )
    .sort({ row: 1, number: 1 })
    .lean();

  res.json(seats);
});

/**
 * GET /api/seats/:label
 * Fetch a single seat by label (e.g., A1)
 */
router.get("/:label", async (req, res) => {
  const label = String(req.params.label).toUpperCase();
  const seat = await Seat.findOne({ label }).lean();
  if (!seat) return res.status(404).json({ error: "Seat not found" });
  res.json(seat);
});

/**
 * POST /api/seats/init
 * Initialize or upsert seats with full schema (label,row,number,type,status).
 *
 * Body (optional):
 * {
 *   "rows": ["A","B",...,"T"],   // defaults to A–T
 *   "perRow": 20                 // default 20
 * }
 *
 * Notes:
 * - Uses upsert so running it again is safe.
 * - Preserves existing status; only sets status on insert.
 * - Always (re)sets row/number/type to keep schema consistent.
 */
router.post("/init", async (req, res) => {
  // Defaults: A–T rows, 20 per row (400 seats)
  const defaultRows = "ABCDEFGHIJKLMNOPQRST".split("");
  const rows = Array.isArray(req.body?.rows) && req.body.rows.length
    ? req.body.rows.map(r => String(r).toUpperCase())
    : defaultRows;

  const perRow = Number.isInteger(req.body?.perRow) && req.body.perRow > 0
    ? req.body.perRow
    : 20;

  const bulk = [];
  for (const r of rows) {
    const seatType = rowToType(r);
    for (let n = 1; n <= perRow; n++) {
      const label = `${r}${n}`;
      bulk.push({
        updateOne: {
          filter: { label },
          update: {
            // keep schema fields authoritative every run
            $set: { row: r, number: n, type: seatType, label },
            // only set status/occupiedByBookingId when inserting new docs
            $setOnInsert: { status: "available", occupiedByBookingId: null }
          },
          upsert: true
        }
      });
    }
  }

  if (bulk.length) {
    await Seat.bulkWrite(bulk, { ordered: false });
  }

  const total = await Seat.countDocuments();
  res.json({ message: "Seats initialized/upserted", total });
});

/**
 * PATCH /api/seats/:label/occupy
 * Manually mark a seat occupied (quick admin helper)
 */
router.patch("/:label/occupy", async (req, res) => {
  const label = String(req.params.label).toUpperCase();
  const seat = await Seat.findOneAndUpdate(
    { label },
    { $set: { status: "occupied" } },
    { new: true }
  );
  if (!seat) return res.status(404).json({ error: "Seat not found" });
  res.json({ message: `${label} marked as occupied`, seat });
});

/**
 * PATCH /api/seats/:label/release
 * Manually mark a seat available again
 */
router.patch("/:label/release", async (req, res) => {
  const label = String(req.params.label).toUpperCase();
  const seat = await Seat.findOneAndUpdate(
    { label },
    { $set: { status: "available", occupiedByBookingId: null } },
    { new: true }
  );
  if (!seat) return res.status(404).json({ error: "Seat not found" });
  res.json({ message: `${label} released to available`, seat });
});

export default router;
