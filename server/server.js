// server/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

import seatsRouter from "./routes/seats.js";
import bookingsRouter from "./routes/bookings.js";

dotenv.config();

const app = express();

// Helmet with CORP relaxed so images/streams can be loaded from Netlify
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ---- CORS allow-list ----
const allowedOrigins = [
  process.env.CLIENT_URL,          // set on Render to your Netlify URL
  "http://localhost:3000",         // local dev (optional)
  "http://localhost:5500"          // opening index.html from file server (optional)
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);             // allow curl/PowerShell
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    }
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const { MONGODB_URI, DB_NAME, PORT = process.env.PORT || 4000 } = process.env;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in env");
  process.exit(1);
}

// Health checks (useful on Render)
app.get("/health", (_req, res) => res.send("OK"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

mongoose
  .connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log("MongoDB connected");

    app.get("/", (_req, res) => res.send("Auditorium Booking API OK"));

    app.use("/api/seats", seatsRouter);
    app.use("/api/bookings", bookingsRouter);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Mongo connection error:", err);
    process.exit(1);
  });
