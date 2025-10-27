import express from "express";
import { upload } from "../middleware/upload.js";
import mongoose from "mongoose";
import Seat from "../models/Seat.js";
import Booking from "../models/Booking.js";

const router = express.Router();

/**
 * POST /api/bookings
 * multipart/form-data: email, phone, amount, seats (comma-separated), screenshot (file)
 * Creates a PENDING booking and stores screenshot in GridFS.
 */
router.post("/", upload.single("screenshot"), async (req, res) => {
  try {
    const { email, phone } = req.body;
    const amount = Number(req.body.amount);
    const seatsRaw = String(req.body.seats || "");
    const file = req.file;

    if (!email || !phone || !amount || !seatsRaw || !file) {
      return res.status(400).json({ error: "email, phone, amount, seats, and screenshot are required" });
    }

    const seatLabels = seatsRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // Save screenshot to GridFS
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
    const uploadStream = bucket.openUploadStream(file.originalname, {
      contentType: file.mimetype,
      metadata: { email, phone, seatLabels, amount },
    });

    uploadStream.end(file.buffer);

    uploadStream.on("error", (err) => {
      console.error(err);
      return res.status(500).json({ error: "Failed to upload screenshot" });
    });

    uploadStream.on("finish", async () => {
      try {
        const fileId = uploadStream.id;

        // Create booking document
        const booking = await Booking.create({
          email,
          phone,
          amount,
          seatLabels,
          screenshotFileId: fileId,
          screenshotFilename: file.originalname,
          screenshotMimetype: file.mimetype,
          screenshotSize: file.size,
          status: "pending",
        });

        return res.status(201).json({
          message: "Booking submitted and pending verification",
          bookingId: booking._id,
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to save booking after upload" });
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/bookings/screenshot/:fileId
 * Stream screenshot by GridFS fileId
 */
router.get("/screenshot/:fileId", async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) return res.status(404).json({ error: "File not found" });
    const file = files[0];

    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Content-Disposition", `inline; filename="${file.filename}"`);
    bucket.openDownloadStream(fileId).pipe(res);
  } catch {
    res.status(400).json({ error: "Invalid file id" });
  }
});

/**
 * POST /api/bookings/:id/approve
 * Atomically mark seats occupied and booking approved
 */
router.post("/:id/approve", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bookingId = req.params.id;
    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.status !== "pending") {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: `Booking status is ${booking.status}, cannot approve` });
    }

    // Fetch corresponding seats
    const seats = await Seat.find({ label: { $in: booking.seatLabels } }).session(session);
    const foundLabels = new Set(seats.map(s => s.label));
    const missing = booking.seatLabels.filter(l => !foundLabels.has(l));

    if (missing.length) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: `Seats not found: ${missing.join(", ")}` });
    }

    // Check if already occupied
    const occupied = seats.filter(s => s.status !== "available").map(s => s.label);
    if (occupied.length) {
      await session.abortTransaction(); session.endSession();
      return res.status(409).json({ error: `Seats already occupied: ${occupied.join(", ")}` });
    }

    // ✅ Mark all seats as occupied + link booking ID
    for (const seat of seats) {
      seat.status = "occupied";
      seat.occupiedByBookingId = booking._id;
      await seat.save({ session });
    }

    // ✅ Mark booking as approved
    booking.status = "approved";
    booking.seatIds = seats.map(s => s._id);
    if (req.body?.adminNotes) booking.adminNotes = req.body.adminNotes;
    await booking.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Approved and seats marked as occupied",
      bookingId: booking._id,
      seats: booking.seatLabels,
    });
  } catch (e) {
    console.error(e);
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: "Approve failed" });
  }
});

/**
 * POST /api/bookings/:id/reject
 * Mark booking as REJECTED (does not touch seats)
 */
router.post("/:id/reject", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.status !== "pending")
      return res.status(400).json({ error: `Booking status is ${booking.status}, cannot reject` });

    booking.status = "rejected";
    if (req.body?.adminNotes) booking.adminNotes = req.body.adminNotes;
    await booking.save();

    res.json({ message: "Booking rejected", bookingId: booking._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Reject failed" });
  }
});

export default router;
