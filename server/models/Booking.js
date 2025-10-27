import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema(
  {
    email: {
      type: String, required: true, trim: true, lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    phone: {
      type: String, required: true, trim: true,
      // India-centric default; adjust as needed
      match: /^(\+?91)?[6-9]\d{9}$|^\d{10}$/
    },
    amount: { type: Number, required: true, min: 1 },

    // Original seat labels from user input (e.g., ["A5","A6"])
    seatLabels: { type: [String], required: true },

    // Resolved seat ObjectIds (filled on approve)
    seatIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Seat" }],

    screenshotFileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    screenshotFilename: String,
    screenshotMimetype: String,
    screenshotSize: Number,

    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    adminNotes: String
  },
  { timestamps: true }
);

export default mongoose.model("Booking", BookingSchema);
