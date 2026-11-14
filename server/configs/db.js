import mongoose from "mongoose";

const formatMongoURI = (rawUri) => {
  if (rawUri.includes("/quickgpt")) return rawUri;
  const [base, query] = rawUri.split("?");
  const cleanBase = base.replace(/\/+$/, "");
  return query ? `${cleanBase}/quickgpt?${query}` : `${cleanBase}/quickgpt`;
};

const connectDB = async () => {
  const rawUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!rawUri) {
    throw new Error("MONGODB_URI environment variable is not defined");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  mongoose.connection.on("connected", () =>
    console.log("Database connected")
  );

  mongoose.connection.on("error", (err) =>
    console.error("Database connection error:", err.message)
  );

  mongoose.connection.on("disconnected", () =>
    console.warn("Database disconnected")
  );

  const connectionString = formatMongoURI(rawUri);

  try {
    await mongoose.connect(connectionString);
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    throw error;
  }
};

export default connectDB;

