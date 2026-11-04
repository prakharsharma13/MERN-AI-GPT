import express from "express";
import {
  getPlans,
  purchasePlan,
  verifyPurchase,
} from "../controllers/creditController.js";
import { protect } from "../middlewares/auth.js";

const creditRouter = express.Router();

creditRouter.get("/plan", getPlans);
creditRouter.post("/purchase", protect, purchasePlan);
creditRouter.post("/verify", protect, verifyPurchase);

export default creditRouter;