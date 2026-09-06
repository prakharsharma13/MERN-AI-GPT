import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  const header = req.headers.authorization || "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : header;
  let userId;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token failed!",
    });
  }
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.json({
        success: false,
        message: "Not authorized, user not found",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("protect: user lookup failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifiying session",
    });
  }
};
