import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // Never loaded unless a query asks for it with .select("+password")
    password: { type: String, required: true, select: false },
    credits: { type: Number, default: 20 },
  },
  {
    toJSON: {
      // Safety net for documents that still hold the hash in memory
      transform: (_doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});


const User = mongoose.model("User", userSchema);

export default User;
