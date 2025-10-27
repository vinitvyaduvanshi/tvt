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

/* ---------- Security ---------- */
app.use(
  helmet({
    // allow images/streams to be viewed from your Netlify site
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ---------- CORS (robust allow-list, no false 500s) ---------- */
const normalize = (o) => (o ? o.replace(/\/$/, "").toLowerCase() : o);

const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL, // e.g. https://tvtbook.netlify.app  (NO trailing slash)
    "http://localhost:3000",
    "http://localhost:5500",
  ]
    .filter(Boolean)
    .map(normalize)
);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // allow curl/PowerShell/no-origin
      const ok = allowedOrigins.has(normalize(origin));
      return cb(null, ok);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);
app.options("*", cors());

/* ---------- Parsers ---------- */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

/* ---------- Env ---------- */
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;
const PORT = process.env.PORT || 4000;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in env");
  process.exit(1);
}

/* ---------- Health ---------- */
app.get("/health", (_req, res) => res.send("OK"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ---------- DB + Routes ---------- */
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

/* ---------- Fallback error handler (never leak stack to users) ---------- */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});
