import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 1,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
      // bcrypt only uses the first 72 bytes of a password.
      validate: {
        validator: (value) => Buffer.byteLength(value, "utf8") <= 72,
        message: "Password must be at most 72 UTF-8 bytes.",
      },
    },
  },
  { timestamps: true },
);

// Use a regular function because Mongoose supplies the document as `this`.
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (submittedPassword) {
  return bcrypt.compare(submittedPassword, this.password);
};

// Defense in depth: even explicitly selected hashes are removed from JSON.
userSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    delete returnedObject.password;
    return returnedObject;
  },
});

const User = mongoose.model("User", userSchema);

export default User;
