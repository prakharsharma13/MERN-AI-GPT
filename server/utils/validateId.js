import mongoose from "mongoose";

const OBJECT_ID_HEX_REGEX = /^[0-9a-fA-F]{24}$/;

//Require a 24-char hex string so numbers, objects (NoSQL operators), and 12-char strings are rejected
export const isValidObjectIdString = (id) =>
  typeof id === "string" &&
  OBJECT_ID_HEX_REGEX.test(id) &&
  mongoose.isValidObjectId(id);
