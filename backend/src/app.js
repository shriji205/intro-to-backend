import express from "express";
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";

const app = express();

app.use(express.json({ limit: "100kb" }));

// Reject arrays and other unexpected body shapes before controllers destructure.
app.use((req, res, next) => {
  if (["POST", "PATCH", "PUT"].includes(req.method)) {
    if (!req.is("application/json")) {
      return res.status(400).json({ message: "Send Content-Type: application/json and a JSON object body." });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object." });
    }
  }
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({ message: "Backend is running successfully" });
});

app.use("/api/v1/users", userRouter);
app.use("/api/v1/posts", postRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

// Express recognizes error middleware by its four arguments.
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body. Check quotes, commas, and braces." });
  }
  if (error.type === "entity.too.large") {
    return res.status(400).json({ message: "JSON body must not exceed 100 KB." });
  }
  return res.status(500).json({ message: "An unexpected server error occurred." });
});

export default app;
