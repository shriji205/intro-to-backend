import mongoose from "mongoose";
import dns from "node:dns";
import { DB_NAME } from "./constants.js";

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri || !uri.startsWith("mongodb+srv://")) {
      throw new Error("An Atlas connection string is required.");
    }

    if (/[<>]|%3c(?:db_password|password|username|db_username)%3e/i.test(uri)) {
      throw new Error("Replace the Atlas connection string placeholders.");
    }

    // Optional workaround for networks that refuse Atlas SRV DNS lookups.
    // This affects this Node.js process only, not the computer's DNS settings.
    if (process.env.MONGODB_DNS_SERVERS) {
      dns.setServers(process.env.MONGODB_DNS_SERVERS.split(",").map((server) => server.trim()));
    }

    const connection = await mongoose.connect(uri, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`MongoDB connected successfully: ${DB_NAME}`);
    console.log(`MongoDB host: ${connection.connection.host}`);
  } catch (error) {
    let message = "Check your Atlas cluster, connection string, and network access.";

    if (!process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
      message = "Set MONGODB_URI in backend/.env to your Atlas mongodb+srv:// connection string.";
    } else if (/[<>]|%3c(?:db_password|password|username|db_username)%3e/i.test(process.env.MONGODB_URI)) {
      message = "Replace the Atlas username/password placeholders in backend/.env, remove angle brackets, and encode special credential characters.";
    } else if (error.code === 18 || (error.name === "MongoServerError" && /bad auth|authentication failed|authentication failure/i.test(error.message))) {
      message = "Atlas authentication failed. Check your database username and password.";
    } else if (error.name === "MongoParseError") {
      message = "The MongoDB URI is invalid. Check its format and encode special password characters.";
    } else if (["ENOTFOUND", "ENODATA", "ECONNREFUSED", "ETIMEOUT", "ESERVFAIL", "EAI_AGAIN"].includes(error.code)) {
      message = `Atlas DNS lookup failed (${error.code}). Check the cluster hostname and your network's DNS settings.`;
    } else if (error.name === "MongooseServerSelectionError") {
      message = "Atlas could not be reached. Check Network Access, your internet connection, and cluster status.";
    }

    // Do not print the connection string or raw errors containing credentials.
    console.error(`MongoDB connection failed: ${message}`);

    // The caller must stop startup instead of starting a server without a database.
    throw new Error("Database startup failed. Fix the configuration and try again.");
  }
};

export default connectDB;
