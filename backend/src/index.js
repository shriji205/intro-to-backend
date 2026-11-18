import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/database.js";
import User from "./models/user.model.js";

const startServer = async () => {
  try {
    const port = Number(process.env.PORT || 4000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("PORT must be an integer between 1 and 65535.");
    }

    await connectDB();
    // Wait for username/email unique indexes before accepting registrations.
    await User.init();

    const server = app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });

    server.on("error", async (error) => {
      console.error(error.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Stop the other server or change PORT.`
        : "The HTTP server could not start.");
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
  } catch (error) {
    if (error.code === 11000) {
      console.error("Startup failed: existing duplicate users prevent unique indexes. Remove duplicates in Atlas.");
    } else if (error.message === "PORT must be an integer between 1 and 65535.") {
      console.error(error.message);
    } else {
      console.error("Startup failed. Check the database configuration, Atlas permissions, and unique indexes.");
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

startServer();
