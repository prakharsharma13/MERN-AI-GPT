import mongoose from "mongoose";

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
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

  try {
    await mongoose.connect(uri, { dbName: "quickgpt" });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    throw error;
  }
};

export default connectDB;

