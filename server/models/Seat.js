import mongoose from "mongoose";

const SeatSchema = new mongoose.Schema({
  label: { type: String, required: true, unique: true }, // e.g. A5
  row: { type: String, required: true },                 // e.g. A
  number: { type: Number, required: true },              // e.g. 5
  type: {                                                // primary or premium
    type: String,
    enum: ["primary", "premium"],
    required: true
  },
  status: { type: String, enum: ["available", "occupied"], default: "available" },
  occupiedByBookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" }
});

export default mongoose.model("Seat", SeatSchema);
