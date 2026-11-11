import express from "express";
import {
  imageMessageController,
  imageStatusController,
  textMessageController,
} from "../controllers/messageController.js";
import { protect } from "../middlewares/auth.js";

const messageRouter = express.Router();

messageRouter.post("/text", protect, textMessageController);
messageRouter.post("/image", protect, imageMessageController);
messageRouter.post("/image/status", protect, imageStatusController);

export default messageRouter;