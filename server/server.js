import express from "express";
import "dotenv/config";
import cors from "cors";
import connectDB from "./configs/db.js";
import userRouter from "./routes/userRoutes.js";
import chatRouter from "./routes/chatRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import creditRouter from "./routes/creditRoutes.js";
import { stripeWebHooks } from "./controllers/webhooks.js";

const app = express();

//Stripe webhooks

app.post("/api/stripe", express.raw({type: "application/json"}), stripeWebHooks)

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Server is live"));
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/message", messageRouter);
app.use("/api/credit", creditRouter);

const PORT = process.env.PORT || 3000;

try {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
  });
} catch (error) {
  console.error("Failed to connect to MongoDB, exiting:", error.message);
  process.exit(1);
}

export default app;
