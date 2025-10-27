import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

import seatsRouter from "./routes/seats.js";
import bookingsRouter from "./routes/bookings.js";

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const { MONGODB_URI, DB_NAME, PORT = 4000 } = process.env;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log("MongoDB connected");

    app.get("/", (_req, res) => res.send("Auditorium Booking API OK"));

    app.use("/api/seats", seatsRouter);
    app.use("/api/bookings", bookingsRouter);

    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Mongo connection error:", err);
    process.exit(1);
  });
